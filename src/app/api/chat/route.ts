import { streamText, toUIMessageStream, createUIMessageStreamResponse, convertToModelMessages, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getWeatherTool } from "@/lib/tools/weather";
import { caculatorTool } from "@/lib/tools/caculator";
import { searchTool } from "@/lib/tools/search";
import { gitTools } from "@/lib/tools/git";
import { terminalTool } from "@/lib/tools/terminal";
import { fileTools } from "@/lib/tools/file";
import { memoryTools } from "@/lib/tools/memory";
import { memoryContext } from "@/lib/memory";

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
    terminal: terminalTool,
    ...memoryTools,
    ...fileTools,
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

        // 注入长期记忆
        const memory = memoryContext();

        const result = streamText({
            model: deepseek.chat(MODEL),
            system: `你是一个 AI 助手，帮助用户完成开发任务。

你有以下工具：
【信息查询】
- getWeather(city) - 查询天气
- caculator(expression) - 数学计算
- search(query) - 联网搜索
- terminal(command) - 执行终端命令

【文件操作】
- readFile(path) - 读取文件
- writeFile(path, content) - 写入文件
- listFiles(dir) - 列出文件

【记忆系统】
- remember(type, content) - 记住用户偏好或事实。当用户明确说"记住xxx"或表达偏好时使用
- recall() - 查看已记住的信息

【Git 操作】
- gitStatus / gitDiff / gitLog / gitBranch / gitNewBranch / gitAdd / gitCommit / gitPush

【自动修复流程】：
提交前先 terminal("npm run lint")，有错误就修改后重试。

【规则】：
- 禁止编造数据
- 用户表达偏好时，主动用 remember 工具记住${memory}`,
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
