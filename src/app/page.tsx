'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChat } from '@ai-sdk/react';

export default function HomePage() {
    const [input, setInput] = useState(''); //输入框的值
    const messagesEndRef = useRef<HTMLDivElement>(null); //获取消息结束的ref
    //useChat 内部封装了流式响应 默认会向/api/chat 发送请求
    const { messages, sendMessage } = useChat({
        onFinish: () => {
            setInput('');
        }
    })

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    //回车发送消息
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim()) {
                sendMessage({ text: input });
            }
        }
    };

    return (
        <div className='flex flex-col h-screen bg-linear-to-br from-blue-50 via-white to-purple-50'>
            {/* 头部标题 */}
            <div className='bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200'>
                <div className='max-w-4xl mx-auto px-6 py-4'>
                    <h1 className='text-2xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent'>
                        AI 智能助手
                    </h1>
                    <p className='text-sm text-gray-500 mt-1'>随时为您解答问题</p>
                </div>
            </div>

            {/* 消息区域 */}
            <div className='flex-1 overflow-y-auto px-4 py-6'>
                <div className='max-w-4xl mx-auto space-y-4'>
                    {messages.length === 0 ? (
                        <div className='flex flex-col items-center justify-center h-full text-center py-20'>
                            <div className='bg-linear-to-br from-blue-100 to-purple-100 rounded-full p-6 mb-4'>
                                <svg className='w-12 h-12 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' />
                                </svg>
                            </div>
                            <h2 className='text-xl font-semibold text-gray-700 mb-2'>开始对话</h2>
                            <p className='text-gray-500'>输入您的问题，我会尽力帮助您</p>
                        </div>
                    ) : (
                        messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                            >
                                <div className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {/* 头像 */}
                                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold ${
                                        message.role === 'user' 
                                            ? 'bg-linear-to-br from-blue-500 to-blue-600' 
                                            : 'bg-linear-to-br from-purple-500 to-purple-600'
                                    }`}>
                                        {message.role === 'user' ? '你' : 'AI'}
                                    </div>
                                    
                                    {/* 消息内容 */}
                                    <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        {/* 工具调用状态（type 格式为 tool-getWeather、tool-calculator 等） */}
                                        {message.parts
                                            .filter((part) => part.type.startsWith('tool-'))
                                            .map((part, index) => {
                                                const invocation = part as { type: string; toolName?: string; state: string };
                                                // 从 type 中提取工具名：tool-getWeather → getWeather
                                                const toolName = invocation.type.replace('tool-', '');
                                                const toolNameMap: Record<string, string> = {
                                                    getWeather: '天气查询',
                                                    calculator: '数学计算',
                                                    search: '联网搜索',
                                                    terminal: '执行命令',
                                                    readFile: '读取文件',
                                                    writeFile: '写入文件',
                                                    listFiles: '列出文件',
                                                    gitStatus: 'Git 状态',
                                                    gitDiff: '查看变更',
                                                    gitLog: '提交记录',
                                                    gitBranch: '查看分支',
                                                    gitNewBranch: '新建分支',
                                                    gitAdd: '暂存文件',
                                                    gitCommit: '提交代码',
                                                    gitPush: '推送到远程',
                                                };
                                                const displayName = toolNameMap[toolName] || toolName;
                                                const stateMap: Record<string, { text: string; color: string }> = {
                                                    result: { text: '✅ 完成', color: 'text-green-600' },
                                                    'input-available': { text: '⏳ 执行中…', color: 'text-blue-600' },
                                                    'output-available': { text: '📤 返回结果', color: 'text-purple-600' },
                                                };
                                                const s = stateMap[invocation.state] || { text: invocation.state, color: 'text-gray-500' };
                                                return (
                                                    <div key={index} className={`text-xs ${s.color} mb-1`}>
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
                                                    <span key={index}>{(part as { text: string }).text}</span>
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
                    </div>
                </div>
            </div>
        </div>
    );
}
