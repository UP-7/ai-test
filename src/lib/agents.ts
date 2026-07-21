import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const deepseek = createOpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
});

const MODEL = process.env.LLM_MODEL ?? "deepseek-v4-pro";

/**
 * Code Review Agent - 专门审查代码
 */
export async function codeReviewAgent(files: Array<{ path: string; content: string }>): Promise<string> {
    const fileList = files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");

    const { text } = await generateText({
        model: deepseek.chat(MODEL),
        system: `你是一个严格的代码审查员。审查以下代码，从以下几个维度分析：
1. 潜在 bug 和逻辑错误
2. 性能问题
3. 安全问题（XSS、SQL注入等）
4. 代码风格和可维护性
5. TypeScript 类型安全

用简洁的中文输出，问题按严重程度排序（🔴严重 🟡警告 🔵建议）。
如果没有问题，回复"✅ 代码审查通过，没有发现问题"。`,
        prompt: `请审查以下代码：\n\n${fileList}`,
    });

    return text;
}

/**
 * Commit Message Agent - 专门生成 commit message
 */
export async function commitMessageAgent(diff: string): Promise<string> {
    const { text } = await generateText({
        model: deepseek.chat(MODEL),
        system: `你是一个 Git 提交信息专家。根据代码变更生成规范的 commit message。

格式: "<类型>: <简要描述>"
类型: feat(新功能) | fix(修复) | refactor(重构) | chore(杂项) | docs(文档)

只返回 commit message，不要其他内容。`,
        prompt: `根据以下 git diff 生成 commit message:\n\n${diff.substring(0, 3000)}`,
    });

    return text.trim();
}

/**
 * Bug Fix Agent - 专门修复代码问题
 */
export async function bugFixAgent(filePath: string, fileContent: string, errorMessage: string): Promise<string> {
    const { text } = await generateText({
        model: deepseek.chat(MODEL),
        system: `你是一个代码修复专家。根据错误信息修复代码。
只返回修复后的完整文件内容，不要任何解释。保持原有的代码结构和风格。`,
        prompt: `文件路径: ${filePath}\n\n当前代码:\n\`\`\`\n${fileContent}\n\`\`\`\n\n错误信息:\n${errorMessage}\n\n请修复后返回完整代码:`,
    });

    return text;
}
