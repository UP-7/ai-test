/**
 * useSessions: 通过后端 API 管理会话列表和当前激活会话。
 *
 * 消息的持久化改由后端 /api/chat 在流式结束时完成，
 * 前端不再主动 PUT messages（省了带宽 & 冲突）。
 * 所以 updateMessages() 只更新前端本地 UI 状态（乐观更新用）。
 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import {
    type Session,
    type SessionSummary,
    sessionsApi,
    sortSessions,
    deriveTitle,
} from '@/lib/sessions';

const CURRENT_ID_KEY = 'chat-current-id'; // 只本地存 currentId，服务端不管

const loadCurrentId = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(CURRENT_ID_KEY);
};

const saveCurrentId = (id: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CURRENT_ID_KEY, id);
};

export type UseSessionsReturn = {
    sessions: SessionSummary[];
    currentId: string | null;
    current: Session | null;
    isReady: boolean;
    authError: boolean;

    createNew: () => Promise<void>;
    switchTo: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    rename: (id: string, title: string) => Promise<void>;
    updateMessages: (id: string, messages: UIMessage[]) => void;
};

export const useSessions = (): UseSessionsReturn => {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [current, setCurrent] = useState<Session | null>(null);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [authError, setAuthError] = useState(false);

    // 首次挂载：拉列表 + 确定当前 session
    useEffect(() => {
        (async () => {
            try {
                let list = await sessionsApi.list();
                let activeId: string | null = null;
                const savedId = loadCurrentId();

                if (list.length === 0) {
                    const s = await sessionsApi.create();
                    list = [s];
                    activeId = s.id;
                } else {
                    activeId = savedId && list.some((s) => s.id === savedId) ? savedId : list[0].id;
                }

                const full = await sessionsApi.get(activeId!);
                setSessions(sortSessions(list));
                setCurrentId(activeId);
                setCurrent(full);
                saveCurrentId(activeId!);
            } catch (e) {
                const msg = e instanceof Error ? e.message : '';
                if (msg.includes('未登录') || msg === 'Unauthorized') {
                    setAuthError(true);
                } else {
                    console.error('load sessions failed:', e);
                }
            } finally {
                setIsReady(true);
            }
        })();
    }, []);

    const createNew = useCallback(async () => {
        const s = await sessionsApi.create();
        setSessions((prev) => sortSessions([s, ...prev]));
        setCurrentId(s.id);
        setCurrent({ ...s, messages: [] });
        saveCurrentId(s.id);
    }, []);

    const switchTo = useCallback(
        async (id: string) => {
            if (id === currentId) return;
            const full = await sessionsApi.get(id);
            setCurrentId(id);
            setCurrent(full);
            saveCurrentId(id);
        },
        [currentId]
    );

    const remove = useCallback(
        async (id: string) => {
            await sessionsApi.remove(id);
            const rest = sessions.filter((s) => s.id !== id);

            if (rest.length === 0) {
                const s = await sessionsApi.create();
                setSessions([s]);
                setCurrentId(s.id);
                setCurrent({ ...s, messages: [] });
                saveCurrentId(s.id);
                return;
            }

            setSessions(sortSessions(rest));

            if (id === currentId) {
                const nextId = rest[0].id;
                const full = await sessionsApi.get(nextId);
                setCurrentId(nextId);
                setCurrent(full);
                saveCurrentId(nextId);
            }
        },
        [sessions, currentId]
    );

    const rename = useCallback(
        async (id: string, title: string) => {
            const trimmed = title.trim() || '新对话';
            await sessionsApi.rename(id, trimmed);
            const now = Date.now();
            setSessions((prev) =>
                sortSessions(
                    prev.map((s) => (s.id === id ? { ...s, title: trimmed, updatedAt: now } : s))
                )
            );
            if (current?.id === id) setCurrent({ ...current, title: trimmed, updatedAt: now });
        },
        [current]
    );

    /**
     * 乐观本地状态更新：当 useChat 的 messages 变化时调用。
     * - 更新 current.messages 供 UI 显示（避免切回来又要 fetch）
     * - 若 title 还是"新对话"，本地立刻算一个占位标题（后端也会同步一次）
     * 不再 PUT 到服务端（后端 stream 结束时已经落库）
     */
    const updateMessages = useCallback(
        (id: string, messages: UIMessage[]) => {
            const now = Date.now();
            setCurrent((prev) => {
                if (!prev || prev.id !== id) return prev;
                const nextTitle =
                    prev.title === '新对话' && messages.some((m) => m.role === 'user')
                        ? deriveTitle(messages)
                        : prev.title;
                return { ...prev, messages, title: nextTitle, updatedAt: now };
            });
            setSessions((prev) =>
                sortSessions(
                    prev.map((s) => {
                        if (s.id !== id) return s;
                        const nextTitle =
                            s.title === '新对话' && messages.some((m) => m.role === 'user')
                                ? deriveTitle(messages)
                                : s.title;
                        return { ...s, title: nextTitle, updatedAt: now };
                    })
                )
            );
        },
        []
    );

    return {
        sessions,
        currentId,
        current,
        isReady,
        authError,
        createNew,
        switchTo,
        remove,
        rename,
        updateMessages,
    };
};
