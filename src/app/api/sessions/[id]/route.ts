import { NextResponse } from 'next/server';
import { sessionsRepo, messagesRepo } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/sessions/[id] → 详情 + messages
export const GET = async (_req: Request, { params }: Ctx) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const s = sessionsRepo.get(id, user.id);
    if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const messages = messagesRepo.listBySession(id);
    return NextResponse.json({
        session: {
            id: s.id,
            title: s.title,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
        },
        messages,
    });
};

// PATCH /api/sessions/[id] → 改标题
export const PATCH = async (req: Request, { params }: Ctx) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const s = sessionsRepo.get(id, user.id);
    if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const title = (body?.title as string | undefined)?.trim();
    if (!title) return NextResponse.json({ error: 'title 必填' }, { status: 400 });

    sessionsRepo.updateTitle(id, user.id, title.slice(0, 100));
    return NextResponse.json({ ok: true });
};

// DELETE /api/sessions/[id]
export const DELETE = async (_req: Request, { params }: Ctx) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    sessionsRepo.remove(id, user.id);
    return NextResponse.json({ ok: true });
};
