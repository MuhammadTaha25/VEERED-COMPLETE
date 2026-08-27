/**
 * GET /api/auth/me
 * Return the current authenticated user, or 401.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/index.js';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    console.error('[AUTH ME]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
