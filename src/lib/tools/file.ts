import { tool } from "ai";
import { z } from "zod";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = process.cwd();

/**
 * 安全检查：确保路径在项目目录内，防止访问系统文件
 */
function safePath(filePath: string): string {
    const resolved = path.resolve(PROJECT_ROOT, filePath);
    if (!resolved.startsWith(PROJECT_ROOT)) {
        throw new Error(`禁止访问项目目录外的文件: ${filePath}`);
    }
    return resolved;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readFileTool: any = tool({
    description: "读取项目中的文件内容。",
    parameters: z.object({
        filePath: z.string().describe("文件路径，相对于项目根目录，如 'src/app/page.tsx'"),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const filePath = input.filePath || "";
        const fullPath = safePath(filePath);

        if (!fs.existsSync(fullPath)) {
            return { filePath, error: `文件不存在: ${filePath}` };
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        return { filePath, content: content.substring(0, 5000) }; // 截断
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const writeFileTool: any = tool({
    description: "写入或覆盖项目中的文件。用于创建新文件或修改已有文件。",
    parameters: z.object({
        filePath: z.string().describe("文件路径，相对于项目根目录"),
        content: z.string().describe("要写入的完整文件内容"),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const filePath = input.filePath || "";
        const content = input.content || "";
        const fullPath = safePath(filePath);

        // 确保目录存在
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content, "utf-8");
        return { filePath, result: `已写入: ${filePath} (${content.length} 字符)` };
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const listFilesTool: any = tool({
    description: "列出项目目录下的文件。",
    parameters: z.object({
        dirPath: z.string().optional().describe("目录路径，默认 src/"),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const dirPath = input.dirPath || "src";
        const fullPath = safePath(dirPath);

        if (!fs.existsSync(fullPath)) {
            return { dirPath, error: `目录不存在: ${dirPath}` };
        }

        const files = fs.readdirSync(fullPath, { withFileTypes: true })
            .map((f) => (f.isDirectory() ? `${f.name}/` : f.name));
        return { dirPath, files };
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fileTools: Record<string, any> = {
    readFile: readFileTool,
    writeFile: writeFileTool,
    listFiles: listFilesTool,
};
