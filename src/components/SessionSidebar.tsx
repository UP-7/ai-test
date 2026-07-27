'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SessionSummary } from '@/lib/sessions';

type Props = {
    sessions: SessionSummary[];
    currentId: string | null;
    collapsed: boolean;
    onToggle: () => void;
    onCreate: () => void;
    onSwitch: (id: string) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, title: string) => void;
};

const formatTime = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
        return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

export const SessionSidebar = ({
    sessions,
    currentId,
    collapsed,
    onToggle,
    onCreate,
    onSwitch,
    onDelete,
    onRename,
}: Props) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');

    const startEdit = (s: SessionSummary) => {
        setEditingId(s.id);
        setEditingText(s.title);
    };

    const commitEdit = () => {
        if (editingId) {
            onRename(editingId, editingText);
            setEditingId(null);
        }
    };

    const handleDelete = (id: string, title: string) => {
        if (window.confirm(`确定删除会话「${title}」吗？此操作不可撤销。`)) {
            onDelete(id);
        }
    };

    if (collapsed) {
        return (
            <div className='flex flex-col items-center bg-white/80 backdrop-blur-sm border-r border-gray-200 py-4 px-2 gap-2'>
                <button
                    onClick={onToggle}
                    className='w-10 h-10 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-600 transition'
                    title='展开侧边栏'
                >
                    <svg
                        className='w-5 h-5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                    >
                        <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M4 6h16M4 12h16M4 18h16'
                        />
                    </svg>
                </button>
                <button
                    onClick={onCreate}
                    className='w-10 h-10 rounded-lg bg-linear-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 flex items-center justify-center transition'
                    title='新对话'
                >
                    +
                </button>
            </div>
        );
    }

    return (
        <aside className='w-64 flex flex-col bg-white/80 backdrop-blur-sm border-r border-gray-200'>
            {/* 顶部：折叠按钮 + 新建按钮 */}
            <div className='p-3 flex items-center gap-2 border-b border-gray-200'>
                <button
                    onClick={onToggle}
                    className='w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-600 transition shrink-0'
                    title='收起侧边栏'
                >
                    <svg
                        className='w-5 h-5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                    >
                        <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M11 19l-7-7 7-7m8 14l-7-7 7-7'
                        />
                    </svg>
                </button>
                <Button
                    onClick={onCreate}
                    className='flex-1 bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg h-9'
                >
                    + 新对话
                </Button>
            </div>

            {/* 会话列表 */}
            <div className='flex-1 overflow-y-auto px-2 py-2 space-y-1'>
                {sessions.length === 0 ? (
                    <div className='text-center text-sm text-gray-400 py-8'>
                        暂无会话
                    </div>
                ) : (
                    sessions.map((s) => {
                        const isActive = s.id === currentId;
                        const isEditing = editingId === s.id;
                        return (
                            <div
                                key={s.id}
                                onClick={() => !isEditing && onSwitch(s.id)}
                                onDoubleClick={() => startEdit(s)}
                                className={`group relative rounded-lg px-3 py-2 cursor-pointer transition ${
                                    isActive
                                        ? 'bg-linear-to-r from-blue-50 to-purple-50 border border-blue-200'
                                        : 'hover:bg-gray-100 border border-transparent'
                                }`}
                            >
                                {isEditing ? (
                                    <input
                                        autoFocus
                                        value={editingText}
                                        onChange={(e) => setEditingText(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') commitEdit();
                                            if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className='w-full bg-white border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
                                    />
                                ) : (
                                    <>
                                        <div
                                            className={`text-sm font-medium truncate pr-6 ${
                                                isActive ? 'text-blue-900' : 'text-gray-700'
                                            }`}
                                            title={s.title}
                                        >
                                            {s.title}
                                        </div>
                                        <div className='mt-0.5'>
                                            <span className='text-xs text-gray-400'>
                                                {formatTime(s.updatedAt)}
                                            </span>
                                        </div>

                                        {/* hover 显示的删除按钮 */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(s.id, s.title);
                                            }}
                                            className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-600 transition'
                                            title='删除会话'
                                        >
                                            <svg
                                                className='w-3.5 h-3.5'
                                                fill='none'
                                                stroke='currentColor'
                                                viewBox='0 0 24 24'
                                            >
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    strokeWidth={2}
                                                    d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3'
                                                />
                                            </svg>
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* 底部提示 */}
            <div className='px-3 py-2 border-t border-gray-200 text-xs text-gray-400'>
                双击标题可重命名
            </div>
        </aside>
    );
};
