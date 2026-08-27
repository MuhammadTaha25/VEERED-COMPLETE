/**
 * GET /api/quiz/start
 * Serves 35 randomly selected questions from the 240-question bank.
 * Strips correct answers and rationales before sending to client for security.
 * Creates a quiz_attempts database record.
 */
import { NextResponse } from 'next/server.js';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../../../../lib/auth/index.js';
import { dbAll, dbRun } from '../../../../lib/db/index.js';

export async function GET(req) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId') || session?.userId || 'guest-candidate';

    // Serves 35 randomly selected questions from the question bank.
    const selected = await dbAll(`
      SELECT id, external_id, section, category, type, difficulty, question, options, image
      FROM quiz_questions
      ORDER BY random()
      LIMIT 35
    `);

    // Prepare candidate-facing payload (parse options JSON into {id, text} objects)
    const clientQuestions = selected.map(q => {
      let rawOpts = typeof q.options === 'string' ? JSON.parse(q.options || '[]') : q.options;
      let formattedOpts = [];
      if (Array.isArray(rawOpts)) {
        formattedOpts = rawOpts.map((o, idx) => ({
          id: typeof o === 'object' && o !== null && o.id ? String(o.id) : String.fromCharCode(65 + idx),
          text: typeof o === 'object' && o !== null ? (o.text || o.label || String(o.id || '')) : String(o)
        }));
      } else if (rawOpts && typeof rawOpts === 'object') {
        formattedOpts = Object.entries(rawOpts).map(([key, val], idx) => ({
          id: key || String.fromCharCode(65 + idx),
          text: typeof val === 'object' && val !== null ? (val.text || val.label || String(val.id || '')) : String(val)
        }));
      }
      if (!formattedOpts || formattedOpts.length === 0) {
        formattedOpts = [
          { id: 'A', text: 'True' },
          { id: 'B', text: 'False' }
        ];
      }
      return {
        id: q.id,
        externalId: q.external_id,
        category: q.category,
        type: q.type,
        difficulty: q.difficulty,
        question: q.question,
        options: formattedOpts,
        image: q.image,
      };
    });

    const attemptId = uuidv4();
    const servedIds = selected.map(q => q.id);

    // Store new quiz attempt in database
    await dbRun(`
      INSERT INTO quiz_attempts (id, candidate_id, questions_served, answers, score, total_questions, percentage, passed, started_at)
      VALUES (?, ?, ?, '{}', 0, ?, 0, 0, now())
    `, [attemptId, candidateId, JSON.stringify(servedIds), selected.length]);

    return NextResponse.json({
      ok: true,
      attemptId,
      totalQuestions: selected.length,
      timeLimitMinutes: 40,
      passThresholdPercent: 80,
      questions: clientQuestions,
    });
  } catch (err) {
    console.error('[QUIZ START ERROR]', err);
    return NextResponse.json(
      { ok: false, error: `Internal server error: ${err.message}` },
      { status: 500 }
    );
  }
}
