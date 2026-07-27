/**
 * 轻量鉴权：bcrypt 密码 + HMAC 签名 cookie
 *
 * Cookie 值格式: base64url(payload).base64url(signature)
 * payload: {userId, exp}  (JSON)
 * signature: HMAC-SHA256(payload, SESSION_SECRET)
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { usersRepo, type DbUser } from './db';

export const COOKIE_NAME = 'chat_session';
export const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 天

const getSecret = (): string => {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 16) {
        throw new Error(
            'SESSION_SECRET 环境变量未设置或过短（至少 16 位）。请在 .env.local 中配置。'
        );
    }
    return s;
};

// ---------- 密码 ----------

export const hashPassword = async (password: string): Promise<string> =>
    bcrypt.hash(password, 10);

export const verifyPassword = async (password: string, hash: string): Promise<boolean> =>
    bcrypt.compare(password, hash);

// ---------- Cookie 签名 ----------

const b64url = (buf: Buffer | string): string =>
    Buffer.from(buf).toString('base64url');

const b64urlDecode = (s: string): Buffer => Buffer.from(s, 'base64url');

type Payload = { userId: string; exp: number };

export const signSession = (userId: string): string => {
    const payload: Payload = {
        userId,
        exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SEC,
    };
    const payloadB64 = b64url(JSON.stringify(payload));
    const sig = crypto
        .createHmac('sha256', getSecret())
        .update(payloadB64)
        .digest();
    return `${payloadB64}.${b64url(sig)}`;
};

export const verifySession = (token: string | undefined): Payload | null => {
    if (!token) return null;
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;

    const expected = crypto
        .createHmac('sha256', getSecret())
        .update(payloadB64)
        .digest();
    const actual = b64urlDecode(sigB64);

    if (expected.length !== actual.length) return null;
    if (!crypto.timingSafeEqual(expected, actual)) return null;

    try {
        const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as Payload;
        if (!payload.userId || !payload.exp) return null;
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
};

// ---------- Server 端便捷函数 ----------

/** 在 Route Handler 里获取当前登录用户 */
export const getCurrentUser = async (): Promise<DbUser | null> => {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    const payload = verifySession(token);
    if (!payload) return null;
    return usersRepo.findById(payload.userId) ?? null;
};

/** 校验邀请码（如果配置了 INVITE_CODE） */
export const checkInviteCode = (code: string | undefined): boolean => {
    const expected = process.env.INVITE_CODE;
    if (!expected) return true; // 未配置则视为开放注册
    return code === expected;
};

// ---------- 输入校验 ----------

export const validateUsername = (u: string): string | null => {
    if (!u || typeof u !== 'string') return '用户名必填';
    if (u.length < 2 || u.length > 32) return '用户名长度应为 2-32 位';
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/.test(u))
        return '用户名仅允许字母/数字/下划线/中横线/中文';
    return null;
};

export const validatePassword = (p: string): string | null => {
    if (!p || typeof p !== 'string') return '密码必填';
    if (p.length < 6 || p.length > 128) return '密码长度应为 6-128 位';
    return null;
};
