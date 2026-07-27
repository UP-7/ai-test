/**
 * Next.js 16 Proxy（即旧版 Middleware）：保护 /api/sessions/* 和 /api/chat
 *
 * 只做 cookie 存在性 + 签名快速校验，DB 查询在具体 route 里通过
 * getCurrentUser() 完成。
 *
 * 注意：Proxy 在 Next.js 16 中恒定运行在 Node.js runtime，
 * 不允许再在 config 里指定 runtime。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth';

export const proxy = (req: NextRequest) => {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = verifySession(token);

    if (!payload) {
        return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 传递给下游 route handler
    const headers = new Headers(req.headers);
    headers.set('x-user-id', payload.userId);
    return NextResponse.next({ request: { headers } });
};

export const config = {
    matcher: ['/api/sessions/:path*', '/api/chat'],
};
