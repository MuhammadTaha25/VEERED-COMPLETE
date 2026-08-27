/**
 * POST /api/auth/google
 * Handle Google OAuth token verification and candidate login/signup.
 * Verifies the Google ID token, creates or updates the candidate record.
 */
import { NextResponse } from 'next/server.js';
import { dbGet, dbRun } from '../../../../lib/db/index.js';
import { createUserSession } from '../../../../lib/auth/index.js';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req) {
  try {
    const { credential } = await req.json();

    if (!credential) {
      return NextResponse.json({ error: 'Google credential token is required' }, { status: 400 });
    }

    // Verify the Google ID token using Google's tokeninfo endpoint
    const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'Invalid Google token' }, { status: 401 });
    }

    const tokenData = await tokenRes.json();

    // Validate audience matches our client ID
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && clientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE' && tokenData.aud !== clientId) {
      return NextResponse.json({ error: 'Token audience mismatch' }, { status: 401 });
    }

    const { email, given_name, family_name, name, sub: googleId } = tokenData;

    if (!email) {
      return NextResponse.json({ error: 'Email not provided by Google' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const firstName = given_name || name?.split(' ')[0] || 'Candidate';
    const lastName = family_name || name?.split(' ').slice(1).join(' ') || '';

    // Check if candidate already exists
    let candidate = await dbGet('SELECT * FROM candidates WHERE email = ?', [normalizedEmail]);
    let isNew = false;

    if (candidate) {
      // Update Google ID if not already set
      await dbRun(
        `UPDATE candidates SET first_name = ?, last_name = ? WHERE id = ?`,
        [firstName, lastName, candidate.id]
      );
    } else {
      // Create new candidate via Google Sign-Up
      isNew = true;
      const id = uuidv4();
      const dummyHash = '$2a$12$google.oauth.no.password.needed.placeholder.hash.value';

      await dbRun(
        `INSERT INTO candidates (id, email, password_hash, first_name, last_name, location, target_role, role, consent)
         VALUES (?, ?, ?, ?, ?, '', '', 'candidate', 1)`,
        [id, normalizedEmail, dummyHash, firstName, lastName]
      );

      candidate = await dbGet('SELECT * FROM candidates WHERE id = ?', [id]);
    }

    await createUserSession({
      id: candidate.id,
      email: normalizedEmail,
      role: 'candidate',
    });

    return NextResponse.json({
      ok: true,
      isNew,
      candidateId: candidate.id,
      user: {
        id: candidate.id,
        email: normalizedEmail,
        firstName,
        lastName,
        role: 'candidate',
      },
      redirect: '/upload-cv.html',
    });
  } catch (err) {
    console.error('[GOOGLE AUTH ERROR]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
