import {
    streamText,
    toUIMessageStream,
    createUIMessageStreamResponse,
    convertToModelMessages,
    stepCountIs,
    type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getWeatherTool } from "@/lib/tools/weather";
import { caculatorTool } from "@/lib/tools/caculator";
import { searchTool } from "@/lib/tools/search";
import { gitTools } from "@/lib/tools/git";
import { terminalTool } from "@/lib/tools/terminal";
import { fileTools } from "@/lib/tools/file";
import { createMemoryTools } from "@/lib/tools/memory";
import { memoryContext } from "@/lib/memory";
import { agentTools } from "@/lib/tools/agents";
import { sessionsRepo, messagesRepo } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// ========== LLM 配置 ==========

const deepseek = createOpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
});

const MODEL = process.env.LLM_MODEL ?? "deepseek-v4-pro";

// ========== 工具集 ==========

/** 为当前登录用户构造工具集（memory 类工具需要按用户隔离） */
const buildTools = (userId: string) => ({
    getWeather: getWeatherTool,
    caculator: caculatorTool,
    search: searchTool,
    terminal: terminalTool,
    ...createMemoryTools(userId),
    ...agentTools,
    ...fileTools,
    ...gitTools,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as Record<string, any>;

// ========== API Route ==========

export const POST = async (req: Request) => {
    try {
        const user = await getCurrentUser();
        if (!user) return new Response("Unauthorized", { status: 401 });

        const tools = buildTools(user.id);

        const body = await req.json();
        const { sessionId, message } = body as {
            sessionId?: string;
            message?: UIMessage;
        };

        if (!sessionId || !message) {
            return new Response("Invalid request: sessionId and message are required", {
                status: 400,
            });
        }

        // 校验 session 归属
        const session = sessionsRepo.get(sessionId, user.id);
        if (!session) {
            return new Response("Session not found", { status: 404 });
        }

        // 读历史 + 追加新消息
        const history = messagesRepo.listBySession(sessionId);
        const allMessages: UIMessage[] = [...history, message];

        // 立即持久化用户消息
        messagesRepo.upsert(sessionId, message);

        // 若 session 还是"新对话"，用首条 user 消息生成标题
        if (session.title === '新对话' && message.role === 'user') {
            const firstText = message.parts?.find(
                (p) => (p as { type: string }).type === 'text'
            ) as { text?: string } | undefined;
            const text = firstText?.text?.trim();
            if (text) {
                const title = text.length > 20 ? `${text.slice(0, 20)}…` : text;
                sessionsRepo.updateTitle(sessionId, user.id, title);
            }
        } else {
            sessionsRepo.touch(sessionId);
        }

        const modelMessages = await convertToModelMessages(allMessages);
        const memory = memoryContext(user.id);

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

【并行规则】：
- 当多个操作互相独立时（如同时审查多个文件），一次性发出所有工具调用
- AI SDK 会自动并行执行它们

【规则】：
- 禁止编造数据
- 用户表达偏好时，主动用 remember 工具记住${memory}`,
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(8),
        });

        const uiStream = toUIMessageStream({
            stream: result.stream,
            originalMessages: allMessages,
            tools,
            // 显式给 assistant 消息生成 id，避免 responseMessage.id 为空
            // 导致所有 assistant 行都用 id="" 主键覆盖同一行。
            generateMessageId: () =>
                (globalThis.crypto?.randomUUID?.() ??
                    `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`),
            onFinish: ({ responseMessage }) => {
                // 只落一条助手消息（含 tool-call/tool-result parts）
                if (responseMessage) {
                    messagesRepo.upsert(sessionId, responseMessage as UIMessage);
                }
                sessionsRepo.touch(sessionId);
            },
        });

        // 关键：即使客户端断连（切账号 / 关标签 / 切会话）也让模型层的 stream
        // 在后端继续跑完，确保 toUIMessageStream 的 onFinish 一定触发，助手消息落库不丢。
        result.consumeStream({
            onError: (err) => {
                console.error('consumeStream error:', err);
            },
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
