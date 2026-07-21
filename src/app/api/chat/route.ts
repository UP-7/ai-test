import { streamText, toUIMessageStream, createUIMessageStreamResponse, convertToModelMessages, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getWeatherTool, extractCity } from "@/lib/tools/weather";
import { caculatorTool } from "@/lib/tools/caculator";
import { searchTool } from "@/lib/tools/search";
import { gitTools } from "@/lib/tools/git";

// ========== LLM 配置 ==========

const deepseek = createOpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
});

const MODEL = process.env.LLM_MODEL ?? "deepseek-v4-pro";

// ========== 工具集 ==========

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tools: Record<string, any> = {
    getWeather: getWeatherTool,
    caculator: caculatorTool,
    search: searchTool,
    ...gitTools,
};

// ========== API Route ==========

export const POST = async (req: Request) => {
    try {
        const { messages } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return new Response("Invalid request: messages is required", { status: 400 });
        }

        const modelMessages = await convertToModelMessages(messages);

        const result = streamText({
            model: deepseek.chat(MODEL),
            system: `你是一个 AI 助手，帮助用户完成开发任务。

你有以下工具：
【信息查询】
- getWeather(city) - 查询天气
- calculator(expression) - 数学计算
- search(query) - 联网搜索

【Git 操作】
- gitStatus() - 查看工作区状态
- gitDiff() - 查看代码变更
- gitLog(count) - 查看提交记录
- gitBranch() - 查看当前分支
- gitAdd(files) - 添加文件到暂存区
- gitCommit(message) - 提交代码（message 格式: "类型: 描述"）

【绝对规则】：
- 所有工具返回的数据都是真实的，禁止编造
- Git 操作前先告诉用户你准备做什么，让用户确认
- commit message 必须用中文，格式为 "feat: xxx" / "fix: xxx" / "chore: xxx"
- 每次提交前先 gitStatus + gitDiff 检查变更`,
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(5),
        });

        const uiStream = toUIMessageStream({
            stream: result.stream,
            originalMessages: messages,
            tools,
        });

        return createUIMessageStreamResponse({ stream: uiStream });
    } catch (error) {
        console.error("Chat API error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
