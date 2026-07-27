import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const GET = async () => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { id: user.id, username: user.username } });
};
