import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth';

export const POST = async () => {
    const store = await cookies();
    store.delete(COOKIE_NAME);
    return NextResponse.json({ ok: true });
};
