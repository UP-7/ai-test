/**
 * 长期记忆存储：按 userId 隔离到 data/memory/<userId>.json
 *
 * 注意：所有导出函数都需要传入 userId，以避免不同账号的记忆互相污染。
 */
import fs from "fs";
import path from "path";

const MEMORY_DIR = path.join(process.cwd(), "data", "memory");

interface Memory {
    preferences: string[];   // 用户偏好
    facts: string[];         // AI 记住的事实
    updatedAt: string;
}

const ensureDir = (): void => {
    if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
};

/** 把 userId 转成安全的文件名（防止路径穿越） */
const safeFileName = (userId: string): string => {
    const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!sanitized) throw new Error("Invalid userId for memory storage");
    return `${sanitized}.json`;
};

const memoryPathOf = (userId: string): string =>
    path.join(MEMORY_DIR, safeFileName(userId));

const emptyMemory = (): Memory => ({
    preferences: [],
    facts: [],
    updatedAt: new Date().toISOString(),
});

/** 读取指定用户的记忆 */
export function loadMemory(userId: string): Memory {
    try {
        const file = memoryPathOf(userId);
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, "utf-8"));
        }
    } catch { /* ignore */ }
    return emptyMemory();
}

/** 保存指定用户的记忆 */
export function saveMemory(userId: string, memory: Memory): void {
    ensureDir();
    memory.updatedAt = new Date().toISOString();
    fs.writeFileSync(memoryPathOf(userId), JSON.stringify(memory, null, 2), "utf-8");
}

/** 为某个用户新增一条偏好 */
export function addPreference(userId: string, text: string): Memory {
    const memory = loadMemory(userId);
    if (!memory.preferences.includes(text)) {
        memory.preferences.push(text);
    }
    saveMemory(userId, memory);
    return memory;
}

/** 为某个用户新增一条事实 */
export function addFact(userId: string, text: string): Memory {
    const memory = loadMemory(userId);
    if (!memory.facts.includes(text)) {
        memory.facts.push(text);
    }
    saveMemory(userId, memory);
    return memory;
}

/** 生成 system prompt 中的记忆片段（属于指定用户） */
export function memoryContext(userId: string): string {
    const memory = loadMemory(userId);
    const parts: string[] = [];

    if (memory.preferences.length > 0) {
        parts.push(`【用户偏好】\n${memory.preferences.map((p) => `- ${p}`).join("\n")}`);
    }
    if (memory.facts.length > 0) {
        parts.push(`【已知信息】\n${memory.facts.map((f) => `- ${f}`).join("\n")}`);
    }

    return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}
