'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { SessionSidebar } from '@/components/SessionSidebar';
import { useSessions } from '@/hooks/useSessions';

const TOOL_NAME_MAP: Record<string, string> = {
    getWeather: '天气查询',
    calculator: '数学计算',
    search: '联网搜索',
    terminal: '执行命令',
    readFile: '读取文件',
    writeFile: '写入文件',
    listFiles: '列出文件',
    remember: '记忆存储',
    recall: '回忆信息',
    codeReview: '代码审查',
    commitMsg: '生成提交信息',
    bugFix: '自动修复',
    workReport: '📝 工作总结 Agent',
    gitStatus: 'Git 状态',
    gitDiff: '查看变更',
    gitLog: '提交记录',
    gitBranch: '查看分支',
    gitNewBranch: '新建分支',
    gitAdd: '暂存文件',
    gitCommit: '提交代码',
    gitPush: '推送到远程',
};

const TOOL_STATE_MAP: Record<string, { text: string; color: string }> = {
    result: { text: '✅ 完成', color: 'text-green-600' },
    'input-available': { text: '⏳ 执行中…', color: 'text-blue-600' },
    'output-available': { text: '📤 返回结果', color: 'text-purple-600' },
};

// 只发 sessionId + 最后一条 message 给后端（Level 3 无状态传输）
const chatTransport = new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
            sessionId: id,
            message: messages[messages.length - 1],
        },
    }),
});

export default function HomePage() {
    const router = useRouter();
    const [input, setInput] = useState('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [username, setUsername] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const {
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
    } = useSessions();

    // 未登录 → 跳登录
    useEffect(() => {
        if (isReady && authError) {
            router.replace('/login');
        }
    }, [isReady, authError, router]);

    // 拉当前用户信息（顶栏显示）
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/auth/me');
                if (res.ok) {
                    const data = await res.json();
                    setUsername(data.user?.username ?? null);
                }
            } catch {
                /* ignore */
            }
        })();
    }, []);

    // 防止"切换会话瞬间 messages 变成 [] 被误写回本地"的守卫
    const lastSyncedIdRef = useRef<string | null>(null);
    const hydratedRef = useRef(false);

    const { messages, sendMessage, setMessages, status, stop } = useChat({
        id: currentId ?? undefined,
        messages: current?.messages ?? [],
        transport: chatTransport,
        onFinish: () => setInput(''),
    });

    const isLoading = status === 'submitted' || status === 'streaming';

    // 切换会话时把该会话的历史消息灌入 useChat
    useEffect(() => {
        if (!isReady || !currentId || !current) return;
        if (lastSyncedIdRef.current === currentId) return;

        setMessages(current.messages);
        lastSyncedIdRef.current = currentId;
        hydratedRef.current = true;
    }, [isReady, currentId, current, setMessages]);

    // 消息变化时同步到本地 sessions（仅乐观 UI，权威数据由后端 onFinish 落库）
    useEffect(() => {
        if (!isReady || !currentId || !hydratedRef.current) return;
        if (lastSyncedIdRef.current !== currentId) return;
        if (status === 'submitted' || status === 'streaming') return;

        updateMessages(currentId, messages);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, status, currentId, isReady]);

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSwitch = (id: string) => {
        if (isLoading) stop();
        hydratedRef.current = false;
        lastSyncedIdRef.current = null;
        switchTo(id);
    };

    const handleCreate = () => {
        if (isLoading) stop();
        hydratedRef.current = false;
        lastSyncedIdRef.current = null;
        createNew();
    };

    const handleDelete = (id: string) => {
        if (id === currentId && isLoading) stop();
        if (id === currentId) {
            hydratedRef.current = false;
            lastSyncedIdRef.current = null;
        }
        remove(id);
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        // 清一下当前 session id（避免下个用户看到别的 id）
        try {
            localStorage.removeItem('chat-current-id');
        } catch {
            /* ignore */
        }
        router.replace('/login');
        router.refresh();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim()) {
                sendMessage({ text: input });
            }
        }
    };

    if (!isReady || authError) {
        return (
            <div className='flex items-center justify-center h-screen bg-linear-to-br from-blue-50 via-white to-purple-50'>
                <div className='text-gray-400'>加载中…</div>
            </div>
        );
    }

    return (
        <div className='flex h-screen bg-linear-to-br from-blue-50 via-white to-purple-50'>
            {/* 左侧栏 */}
            <SessionSidebar
                sessions={sessions}
                currentId={currentId}
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((v) => !v)}
                onCreate={handleCreate}
                onSwitch={handleSwitch}
                onDelete={handleDelete}
                onRename={rename}
            />

            {/* 右侧：主对话区 */}
            <div className='flex-1 flex flex-col min-w-0'>
                {/* 头部 */}
                <div className='bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200'>
                    <div className='max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4'>
                        <div className='min-w-0'>
                            <h1 className='text-2xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent truncate'>
                                {current?.title ?? 'AI 智能助手'}
                            </h1>
                            <p className='text-sm text-gray-500 mt-1'>
                                {messages.length > 0
                                    ? `共 ${messages.length} 条消息`
                                    : '随时为您解答问题'}
                            </p>
                        </div>
                        {username && (
                            <div className='flex items-center gap-2 shrink-0'>
                                <span className='text-sm text-gray-600'>👤 {username}</span>
                                <button
                                    onClick={handleLogout}
                                    className='text-sm text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition'
                                >
                                    退出
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 消息区域 */}
                <div className='flex-1 overflow-y-auto px-4 py-6'>
                    <div className='max-w-4xl mx-auto space-y-4'>
                        {messages.length === 0 ? (
                            <div className='flex flex-col items-center justify-center h-full text-center py-20'>
                                <div className='bg-linear-to-br from-blue-100 to-purple-100 rounded-full p-6 mb-4'>
                                    <svg
                                        className='w-12 h-12 text-blue-600'
                                        fill='none'
                                        stroke='currentColor'
                                        viewBox='0 0 24 24'
                                    >
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            strokeWidth={2}
                                            d='M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z'
                                        />
                                    </svg>
                                </div>
                                <h2 className='text-xl font-semibold text-gray-700 mb-2'>
                                    开始对话
                                </h2>
                                <p className='text-gray-500'>输入您的问题，我会尽力帮助您</p>
                            </div>
                        ) : (
                            messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex ${
                                        message.role === 'user' ? 'justify-end' : 'justify-start'
                                    } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                                >
                                    <div
                                        className={`flex gap-3 max-w-[80%] ${
                                            message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                                        }`}
                                    >
                                        <div
                                            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold ${
                                                message.role === 'user'
                                                    ? 'bg-linear-to-br from-blue-500 to-blue-600'
                                                    : 'bg-linear-to-br from-purple-500 to-purple-600'
                                            }`}
                                        >
                                            {message.role === 'user' ? '你' : 'AI'}
                                        </div>

                                        <div
                                            className={`flex flex-col ${
                                                message.role === 'user' ? 'items-end' : 'items-start'
                                            }`}
                                        >
                                            {message.parts
                                                .filter((part) => part.type.startsWith('tool-'))
                                                .map((part, index) => {
                                                    const invocation = part as {
                                                        type: string;
                                                        state: string;
                                                    };
                                                    const toolName = invocation.type.replace(
                                                        'tool-',
                                                        ''
                                                    );
                                                    const displayName =
                                                        TOOL_NAME_MAP[toolName] || toolName;
                                                    const s = TOOL_STATE_MAP[invocation.state] || {
                                                        text: invocation.state,
                                                        color: 'text-gray-500',
                                                    };
                                                    return (
                                                        <div
                                                            key={index}
                                                            className={`text-xs ${s.color} mb-1`}
                                                        >
                                                            {s.text} {displayName}
                                                        </div>
                                                    );
                                                })}

                                            <div
                                                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                                    message.role === 'user'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white shadow-sm border border-gray-100 text-gray-700'
                                                }`}
                                            >
                                                {message.parts
                                                    .filter((part) => part.type === 'text')
                                                    .map((part, index) => (
                                                        <span key={index}>
                                                            {(part as { text: string }).text}
                                                        </span>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* 输入区域 */}
                <div className='bg-white/80 backdrop-blur-sm border-t border-gray-200'>
                    <div className='max-w-4xl mx-auto px-6 py-4'>
                        <div className='flex gap-3'>
                            <Textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder='输入消息… (Enter 发送，Shift+Enter 换行)'
                                className='min-h-[52px] resize-none rounded-xl border-gray-200 focus:border-blue-400 focus:ring-blue-400'
                                rows={1}
                            />
                            {isLoading ? (
                                <Button
                                    onClick={() => stop()}
                                    className='bg-red-500 hover:bg-red-600 text-white rounded-xl px-6'
                                >
                                    ⏹ 停止
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => {
                                        if (input.trim()) {
                                            sendMessage({ text: input });
                                        }
                                    }}
                                    disabled={!input.trim()}
                                    className='bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl px-6'
                                >
                                    发送
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
