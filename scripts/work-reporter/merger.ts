/**
 * 精进合并模块
 * 读取旧文档 → 解析 frontmatter → 合并增量内容
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from './config';

export interface Frontmatter {
  branch: string;
  slug: string;
  last_commit: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ExistingReport {
  frontmatter: Frontmatter;
  body: string;
  raw: string;
}

/**
 * 尝试读取已有的总结文档
 */
export function loadExistingReport(slug: string): ExistingReport | null {
  const filePath = resolve(config.outputDir, `work-report-${slug}.md`);
  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  return { frontmatter, body, raw };
}

/**
 * 解析 frontmatter
 */
function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const defaultFm: Frontmatter = {
    branch: '',
    slug: '',
    last_commit: '',
    revision: 0,
    created_at: '',
    updated_at: '',
  };

  if (!content.startsWith('---')) {
    return { frontmatter: defaultFm, body: content };
  }

  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) {
    return { frontmatter: defaultFm, body: content };
  }

  const fmBlock = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 3).trim();

  const fm = { ...defaultFm };
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    switch (key) {
      case 'branch': fm.branch = value; break;
      case 'slug': fm.slug = value; break;
      case 'last_commit': fm.last_commit = value; break;
      case 'revision': fm.revision = parseInt(value) || 0; break;
      case 'created_at': fm.created_at = value; break;
      case 'updated_at': fm.updated_at = value; break;
    }
  }

  return { frontmatter: fm, body };
}

/**
 * 生成 frontmatter 字符串
 */
export function buildFrontmatter(fm: Frontmatter): string {
  return `---
branch: ${fm.branch}
slug: ${fm.slug}
last_commit: ${fm.last_commit}
revision: ${fm.revision}
created_at: ${fm.created_at}
updated_at: ${fm.updated_at}
---`;
}

/**
 * 将增量分析结果合并到旧文档
 */
export function mergeIncrementalContent(
  existingBody: string,
  incrementalJson: string,
  newCommitRange: string
): string {
  let incremental: {
    summary_update?: string;
    new_modules?: Array<{
      name: string;
      problem: string;
      solution: string;
      code: string;
      reason: string;
    }>;
    new_highlights?: Array<{
      title: string;
      scenario: string;
      approach: string;
      code: string;
      reusability: string;
    }>;
    new_pitfalls?: Array<{
      title: string;
      symptom: string;
      root_cause: string;
      fix: string;
      code: string;
    }>;
    change_log_entry?: string;
  };

  try {
    // 多种方式尝试提取 JSON
    let jsonStr = incrementalJson.trim();

    // 1. 尝试从 markdown 代码块中提取
    const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    // 2. 尝试找第一个 { 到最后一个 } 之间的内容
    if (!jsonStr.startsWith('{')) {
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace > -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }
    }

    incremental = JSON.parse(jsonStr);
  } catch {
    // 如果 JSON 解析失败，当作纯文本追加（仍然有效，只是没有结构化合并）
    console.warn('⚠️ 增量分析结果不是有效 JSON，将作为原始文本追加');
    return existingBody + '\n\n---\n\n## 本次新增内容\n\n' + incrementalJson;
  }

  let merged = existingBody;

  // 1. 追加新模块到"详细改动与实现"部分
  if (incremental.new_modules?.length) {
    const modulesSection = incremental.new_modules.map(m => `
### ${m.name}

**解决的问题**：${m.problem}

**实现方案**：${m.solution}

**关键代码**：
\`\`\`typescript
${m.code}
\`\`\`

**为什么这样做**：${m.reason}

---`).join('\n');

    // 在"技术实现亮点"之前插入
    const highlightIdx = merged.indexOf('## 技术实现亮点');
    if (highlightIdx > -1) {
      merged = merged.slice(0, highlightIdx) + modulesSection + '\n\n' + merged.slice(highlightIdx);
    } else {
      merged += '\n\n' + modulesSection;
    }
  }

  // 2. 追加新亮点
  if (incremental.new_highlights?.length) {
    const highlightsSection = incremental.new_highlights.map(h => `
### 亮点：${h.title}
**场景**：${h.scenario}
**方案**：${h.approach}
**关键代码**：
\`\`\`typescript
${h.code}
\`\`\`
**可复用性**：${h.reusability}`).join('\n\n');

    const pitfallIdx = merged.indexOf('## 踩坑与解法');
    if (pitfallIdx > -1) {
      merged = merged.slice(0, pitfallIdx) + highlightsSection + '\n\n' + merged.slice(pitfallIdx);
    } else {
      merged += '\n\n## 技术实现亮点\n' + highlightsSection;
    }
  }

  // 3. 追加新踩坑
  if (incremental.new_pitfalls?.length) {
    const pitfallsSection = incremental.new_pitfalls.map(p => `
### 坑：${p.title}
**现象**：${p.symptom}
**根因**：${p.root_cause}
**解法**：${p.fix}
${p.code ? `**代码**：\n\`\`\`typescript\n${p.code}\n\`\`\`` : ''}`).join('\n\n');

    const historyIdx = merged.indexOf('## 更新历史');
    if (historyIdx > -1) {
      merged = merged.slice(0, historyIdx) + pitfallsSection + '\n\n' + merged.slice(historyIdx);
    } else {
      merged += '\n\n## 踩坑与解法\n' + pitfallsSection;
    }
  }

  // 4. 追加更新历史
  const today = new Date().toISOString().split('T')[0];
  const historyEntry = `| v${Date.now()} | ${today} | ${newCommitRange} | ${incremental.change_log_entry || '增量更新'} |`;
  const historyTableIdx = merged.lastIndexOf('|------|------|');
  if (historyTableIdx > -1) {
    const afterTable = merged.indexOf('\n\n', historyTableIdx);
    if (afterTable > -1) {
      merged = merged.slice(0, afterTable) + '\n' + historyEntry + merged.slice(afterTable);
    } else {
      merged += '\n' + historyEntry;
    }
  }

  return merged;
}
