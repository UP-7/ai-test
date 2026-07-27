'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, inviteCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErr(data.error || '注册失败');
                return;
            }
            router.push('/');
            router.refresh();
        } catch {
            setErr('网络错误');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='flex items-center justify-center h-screen bg-linear-to-br from-blue-50 via-white to-purple-50'>
            <form
                onSubmit={submit}
                className='bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl p-8 w-full max-w-sm border border-gray-100'
            >
                <h1 className='text-2xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6'>
                    注册
                </h1>

                <label className='block text-sm text-gray-600 mb-1'>用户名</label>
                <input
                    className='w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                />

                <label className='block text-sm text-gray-600 mb-1'>密码</label>
                <input
                    type='password'
                    className='w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                <label className='block text-sm text-gray-600 mb-1'>
                    邀请码 <span className='text-gray-400'>（如管理员未设置可留空）</span>
                </label>
                <input
                    className='w-full mb-4 px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                />

                {err && <div className='text-sm text-red-500 mb-3'>{err}</div>}

                <Button
                    type='submit'
                    disabled={loading}
                    className='w-full bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg'
                >
                    {loading ? '注册中…' : '注册'}
                </Button>

                <div className='text-sm text-gray-500 mt-4 text-center'>
                    已有账号？{' '}
                    <Link href='/login' className='text-blue-600 hover:underline'>
                        去登录
                    </Link>
                </div>
            </form>
        </div>
    );
}
