import fs from "fs";
import path from "path";

const MEMORY_FILE = path.join(process.cwd(), ".agent-memory.json");

interface Memory {
    preferences: string[];   // 用户偏好
    facts: string[];         // AI 记住的事实
    updatedAt: string;
}

/** 读取记忆 */
export function loadMemory(): Memory {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
        }
    } catch { /* ignore */ }
    return { preferences: [], facts: [], updatedAt: new Date().toISOString() };
}

/** 保存记忆 */
export function saveMemory(memory: Memory): void {
    memory.updatedAt = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8");
}

/** 添加一条偏好 */
export function addPreference(text: string): Memory {
    const memory = loadMemory();
    if (!memory.preferences.includes(text)) {
        memory.preferences.push(text);
    }
    saveMemory(memory);
    return memory;
}

/** 添加一条事实 */
export function addFact(text: string): Memory {
    const memory = loadMemory();
    if (!memory.facts.includes(text)) {
        memory.facts.push(text);
    }
    saveMemory(memory);
    return memory;
}

/** 生成 system 提示词中的记忆片段 */
export function memoryContext(): string {
    const memory = loadMemory();
    const parts: string[] = [];

    if (memory.preferences.length > 0) {
        parts.push(`【用户偏好】\n${memory.preferences.map((p) => `- ${p}`).join("\n")}`);
    }
    if (memory.facts.length > 0) {
        parts.push(`【已知信息】\n${memory.facts.map((f) => `- ${f}`).join("\n")}`);
    }

    return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}
