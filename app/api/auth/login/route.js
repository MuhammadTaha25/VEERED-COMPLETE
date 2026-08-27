/**
 * POST /api/auth/login
 * Authenticate a candidate or recruiter by email + password.
 */
import { NextResponse } from 'next/server';
import { dbGet } from '@/lib/db/index.js';
import { verifyPassword, createUserSession } from '@/lib/auth/index.js';

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check candidates first, then recruiters
    let user = await dbGet('SELECT id, email, password_hash, role FROM candidates WHERE email = ?', [normalizedEmail]);
    if (!user) {
      user = await dbGet('SELECT id, email, password_hash, role FROM recruiters WHERE email = ?', [normalizedEmail]);
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    await createUserSession({ id: user.id, email: user.email, role: user.role });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[AUTH LOGIN]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
