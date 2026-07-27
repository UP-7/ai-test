import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { usersRepo } from '@/lib/db';
import { verifyPassword, signSession, COOKIE_NAME, COOKIE_MAX_AGE_SEC } from '@/lib/auth';

export const POST = async (req: Request) => {
    try {
        const { username, password } = await req.json();
        if (!username || !password) {
            return NextResponse.json({ error: '用户名和密码必填' }, { status: 400 });
        }

        const user = usersRepo.findByUsername(username);
        if (!user) {
            return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
        }

        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) {
            return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
        }

        const token = signSession(user.id);
        const store = await cookies();
        store.set(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: COOKIE_MAX_AGE_SEC,
            secure: process.env.NODE_ENV === 'production',
        });

        return NextResponse.json({ user: { id: user.id, username: user.username } });
    } catch (e) {
        console.error('login error', e);
        return NextResponse.json({ error: '登录失败' }, { status: 500 });
    }
};
