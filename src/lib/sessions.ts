/**
 * 会话客户端：通过 REST API 与后端 SQLite 交互。
 *
 * Session 元数据（列表页需要的）不含 messages；
 * 完整 messages 只在切换到该 session 时按需拉取。
 */
import type { UIMessage } from 'ai';

export type SessionSummary = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
};

export type Session = SessionSummary & {
    messages: UIMessage[];
};

/** 从首条 user 消息取前 N 字（用于本地占位；权威标题由后端生成） */
export const deriveTitle = (messages: UIMessage[], max = 20): string => {
    for (const m of messages) {
        if (m.role !== 'user') continue;
        for (const part of m.parts ?? []) {
            if (part.type === 'text') {
                const text = (part as { text: string }).text.trim();
                if (text) return text.length > max ? `${text.slice(0, max)}…` : text;
            }
        }
    }
    return '新对话';
};

const handle = async (res: Response) => {
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const data = await res.json();
            msg = data.error || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    return res.json();
};

export const sessionsApi = {
    async list(): Promise<SessionSummary[]> {
        const data = await handle(await fetch('/api/sessions'));
        return data.sessions;
    },

    async get(id: string): Promise<Session> {
        const data = await handle(await fetch(`/api/sessions/${id}`));
        return { ...data.session, messages: data.messages };
    },

    async create(title?: string): Promise<SessionSummary> {
        const data = await handle(
            await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title ?? '新对话' }),
            })
        );
        return data.session;
    },

    async rename(id: string, title: string): Promise<void> {
        await handle(
            await fetch(`/api/sessions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title }),
            })
        );
    },

    async remove(id: string): Promise<void> {
        await handle(await fetch(`/api/sessions/${id}`, { method: 'DELETE' }));
    },
};

/** 按 updatedAt 倒序 */
export const sortSessions = <T extends { updatedAt: number }>(list: T[]): T[] =>
    [...list].sort((a, b) => b.updatedAt - a.updatedAt);
