import { tool } from "ai";
import { z } from "zod";
import { addPreference, addFact, loadMemory } from "@/lib/memory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rememberTool: any = tool({
    description: `记住用户说的重要信息，下次对话时自动回忆。用于：
- 用户偏好：如"我喜欢用中文"、"回答简洁一点"
- 重要事实：如"我的项目叫 ai-test"、"我在学习 AI Agent 开发"`,
    parameters: z.object({
        type: z.enum(["preference", "fact"]).describe("类型：preference=偏好，fact=事实"),
        content: z.string().describe("要记住的内容"),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (input: any) => {
        const { type, content } = input;
        let memory;

        if (type === "preference") {
            memory = addPreference(content);
        } else {
            memory = addFact(content);
        }

        return {
            saved: content,
            totalPreferences: memory.preferences.length,
            totalFacts: memory.facts.length,
        };
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const recallTool: any = tool({
    description: "查看当前记住的所有用户偏好和已知信息。",
    parameters: z.object({}),
    execute: async () => {
        const memory = loadMemory();
        return {
            preferences: memory.preferences,
            facts: memory.facts,
            lastUpdated: memory.updatedAt,
        };
    },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const memoryTools: Record<string, any> = {
    remember: rememberTool,
    recall: recallTool,
};
