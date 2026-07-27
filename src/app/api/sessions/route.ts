import { NextResponse } from 'next/server';
import { sessionsRepo } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/sessions → 列表
export const GET = async () => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const list = sessionsRepo.listByUser(user.id);
    return NextResponse.json({ sessions: list });
};

// POST /api/sessions → 新建
export const POST = async (req: Request) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    let title = '新对话';
    try {
        const body = await req.json();
        if (body?.title && typeof body.title === 'string') {
            title = body.title.slice(0, 100);
        }
    } catch {
        // 允许空 body
    }

    const s = sessionsRepo.create(user.id, title);
    return NextResponse.json({
        session: {
            id: s.id,
            title: s.title,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
        },
    });
};
