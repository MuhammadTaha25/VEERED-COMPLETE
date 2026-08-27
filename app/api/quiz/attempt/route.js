/**
 * GET /api/quiz/attempt?id=...
 * Returns status and DB record of a quiz attempt.
 */
import { NextResponse } from 'next/server.js';
import { dbGet } from '../../../../lib/db/index.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const candidateId = searchParams.get('candidateId');

    if (id) {
      const attempt = await dbGet('SELECT id, candidate_id, score, total_questions, percentage, passed, started_at, completed_at FROM quiz_attempts WHERE id = ?', [id]);
      if (!attempt) return NextResponse.json({ ok: false, error: 'Attempt not found' }, { status: 404 });
      return NextResponse.json({ ok: true, attempt });
    }

    if (candidateId) {
      const attempt = await dbGet('SELECT id, candidate_id, score, total_questions, percentage, passed, started_at, completed_at FROM quiz_attempts WHERE candidate_id = ? ORDER BY started_at DESC LIMIT 1', [candidateId]);
      if (!attempt) return NextResponse.json({ ok: false, error: 'No attempts found for candidate' }, { status: 404 });
      return NextResponse.json({ ok: true, attempt });
    }

    return NextResponse.json({ ok: false, error: 'id or candidateId required' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
