/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from "ai";
import { z } from "zod";
import { execSync } from "child_process";

/**
 * 执行 git 命令，返回输出。失败时返回错误信息。
 */
function runGit(args: string, cwd?: string): string {
    try {
        return execSync(`git ${args}`, {
            cwd: cwd || process.cwd(),
            encoding: "utf-8",
            timeout: 10000,
            maxBuffer: 1024 * 1024, // 1MB
        }).trim();
    } catch (e) {
        return `[Git 错误] ${(e as Error).message}`;
    }
}

// ========== 工具定义 ==========

export const gitStatusTool: any = tool({
    description: "查看 Git 工作区状态：哪些文件被修改、新增、删除。",
    parameters: z.object({}),
    execute: async () => {
        const output = runGit("status --short");
        return { files: output || "工作区干净，没有变更" };
    },
});

export const gitDiffTool: any = tool({
    description: "查看工作区中所有未暂存的变更内容（git diff）。",
    parameters: z.object({}),
    execute: async () => {
        const output = runGit("diff --stat");
        const detail = runGit("diff -- . ':!package-lock.json' ':!node_modules'");
        return { summary: output, detail: detail.substring(0, 3000) }; // 截断，防止 token 溢出
    },
});

export const gitLogTool: any = tool({
    description: "查看最近的 Git 提交记录。",
    parameters: z.object({
        count: z.number().optional().describe("显示最近几条记录，默认 5"),
    }),
    execute: async (input: any) => {
        const count = input.count || 5;
        const output = runGit(`log --oneline -${count}`);
        return { commits: output };
    },
});

export const gitBranchTool: any = tool({
    description: "查看当前 Git 分支。",
    parameters: z.object({}),
    execute: async () => {
        const output = runGit("branch --show-current");
        return { branch: output };
    },
});


export const gitAddTool: any = tool({
    description: "将文件添加到 Git 暂存区（git add）。",
    parameters: z.object({
        files: z.string().describe("要添加的文件，用空格分隔，如 'src/app/page.tsx src/lib/tools/git.ts' 或 '.' 表示所有"),
    }),
    execute: async (input: any) => {
        const files = input.files || ".";
        const output = runGit(`add ${files}`);
        return { result: output || `已添加: ${files}` };
    },
});

export const gitCommitTool: any = tool({
    description: "提交代码到本地仓库。message 需要是中文，格式：'类型: 简要描述'。类型包括 feat/fix/docs/chore。",
    parameters: z.object({
        message: z.string().describe("commit message，如 'feat: 添加天气查询工具'"),
    }),
    execute: async (input: any) => {
        const message = input.message || "chore: update";
        const output = runGit(`commit -m "${message.replace(/"/g, '\\"')}"`);
        return { result: output || `已提交: ${message}` };
    },
});

export const gitPushTool: any = tool({
    description: "将本地提交推送到远程仓库（git push）。使用前确保已配置远程仓库。",
    parameters: z.object({
        remote: z.string().optional().describe("远程仓库名，默认 origin"),
        branch: z.string().optional().describe("分支名，默认当前分支"),
    }),
    execute: async (input: any) => {
        const remote = input.remote || "origin";
        const branch = input.branch || runGit("branch --show-current");
        const output = runGit(`push ${remote} ${branch}`);
        return { result: output || `已推送到 ${remote}/${branch}` };
    },
});


export const gitNewBranchTool: any = tool({
    description: "创建并切换到新分支（git checkout -b）。",
    parameters: z.object({
        name: z.string().describe("分支名，建议用英文，如 feat/weather-tool"),
    }),
    execute: async (input: any) => {
        const name = (input.name || "").replace(/[^a-zA-Z0-9_\-./]/g, ""); // 过滤非法字符
        if (!name) return { error: "分支名不能为空" };
        const output = runGit(`checkout -b ${name}`);
        return { result: output || `已创建并切换到分支: ${name}` };
    },
});

// 导出所有 git 工具
export const gitTools: Record<string, any> = {
    gitStatus: gitStatusTool,
    gitDiff: gitDiffTool,
    gitLog: gitLogTool,
    gitBranch: gitBranchTool,
    gitNewBranch: gitNewBranchTool,
    gitAdd: gitAddTool,
    gitCommit: gitCommitTool,
    gitPush: gitPushTool,
};
