/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Work Reporter Agent
 * 
 * 基于 tool-use 循环的智能工作总结 Agent。
 * LLM 自主决定：收集哪些 Git 信息 → 分析重点 → 组织输出。
 * 不再硬编码步骤顺序。
 */
import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const deepseek = createOpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
});

const MODEL = process.env.LLM_MODEL ?? "deepseek-v4-pro";
const PROJECT_ROOT = process.cwd();

// ========== Agent 内部工具集 ==========

function runGit(args: string, cwd?: string): string {
    try {
        return execSync(`git ${args}`, {
            cwd: cwd || PROJECT_ROOT,
            encoding: "utf-8",
            timeout: 30000,
            maxBuffer: 2 * 1024 * 1024,
        }).trim();
    } catch (e) {
        return `[Git 错误] ${(e as Error).message?.substring(0, 500)}`;
    }
}

// Agent 可用的工具（ai SDK 的 tool() 泛型与 strict 模式不完全兼容，与项目其他 tool 文件保持一致处理）
const agentTools: Record<string, any> = {
    getCurrentBranch: tool({
        description: "获取当前 Git 分支名",
        parameters: z.object({
            repo: z.string().optional().describe("仓库路径，默认当前项目"),
        }),
        execute: async (input: any) => {
            const branch = runGit("branch --show-current", input.repo);
            return { branch };
        },
    }),

    getCommitHistory: tool({
        description: "获取分支的 commit 历史。可以指定范围（如 main..HEAD）或数量",
        parameters: z.object({
            range: z.string().optional().describe("commit 范围，如 'main..HEAD' 或留空取最近 N 条"),
            count: z.number().optional().describe("获取最近 N 条，默认 30"),
            repo: z.string().optional().describe("仓库路径"),
        }),
        execute: async (input: any) => {
            const { range, count, repo } = input;
            const logArgs = range
                ? `log ${range} --format="%h %ad %s" --date=short`
                : `log --max-count=${count || 30} --format="%h %ad %s" --date=short`;
            const log = runGit(logArgs, repo);
            return { commits: log, count: log.split('\n').filter(Boolean).length };
        },
    }),

    getDiffStat: tool({
        description: "获取分支相对于 main 的改动统计（文件数、增删行数）",
        parameters: z.object({
            base: z.string().optional().describe("基准分支，默认 main"),
            repo: z.string().optional().describe("仓库路径"),
        }),
        execute: async (input: any) => {
            const baseBranch = input.base || "main";
            const stat = runGit(`diff ${baseBranch} --stat`, input.repo);
            const nameStatus = runGit(`diff ${baseBranch} --name-status`, input.repo);
            return { stat, changedFiles: nameStatus };
        },
    }),

    getFileDiff: tool({
        description: "获取指定文件相对于 main 的详细 diff。用于深入分析核心文件的具体改动",
        parameters: z.object({
            file: z.string().describe("文件路径"),
            base: z.string().optional().describe("基准分支，默认 main"),
            repo: z.string().optional().describe("仓库路径"),
        }),
        execute: async (input: any) => {
            const baseBranch = input.base || "main";
            const diff = runGit(`diff ${baseBranch} -- "${input.file}"`, input.repo);
            return { file: input.file, diff: diff.substring(0, 6000) };
        },
    }),

    getTopChangedFiles: tool({
        description: "获取改动量最大的前 N 个文件（按增删行数排序）",
        parameters: z.object({
            count: z.number().optional().describe("返回前 N 个，默认 8"),
            base: z.string().optional().describe("基准分支，默认 main"),
            repo: z.string().optional().describe("仓库路径"),
        }),
        execute: async (input: any) => {
            const baseBranch = input.base || "main";
            const numstat = runGit(`diff ${baseBranch} --numstat`, input.repo);
            const lines = numstat.split('\n').filter(Boolean);
            const sorted = lines
                .map((line: string) => {
                    const [add, del, file] = line.split('\t');
                    return { file, changes: (parseInt(add) || 0) + (parseInt(del) || 0) };
                })
                .sort((a: any, b: any) => b.changes - a.changes)
                .slice(0, input.count || 8);
            return { topFiles: sorted };
        },
    }),

    readFileContent: tool({
        description: "读取项目中指定文件的当前内容（用于引用代码片段）",
        parameters: z.object({
            path: z.string().describe("文件路径（相对项目根目录）"),
            startLine: z.number().optional().describe("起始行号"),
            endLine: z.number().optional().describe("结束行号"),
        }),
        execute: async (input: any) => {
            const filePath = input.path;
            const fullPath = resolve(PROJECT_ROOT, filePath);
            if (!fullPath.startsWith(PROJECT_ROOT)) return { error: "路径不合法" };
            if (!existsSync(fullPath)) return { error: "文件不存在" };
            const content = readFileSync(fullPath, "utf-8");
            if (input.startLine && input.endLine) {
                const lines = content.split('\n').slice(input.startLine - 1, input.endLine);
                return { path: filePath, content: lines.join('\n'), lines: `L${input.startLine}-L${input.endLine}` };
            }
            return { path: filePath, content: content.substring(0, 5000) };
        },
    }),

    checkExistingReport: tool({
        description: "检查是否已有该分支的旧报告（用于判断全量/增量）",
        parameters: z.object({
            slug: z.string().describe("分支 slug，如 feature-yanqihuan-test-20260721"),
        }),
        execute: async (input: any) => {
            const slug = input.slug;
            const reportPath = resolve(PROJECT_ROOT, `work-reports/work-report-${slug}.md`);
            if (!existsSync(reportPath)) return { exists: false };
            const content = readFileSync(reportPath, "utf-8");
            const match = content.match(/last_commit:\s*(\w+)/);
            const lastCommit = match?.[1] || null;
            const revMatch = content.match(/revision:\s*(\d+)/);
            const revision = revMatch ? parseInt(revMatch[1]) : 0;
            return { exists: true, lastCommit, revision, bodyPreview: content.substring(0, 2000) };
        },
    }),

    saveReport: tool({
        description: "保存生成的工作总结报告到文件",
        parameters: z.object({
            slug: z.string().describe("分支 slug"),
            content: z.string().describe("完整的 Markdown 报告内容（含 frontmatter）"),
        }),
        execute: async (input: any) => {
            const { slug, content } = input;
            const dir = resolve(PROJECT_ROOT, "work-reports");
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            const mdPath = resolve(dir, `work-report-${slug}.md`);
            writeFileSync(mdPath, content, "utf-8");
            return { saved: true, path: mdPath };
        },
    }),

    updateKnowledge: tool({
        description: "更新知识库文件（.requirement-knowledge.md），按 slug 块替换",
        parameters: z.object({
            slug: z.string().describe("分支 slug"),
            content: z.string().describe("要写入知识库的内容块"),
        }),
        execute: async (input: any) => {
            const { slug, content } = input;
            const knowledgePath = resolve(PROJECT_ROOT, ".requirement-knowledge.md");
            const beginTag = `<!-- BEGIN:report:${slug} -->`;
            const endTag = `<!-- END:report:${slug} -->`;
            const block = `\n${beginTag}\n${content}\n${endTag}\n`;

            if (!existsSync(knowledgePath)) {
                writeFileSync(knowledgePath, block, "utf-8");
                return { updated: true, mode: "created" };
            }

            let existing = readFileSync(knowledgePath, "utf-8");
            const beginIdx = existing.indexOf(beginTag);
            const endIdx = existing.indexOf(endTag);

            if (beginIdx !== -1 && endIdx !== -1) {
                existing = existing.substring(0, beginIdx) + beginTag + '\n' + content + '\n' + endTag + existing.substring(endIdx + endTag.length);
            } else {
                existing += block;
            }
            writeFileSync(knowledgePath, existing, "utf-8");
            return { updated: true, mode: beginIdx !== -1 ? "replaced" : "appended" };
        },
    }),
};

// ========== Agent 系统 Prompt ==========

const SYSTEM_PROMPT = `你是一位资深技术 Leader，负责分析 Git 分支的代码变更，生成深度工作总结。

## 你的核心能力
- 看懂代码的"为什么"而非仅仅"改了什么"
- 从 diff 中提炼业务价值和技术亮点
- 识别难点、踩坑、巧妙设计

## 你有以下工具可以自由使用

- getCurrentBranch - 获取当前分支
- getCommitHistory - 获取 commit 历史
- getDiffStat - 获取改动统计
- getFileDiff - 获取单个文件的详细 diff
- getTopChangedFiles - 获取改动最大的文件
- readFileContent - 读取文件内容（用于引用代码）
- checkExistingReport - 检查是否有旧报告
- saveReport - 保存最终报告
- updateKnowledge - 更新知识库

## 工作流程（你自己决定顺序和节奏）

1. 确定分支信息（用户可能指定分支，也可能让你自己判断）
2. 检查是否有旧报告 → 决定全量还是增量
3. 收集 Git 信息：commit 历史、改动统计、核心文件 diff
4. 深度分析：从 diff 中提炼业务价值、技术方案、亮点难点
5. 生成结构化报告（Markdown 格式）
6. 保存报告 + 更新知识库

## 报告输出格式

\`\`\`markdown
---
branch: <分支名>
slug: <slug>
last_commit: <最新 commit hash>
revision: <第几次>
created_at: <日期>
updated_at: <日期>
---

> 本文档由 work-reporter Agent 自动生成
> 最近更新：<日期> | 第 N 次生成

# 需求/项目名称

## 概览
- 一句话总结核心价值

## 做了什么（核心产出）
- **功能1**：解决了 XX 痛点，实现了 YY 效果
- **功能2**：...

## 核心技术方案与实现
### 模块名
**问题/挑战**：...
**方案设计**：...
**关键实现**：（代码片段）
**为什么这样做**：...

## 技术难点与亮点
### 亮点标题
- **场景**：...
- **难在哪里**：...
- **解法**：...
- **效果**：...

## 踩坑记录（如有）
### 坑标题
- **现象**：...
- **根因**：...
- **解法**：...

## 关键词标签
\`\`\`

## 分析原则（严格遵守）

**禁止**：
- ❌ "修改了 XX 文件"、"增加了 XX 行代码"
- ❌ 单纯罗列文件名
- ❌ "优化了代码" 等空话

**必须**：
- ✅ 痛点先行：这个改动解决了什么问题
- ✅ 方案深度：为什么选择这个方案
- ✅ 代码价值：每段代码说明巧妙之处
- ✅ 难点提炼：实现中克服了什么困难

## Slug 规则
分支名 → slug：\`/\` 替换为 \`-\`，全小写，去掉首尾 \`-\`
例如：\`feature/yanqihuan/test/20260721\` → \`feature-yanqihuan-test-20260721\`

完成后请调用 saveReport 和 updateKnowledge 保存结果。`;

// ========== 对外暴露的 Agent 执行函数 ==========

export interface WorkReporterResult {
    success: boolean;
    branch: string;
    slug: string;
    reportPath?: string;
    summary: string;
}

export async function runWorkReporterAgent(
    userRequest: string
): Promise<WorkReporterResult> {
    try {
        const result = await generateText({
            model: deepseek.chat(MODEL),
            system: SYSTEM_PROMPT,
            prompt: userRequest,
            tools: agentTools as any,
            maxSteps: 15, // 最多 15 步工具调用
        } as any);

        const text = result.text || '';
        const steps = (result as any).steps || [];

        // 从 steps 中提取保存结果
        let reportPath = '';
        let branch = '';
        let slug = '';

        for (const step of steps) {
            const toolCalls = step.toolCalls || [];
            const toolResults = step.toolResults || [];
            for (const call of toolCalls) {
                if (call.toolName === 'saveReport') {
                    const args = call.args || call.input || {};
                    reportPath = `work-reports/work-report-${args.slug}.md`;
                    slug = args.slug;
                }
                if (call.toolName === 'getCurrentBranch') {
                    const tr = toolResults.find(
                        (r: any) => r.toolCallId === call.toolCallId
                    );
                    if (tr?.result?.branch) {
                        branch = tr.result.branch;
                    }
                }
            }
        }

        return {
            success: true,
            branch,
            slug,
            reportPath,
            summary: text,
        };
    } catch (error) {
        return {
            success: false,
            branch: '',
            slug: '',
            summary: `Agent 执行出错: ${(error as Error).message}`,
        };
    }
}
