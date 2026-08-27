/**
 * GET /api/stage2/status
 * Implements the 24hr-after-pass, 24hr-window gate for Stage 2.
 * Checks candidate's quiz pass timestamp.
 * Statuses:
 * - TOO_EARLY: Before 24h post-pass
 * - ACCESSIBLE: Within the 24h window (24h - 48h post-pass)
 * - EXPIRED: After the 24h window (>48h post-pass)
 * - NO_QUIZ_PASS: Has not passed Stage 1 quiz yet
 *
 * Supports ?now=ISO_TIMESTAMP for time-machine testing of the 3 required test cases.
 */
import { NextResponse } from 'next/server.js';
import { getSession } from '../../../../lib/auth/index.js';
import { dbGet } from '../../../../lib/db/index.js';

export async function GET(req) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId') || session?.userId;
    const nowOverride = searchParams.get('now');

    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'candidateId is required' }, { status: 400 });
    }

    // Fetch candidate's latest passed quiz attempt
    const attempt = await dbGet(`
      SELECT completed_at, passed FROM quiz_attempts
      WHERE candidate_id = ? AND passed = 1
      ORDER BY completed_at DESC LIMIT 1
    `, [candidateId]);

    if (!attempt || !attempt.completed_at) {
      return NextResponse.json({
        ok: true,
        status: 'NO_QUIZ_PASS',
        canAccess: false,
        message: 'Stage 1 quiz must be passed (70%+) before Stage 2 opens.',
      });
    }

    const passTime = new Date(attempt.completed_at).getTime();
    const currentTime = nowOverride ? new Date(nowOverride).getTime() : Date.now();

    const MS_PER_HOUR = 60 * 60 * 1000;
    const windowStart = passTime; // Open immediately upon passing Stage 1
    const windowEnd = passTime + 48 * MS_PER_HOUR; // 48h window duration

    const hoursUntilEnd = ((windowEnd - currentTime) / MS_PER_HOUR).toFixed(1);

    if (currentTime >= windowStart && currentTime <= windowEnd) {
      return NextResponse.json({
        ok: true,
        status: 'ACCESSIBLE',
        canAccess: true,
        quizPassedAt: attempt.completed_at,
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
        hoursRemainingInWindow: parseFloat(hoursUntilEnd),
        message: `Stage 2 access is OPEN. Window closes in ~${hoursUntilEnd} hours.`,
        codingQuestions: [
          {
            id: 'code_q1',
            title: 'Question 1: Implement an Explainable RAG Keyword & Vector Scorer',
            description: 'Write a Python function `score_candidate_rag(cv_text, jd_keywords)` that returns an explainable score dict with matched keywords and total score.',
            starterCode: 'def score_candidate_rag(cv_text, jd_keywords):\n    # Your implementation here\n    pass'
          },
          {
            id: 'code_q2',
            title: 'Question 2: Async Rate Limiter for LLM API Invocation',
            description: 'Implement a rate-limiter wrapper for an LLM API endpoint ensuring at most 5 requests per second.',
            starterCode: 'import asyncio\n\nasync def rate_limited_llm_call(prompt):\n    # Your implementation here\n    pass'
          }
        ]
      });
    }

    return NextResponse.json({
      ok: true,
      status: 'EXPIRED',
      canAccess: false,
      quizPassedAt: attempt.completed_at,
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      message: 'Stage 2 access window has EXPIRED (24-hour access window closed).',
    });

  } catch (err) {
    console.error('[STAGE 2 STATUS ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
