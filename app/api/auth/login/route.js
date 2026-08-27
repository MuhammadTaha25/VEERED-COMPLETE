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

    // The same email can exist in BOTH tables (e.g. an admin who also registered
    // as a candidate). Try both and accept whichever password verifies, preferring
    // the higher-privilege recruiter/admin record.
    const candidate = await dbGet('SELECT id, email, password_hash, role FROM candidates WHERE email = ?', [normalizedEmail]);
    const recruiter = await dbGet('SELECT id, email, password_hash, role FROM recruiters WHERE email = ?', [normalizedEmail]);

    let user = null;
    if (recruiter && await verifyPassword(password, recruiter.password_hash)) {
      user = recruiter;
    } else if (candidate && await verifyPassword(password, candidate.password_hash)) {
      user = candidate;
    }

    if (!user) {
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
