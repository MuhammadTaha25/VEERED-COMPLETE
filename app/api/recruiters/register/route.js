/**
 * POST /api/recruiters/register
 * Create a new recruiter/employer account.
 */
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRun } from '@/lib/db/index.js';
import { hashPassword, createUserSession } from '@/lib/auth/index.js';

export async function POST(req) {
  try {
    const { companyName, email, password } = await req.json();

    if (!companyName || !email || !password) {
      return NextResponse.json(
        { error: 'Company name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 12 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await dbGet('SELECT id FROM recruiters WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const id = uuidv4();
    const passwordHash = await hashPassword(password);

    await dbRun(
      `INSERT INTO recruiters (id, email, password_hash, company_name, role)
       VALUES (?, ?, ?, ?, 'recruiter')`,
      [id, normalizedEmail, passwordHash, companyName.trim()]
    );

    await createUserSession({ id, email: normalizedEmail, role: 'recruiter' });

    return NextResponse.json({
      ok: true,
      recruiterId: id,
    });
  } catch (err) {
    console.error('[RECRUITER REGISTER]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
