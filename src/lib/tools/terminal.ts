import { tool } from "ai";
import { z } from "zod";
import { execSync } from "child_process";

/**
 * 执行终端命令，返回输出。5 秒超时，1MB 输出限制。
 */
function runCommand(command: string): string {
    try {
        return execSync(command, {
            cwd: process.cwd(),
            encoding: "utf-8",
            timeout: 5000,
            maxBuffer: 1024 * 1024,
        }).trim();
    } catch (e) {
        const err = e as { stdout?: Buffer; stderr?: Buffer; message: string };
        // 即使命令失败，也可能有 stdout（如 lint 错误）
        const stdout = err.stdout?.toString().trim() || "";
        const stderr = err.stderr?.toString().trim() || "";
        return stdout || stderr || err.message;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const terminalTool: any = tool({
    description: `在项目根目录执行终端命令。支持的命令：
- npm run lint: 代码检查
- npm run build: 构建项目
- npm test: 运行测试
- ls/cat: 查看文件
- git 相关命令（git status 等）
禁止执行危险命令（rm -rf、sudo、curl/wget 等）。`,
    parameters: z.object({
        command: z.string().describe("要执行的命令，如 'npm run lint'"),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const command: string = input.command || "";

        // 安全检查：禁止危险命令
        const dangerous = /\b(rm\s+-rf|sudo|curl|wget|shutdown|reboot|mkfs|dd\s+if=)\b/;
        if (dangerous.test(command)) {
            return { command, error: "禁止执行危险命令" };
        }

        console.log(`[terminal] 执行: ${command}`);
        const output = runCommand(command);
        console.log(`[terminal] 输出: ${output.substring(0, 200)}`);

        return { command, output: output.substring(0, 4000) }; // 截断，防止 token 溢出
    },
});
