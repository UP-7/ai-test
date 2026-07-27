/**
 * 知识库块化更新模块
 * 按 slug 标记块替换 .requirement-knowledge.md 中的内容
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from './config';

/**
 * 更新知识库：按 slug 块替换
 * 
 * 格式：
 * <!-- BEGIN:report:<slug> -->
 * ...内容...
 * <!-- END:report:<slug> -->
 */
export function updateKnowledge(slug: string, content: string): void {
  const filePath = config.knowledgeFile;
  const beginMarker = `<!-- BEGIN:report:${slug} -->`;
  const endMarker = `<!-- END:report:${slug} -->`;

  const block = `${beginMarker}\n${content}\n${endMarker}`;

  let fileContent = '';
  if (existsSync(filePath)) {
    fileContent = readFileSync(filePath, 'utf-8');
  }

  const beginIdx = fileContent.indexOf(beginMarker);
  const endIdx = fileContent.indexOf(endMarker);

  if (beginIdx > -1 && endIdx > -1) {
    // 找到已有块 → 替换
    fileContent = fileContent.slice(0, beginIdx) + block + fileContent.slice(endIdx + endMarker.length);
  } else {
    // 没找到 → 末尾追加
    fileContent = fileContent.trimEnd() + '\n\n' + block + '\n';
  }

  writeFileSync(filePath, fileContent, 'utf-8');
}

/**
 * 生成知识库内容块
 */
export function buildKnowledgeBlock(
  slug: string,
  revision: number,
  summary: string
): string {
  const today = new Date().toISOString().split('T')[0];

  // 从总结中提取关键信息（精简版）
  const lines = summary.split('\n');
  let title = '未命名需求';
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      break;
    }
  }

  // 提取基本信息、技术亮点部分（知识库用精简版）
  const basicInfoMatch = summary.match(/## 基本信息\n([\s\S]*?)(?=\n## )/);
  const highlightsMatch = summary.match(/## 技术实现亮点\n([\s\S]*?)(?=\n## |$)/);

  return `---
时间戳: ${today}
来源: work-reporter (v${revision})

## 需求名称
${title}

## 基本信息
${basicInfoMatch?.[1]?.trim() || '见详细文档'}

## 核心技术实现
${highlightsMatch?.[1]?.trim() || '见详细文档'}

## 关键词标签
${extractTags(summary)}`;
}

/**
 * 从文档中提取关键词标签
 */
function extractTags(content: string): string {
  const tagMatch = content.match(/## 关键词标签\n(.+)/);
  return tagMatch?.[1]?.trim() || '';
}
