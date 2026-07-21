import { tool } from "ai";
import { z } from "zod";
import { codeReviewAgent, commitMessageAgent, bugFixAgent } from "@/lib/agents";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_ROOT = process.cwd();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const codeReviewTool: any = tool({
    description: "调用专业 Code Review Agent 审查代码。传入文件路径列表，Agent 会读取文件并给出审查意见。",
    parameters: z.object({
        files: z.string().describe("要审查的文件路径，多个用逗号分隔，如 'src/app/page.tsx,src/lib/tools/git.ts'"),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const fileList = (input.files || "").split(",").map((f: string) => f.trim()).filter(Boolean);

        const files = fileList.map((filePath: string) => {
            const fullPath = path.resolve(PROJECT_ROOT, filePath);
            if (!fullPath.startsWith(PROJECT_ROOT)) return { path: filePath, content: "[拒绝访问]" };
            if (!fs.existsSync(fullPath)) return { path: filePath, content: "[文件不存在]" };
            return { path: filePath, content: fs.readFileSync(fullPath, "utf-8").substring(0, 3000) };
        });

        const review = await codeReviewAgent(files);
        return { reviewed: fileList.length, files: fileList, review };
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const commitMsgTool: any = tool({
    description: "调用 Commit Message Agent 分析 git diff 并生成规范的 commit message。",
    parameters: z.object({}),
    execute: async () => {
        const diff = execSync("git diff --cached", { cwd: PROJECT_ROOT, encoding: "utf-8" }).trim()
            || execSync("git diff", { cwd: PROJECT_ROOT, encoding: "utf-8" }).trim();

        if (!diff) return { message: "没有变更内容" };

        const message = await commitMessageAgent(diff);
        return { diff: diff.substring(0, 200), message };
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const bugFixTool: any = tool({
    description: "调用 Bug Fix Agent 修复代码错误。传入文件路径和错误信息，Agent 会返回修复后的代码。",
    parameters: z.object({
        filePath: z.string().describe("出错的文件路径"),
        error: z.string().describe("lint 或构建错误信息"),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const filePath = input.filePath || "";
        const error = input.error || "";
        const fullPath = path.resolve(PROJECT_ROOT, filePath);

        if (!fullPath.startsWith(PROJECT_ROOT)) return { error: "文件路径不合法" };
        if (!fs.existsSync(fullPath)) return { error: "文件不存在" };

        const content = fs.readFileSync(fullPath, "utf-8");
        const fixed = await bugFixAgent(filePath, content, error);

        // 自动写入修复后的代码
        fs.writeFileSync(fullPath, fixed, "utf-8");

        return { filePath, fixed: true, preview: fixed.substring(0, 500) };
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const agentTools: Record<string, any> = {
    codeReview: codeReviewTool,
    commitMsg: commitMsgTool,
    bugFix: bugFixTool,
};
