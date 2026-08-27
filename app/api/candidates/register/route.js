/**
 * POST /api/candidates/register
 * Create a new candidate account.
 */
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRun } from '@/lib/db/index.js';
import { hashPassword, createUserSession } from '@/lib/auth/index.js';
import { sendEmail } from '@/lib/email/index.js';
import { welcomeEmail } from '@/lib/email/templates.js';

export async function POST(req) {
  try {
    const { firstName, lastName, email, password, location, targetRole, consent } = await req.json();

    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json(
        { error: 'First name, last name, email, and password are required' },
        { status: 400 }
      );
    }

    if (!consent) {
      return NextResponse.json(
        { error: 'Data processing consent is required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await dbGet('SELECT id FROM candidates WHERE email = ?', [normalizedEmail]);
    const passwordHash = await hashPassword(password);

    if (existing) {
      // Re-use existing candidate record and update details
      await dbRun(
        `UPDATE candidates
         SET password_hash = ?, first_name = ?, last_name = ?, location = ?, target_role = ?, consent = ?
         WHERE id = ?`,
        [passwordHash, firstName.trim(), lastName.trim(), location || '', targetRole || '', consent ? 1 : 0, existing.id]
      );

      // Reset application status to allow fresh attempt
      await dbRun(
        `UPDATE applications
         SET status = 'new'
         WHERE candidate_id = ?`,
        [existing.id]
      );

      await createUserSession({ id: existing.id, email: normalizedEmail, role: 'candidate' });

      return NextResponse.json({
        ok: true,
        candidateId: existing.id,
        redirect: '/upload-cv.html',
        message: 'Re-registration successful. Welcome back!'
      });
    }

    const id = uuidv4();

    await dbRun(
      `INSERT INTO candidates (id, email, password_hash, first_name, last_name, location, target_role, role, consent)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate', ?)`,
      [id, normalizedEmail, passwordHash, firstName.trim(), lastName.trim(), location || '', targetRole || '', consent ? 1 : 0]
    );

    await createUserSession({ id, email: normalizedEmail, role: 'candidate' });

    return NextResponse.json({
      ok: true,
      candidateId: id,
      redirect: '/upload-cv.html',
    });
  } catch (err) {
    console.error('[CANDIDATE REGISTER ERROR]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
