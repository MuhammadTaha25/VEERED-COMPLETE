/**
 * POST /api/auth/logout
 * Destroy the current session.
 */
import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth/index.js';

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[AUTH LOGOUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
