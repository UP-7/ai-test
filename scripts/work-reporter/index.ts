#!/usr/bin/env node
/**
 * work-reporter CLI
 * 
 * 独立运行的分支工作总结生成器
 * 支持精进模式（增量更新）和全量模式
 * 
 * 用法：
 *   npx tsx scripts/work-reporter/index.ts [options]
 * 
 * 选项：
 *   --branch <name>   指定分支名（默认当前分支）
 *   --repo <path>     指定仓库路径（默认当前目录）
 *   --fresh           强制全量重来，忽略旧文档
 *   --no-word         跳过 Word 文档生成
 *   --help            显示帮助
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config, validateConfig, PROJECT_ROOT } from './config';
import {
  getCurrentBranch,
  branchToSlug,
  collectBranchInfo,
  hasNewCommits,
} from './git';
import { analyzeFullBranch, analyzeIncrementalChanges } from './analyzer';
import { loadExistingReport, buildFrontmatter, mergeIncrementalContent } from './merger';
import { generateWordDoc } from './docx-gen';
import { updateKnowledge, buildKnowledgeBlock } from './knowledge';

// ─── 解析命令行参数 ──────────────────────────────────────
interface CliOptions {
  branch?: string;
  repo: string;
  fresh: boolean;
  noWord: boolean;
  help: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    repo: PROJECT_ROOT,
    fresh: false,
    noWord: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--branch':
        opts.branch = args[++i];
        break;
      case '--repo':
        opts.repo = resolve(args[++i]);
        break;
      case '--fresh':
        opts.fresh = true;
        break;
      case '--no-word':
        opts.noWord = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════╗
║         📝 Work Reporter - 分支工作总结         ║
╚══════════════════════════════════════════════════╝

用法：
  npx tsx scripts/work-reporter/index.ts [选项]

选项：
  --branch <name>   指定分支名（默认：当前分支）
  --repo <path>     指定仓库路径（默认：项目根目录）
  --fresh           强制全量重来，忽略旧文档
  --no-word         跳过 Word 文档生成
  --help, -h        显示帮助

示例：
  # 总结当前分支（自动精进）
  npx tsx scripts/work-reporter/index.ts

  # 总结指定分支
  npx tsx scripts/work-reporter/index.ts --branch feature/login

  # 强制全量重新生成
  npx tsx scripts/work-reporter/index.ts --fresh

环境变量（在 .env.local 中配置）：
  LLM_API_KEY       DeepSeek/OpenAI API Key（必填）
  LLM_BASE_URL      API 地址（默认 https://api.deepseek.com）
  LLM_MODEL         模型名（默认 deepseek-chat）
`);
}

// ─── 主流程 ────────────────────────────────────────────────
async function main(): Promise<void> {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    return;
  }

  validateConfig();

  // 确定分支
  const branch = opts.branch || getCurrentBranch(opts.repo);
  if (!branch) {
    console.error('❌ 无法获取当前分支名，请用 --branch 指定');
    process.exit(1);
  }

  const slug = branchToSlug(branch);
  console.log(`\n📌 分支: ${branch}`);
  console.log(`📌 Slug: ${slug}`);

  // 确保输出目录存在
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  // Step 0：精进判定
  const existing = opts.fresh ? null : loadExistingReport(slug);

  if (existing && existing.frontmatter.last_commit) {
    // 检查是否有新 commit
    if (!hasNewCommits(existing.frontmatter.last_commit, opts.repo)) {
      console.log('\n✅ 该分支自上次总结后没有新改动，文档已是最新。');
      console.log(`   📄 ${config.outputDir}/work-report-${slug}.md`);
      console.log(`   📊 第 ${existing.frontmatter.revision} 次精进`);
      return;
    }

    console.log(`\n🔄 精进模式：检测到旧文档（第 ${existing.frontmatter.revision} 次），将进行增量分析...`);
    await runIncremental(branch, slug, existing, opts);
  } else {
    if (opts.fresh && existing) {
      console.log('\n🔄 强制全量模式：忽略旧文档，重新生成...');
    } else {
      console.log('\n🆕 全量模式：首次分析该分支...');
    }
    await runFull(branch, slug, opts);
  }
}

/**
 * 全量分析流程
 */
async function runFull(branch: string, slug: string, opts: CliOptions): Promise<void> {
  // 收集 Git 信息
  console.log('📡 收集 Git 信息...');
  const branchInfo = collectBranchInfo(branch, undefined, opts.repo);
  console.log(`   找到 ${branchInfo.commits.length} 个 commit，${branchInfo.changedFiles.length} 个文件改动`);

  if (branchInfo.commits.length === 0) {
    console.log('⚠️ 没有找到 commit，请确认分支名是否正确');
    return;
  }

  // 调用 LLM 分析
  console.log('🤖 调用 DeepSeek 分析代码变更...');
  const analysis = await analyzeFullBranch(branchInfo);
  console.log('   ✅ 分析完成');

  // 组装完整文档
  const today = new Date().toISOString().split('T')[0];
  const frontmatter = buildFrontmatter({
    branch,
    slug,
    last_commit: branchInfo.latestCommitHash,
    revision: 1,
    created_at: today,
    updated_at: today,
  });

  const fullDoc = `${frontmatter}

> 本文档由 work-reporter 自动生成，基于 Git 分支代码分析
> 最近更新：${today} | 第 1 次生成 | 覆盖 commit: ${branchInfo.commits[branchInfo.commits.length - 1]?.hash.slice(0, 7) || ''}...${branchInfo.latestCommitHash.slice(0, 7)}

${analysis}

## 更新历史
| 版本 | 日期 | 新增 commit | 主要变更 |
|------|------|------------|---------|
| v1 | ${today} | 全量 (${branchInfo.commits.length} commits) | 初次生成 |
`;

  // 写入 Markdown
  const mdPath = resolve(config.outputDir, `work-report-${slug}.md`);
  writeFileSync(mdPath, fullDoc, 'utf-8');
  console.log(`\n📄 Markdown: ${mdPath}`);

  // 生成 Word
  if (!opts.noWord) {
    console.log('📝 生成 Word 文档...');
    const docPath = generateWordDoc(fullDoc, slug);
    console.log(`   📄 Word: ${docPath}`);
  }

  // 更新知识库
  console.log('📚 更新知识库...');
  const knowledgeContent = buildKnowledgeBlock(slug, 1, analysis);
  updateKnowledge(slug, knowledgeContent);
  console.log(`   ✅ 已更新 .requirement-knowledge.md`);

  printDone(slug, 1, branchInfo.commits.length);
}

/**
 * 增量精进流程
 */
async function runIncremental(
  branch: string,
  slug: string,
  existing: NonNullable<ReturnType<typeof loadExistingReport>>,
  opts: CliOptions
): Promise<void> {
  const sinceCommit = existing.frontmatter.last_commit;

  // 收集增量 Git 信息
  console.log('📡 收集增量 Git 信息...');
  const branchInfo = collectBranchInfo(branch, sinceCommit, opts.repo);
  console.log(`   新增 ${branchInfo.commits.length} 个 commit，${branchInfo.changedFiles.length} 个文件改动`);

  if (branchInfo.commits.length === 0) {
    console.log('✅ 没有新的 commit，文档已是最新');
    return;
  }

  // 调用 LLM 增量分析
  console.log('🤖 调用 DeepSeek 增量分析...');
  const incrementalResult = await analyzeIncrementalChanges(branchInfo, existing.body);
  console.log('   ✅ 增量分析完成');

  // 合并内容
  const newRevision = existing.frontmatter.revision + 1;
  const today = new Date().toISOString().split('T')[0];
  const commitRange = `${sinceCommit.slice(0, 7)}..${branchInfo.latestCommitHash.slice(0, 7)}`;

  const mergedBody = mergeIncrementalContent(existing.body, incrementalResult, commitRange);

  // 更新 frontmatter
  const frontmatter = buildFrontmatter({
    ...existing.frontmatter,
    last_commit: branchInfo.latestCommitHash,
    revision: newRevision,
    updated_at: today,
  });

  const fullDoc = `${frontmatter}\n\n${mergedBody}`;

  // 写入 Markdown
  const mdPath = resolve(config.outputDir, `work-report-${slug}.md`);
  writeFileSync(mdPath, fullDoc, 'utf-8');
  console.log(`\n📄 Markdown（已精进）: ${mdPath}`);

  // 生成 Word
  if (!opts.noWord) {
    console.log('📝 生成 Word 文档...');
    const docPath = generateWordDoc(fullDoc, slug);
    console.log(`   📄 Word: ${docPath}`);
  }

  // 更新知识库
  console.log('📚 更新知识库...');
  const knowledgeContent = buildKnowledgeBlock(slug, newRevision, mergedBody);
  updateKnowledge(slug, knowledgeContent);
  console.log(`   ✅ 已更新 .requirement-knowledge.md`);

  printDone(slug, newRevision, branchInfo.commits.length);
}

function printDone(slug: string, revision: number, commitCount: number): void {
  console.log(`
╔══════════════════════════════════════════════════╗
║                ✅ 总结完成！                     ║
╠══════════════════════════════════════════════════╣
║  模式: ${revision === 1 ? '全新生成' : `第 ${revision} 次精进`}${' '.repeat(Math.max(0, 37 - (revision === 1 ? 8 : `第 ${revision} 次精进`.length)))}║
║  分析: ${commitCount} 个 commit${' '.repeat(Math.max(0, 38 - `${commitCount} 个 commit`.length))}║
║  Markdown: work-reports/work-report-${slug}.md${' '.repeat(Math.max(0, 1))}
║  知识库:   .requirement-knowledge.md            ║
╚══════════════════════════════════════════════════╝

下一步：
  • 再做开发后运行本脚本 → 自动增量精进
  • npx tsx scripts/work-reporter/index.ts --fresh → 推倒重来
`);
}

// ─── 启动 ──────────────────────────────────────────────────
main().catch(err => {
  console.error('❌ 执行出错:', err.message || err);
  process.exit(1);
});
