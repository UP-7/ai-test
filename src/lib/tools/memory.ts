import { tool } from "ai";
import { z } from "zod";
import { addPreference, addFact, loadMemory } from "@/lib/memory";

/**
 * 为指定用户创建记忆工具集。每次请求都用当前登录用户的 id 生成一份新的实例，
 * 将 userId 闭包进去，从而做到不同账号的记忆互不干扰。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMemoryTools = (userId: string): Record<string, any> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rememberTool: any = tool({
        description: `记住当前登录用户说的重要信息，下次对话时自动回忆。用于：
- 用户偏好：如"我喜欢用中文"、"回答简洁一点"
- 重要事实：如"我的项目叫 ai-test"、"我在学习 AI Agent 开发"
注意：记忆仅归属当前用户，不会泄露给其他账号。`,
        parameters: z.object({
            type: z.enum(["preference", "fact"]).describe("类型：preference=偏好，fact=事实"),
            content: z.string().describe("要记住的内容"),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (input: any) => {
            const { type, content } = input;
            const memory =
                type === "preference"
                    ? addPreference(userId, content)
                    : addFact(userId, content);

            return {
                saved: content,
                totalPreferences: memory.preferences.length,
                totalFacts: memory.facts.length,
            };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recallTool: any = tool({
        description: "查看当前登录用户已记住的所有偏好和事实。",
        parameters: z.object({}),
        execute: async () => {
            const memory = loadMemory(userId);
            return {
                preferences: memory.preferences,
                facts: memory.facts,
                lastUpdated: memory.updatedAt,
            };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return {
        remember: rememberTool,
        recall: recallTool,
    };
};
