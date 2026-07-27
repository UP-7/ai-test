import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { usersRepo } from '@/lib/db';
import {
    hashPassword,
    signSession,
    checkInviteCode,
    validateUsername,
    validatePassword,
    COOKIE_NAME,
    COOKIE_MAX_AGE_SEC,
} from '@/lib/auth';

export const POST = async (req: Request) => {
    try {
        const { username, password, inviteCode } = await req.json();

        const userErr = validateUsername(username);
        if (userErr) return NextResponse.json({ error: userErr }, { status: 400 });

        const pwErr = validatePassword(password);
        if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

        if (!checkInviteCode(inviteCode)) {
            return NextResponse.json({ error: '邀请码错误' }, { status: 403 });
        }

        if (usersRepo.findByUsername(username)) {
            return NextResponse.json({ error: '用户名已被占用' }, { status: 409 });
        }

        const hash = await hashPassword(password);
        const user = usersRepo.create(username, hash);

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
        console.error('register error', e);
        return NextResponse.json({ error: '注册失败' }, { status: 500 });
    }
};
