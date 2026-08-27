/**
 * POST /api/quiz/submit
 * Evaluates candidate answers for a quiz attempt.
 * Threshold: 70% pass threshold.
 * Timestamps completion date/time on pass to gate Stage 2 (24hr delay + 24hr window).
 */
import { NextResponse } from 'next/server.js';
import { dbGet, dbAll, dbRun } from '../../../../lib/db/index.js';
import { sendEmail } from '../../../../lib/email/index.js';
import { stage1PassEmail, stage1FailEmail } from '../../../../lib/email/templates.js';

export async function POST(req) {
  try {
    const { attemptId, answers } = await req.json();

    if (!attemptId) {
      return NextResponse.json(
        { ok: false, error: 'attemptId is required' },
        { status: 400 }
      );
    }

    // Retrieve attempt record
    const attempt = await dbGet('SELECT * FROM quiz_attempts WHERE id = ?', [attemptId]);
    if (!attempt) {
      return NextResponse.json(
        { ok: false, error: 'Quiz attempt not found' },
        { status: 404 }
      );
    }

    const servedIds = JSON.parse(attempt.questions_served || '[]');
    const candidateAnswers = answers || {};

    let correctCount = 0;
    const itemResults = [];

    // Evaluate each question served
    for (const qid of servedIds) {
      const q = await dbGet('SELECT id, external_id, type, options, correct_answer_ids FROM quiz_questions WHERE id = ?', [qid]);
      if (!q) continue;

      const correctIds = JSON.parse(q.correct_answer_ids || '[]');
      const userAns = candidateAnswers[qid];

      let rawOpts = [];
      try {
        rawOpts = typeof q.options === 'string' ? JSON.parse(q.options || '[]') : (q.options || []);
      } catch(e){}

      let matchedId = userAns;
      if (typeof userAns === 'string' && Array.isArray(rawOpts)) {
        const found = rawOpts.find((o, idx) => o.id === userAns || o.text === userAns || String.fromCharCode(65 + idx) === userAns);
        if (found && found.id) {
          matchedId = found.id;
        }
      }

      let isCorrect = false;
      if (Array.isArray(userAns)) {
        const sortedUser = [...userAns].sort();
        const sortedCorrect = [...correctIds].sort();
        isCorrect = JSON.stringify(sortedUser) === JSON.stringify(sortedCorrect);
      } else if (typeof userAns === 'string') {
        isCorrect = correctIds.includes(userAns) || correctIds.includes(matchedId);
      }

      if (isCorrect) correctCount++;

      itemResults.push({
        questionId: qid,
        externalId: q.external_id,
        isCorrect,
      });
    }

    const PASS_THRESHOLD = 80;
    const totalQuestions = servedIds.length || 5;
    const percentage = Math.round((correctCount / totalQuestions) * 100);
    const passed = percentage >= PASS_THRESHOLD ? 1 : 0;
    const completedAt = new Date().toISOString();

    // Update attempt record
    await dbRun(`
      UPDATE quiz_attempts
      SET answers = ?, score = ?, total_questions = ?, percentage = ?, passed = ?, completed_at = ?
      WHERE id = ?
    `, [JSON.stringify(candidateAnswers), correctCount, totalQuestions, percentage, passed, completedAt, attemptId]);

    // Update applicant status in applications table if present
    if (attempt.candidate_id) {
      const appStatus = passed ? 'quiz_passed' : 'quiz_failed';
      await dbRun(`
        UPDATE applications
        SET status = ?
        WHERE candidate_id = ? AND status IN ('submitted', 'ats_passed', 'quiz_pending')
      `, [appStatus, attempt.candidate_id]);

      // Create or update scorecard row (both pass and fail, so the admin panel sees everyone)
      const existingSc = await dbGet('SELECT id FROM scorecards WHERE candidate_id = ?', [attempt.candidate_id]);
      const failedStage = passed ? null : 'stage1';
      const verdict = passed ? null : 'FAILED_STAGE1';
      if (!existingSc) {
        const { v4: uuidv4 } = await import('uuid');
        await dbRun(`
          INSERT INTO scorecards (id, candidate_id, quiz_score, quiz_percentage, stage2_status, failed_stage, verdict, total_score, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [uuidv4(), attempt.candidate_id, correctCount, percentage, passed ? 'pending' : null, failedStage, verdict, passed ? null : 0, completedAt]);
      } else {
        await dbRun(`
          UPDATE scorecards
          SET quiz_score = ?, quiz_percentage = ?, stage2_status = ?, failed_stage = ?, verdict = ?
          WHERE candidate_id = ?
        `, [correctCount, percentage, passed ? 'pending' : null, failedStage, verdict, attempt.candidate_id]);
      }
    }

    // ─── Send email notification ───────────────────────────────────────────
    if (attempt.candidate_id) {
      const candidate = await dbGet(
        'SELECT first_name, last_name, email FROM candidates WHERE id = ?',
        [attempt.candidate_id]
      );

      if (candidate && candidate.email) {
        if (passed) {
          // Stage 2 opens IMMEDIATELY upon pass, closes 48h after pass
          const stage2OpensAt = completedAt;
          const stage2ClosesAt = new Date(new Date(completedAt).getTime() + 48 * 60 * 60 * 1000).toISOString();
          const host = req.headers.get('host') || 'localhost:3000';
          const protocol = req.headers.get('x-forwarded-proto') || 'http';
          const stage2Link = `${protocol}://${host}/ai-skill-test.html?stage=2&candidateId=${attempt.candidate_id}`;

          const { subject, html } = stage1PassEmail({
            firstName: candidate.first_name,
            score: correctCount,
            percentage,
            completedAt,
            stage2OpensAt,
            stage2ClosesAt,
            stage2Link,
          });
          await sendEmail({ to: candidate.email, subject, html });
        } else {
          const { subject, html } = stage1FailEmail({
            firstName: candidate.first_name,
            score: correctCount,
            percentage,
          });
          await sendEmail({ to: candidate.email, subject, html });
        }
      }
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const stage2Url = `${protocol}://${host}/stage2.html?candidateId=${attempt.candidate_id || ''}`;

    return NextResponse.json({
      ok: true,
      attemptId,
      score: correctCount,
      totalQuestions,
      percentage,
      passed: passed === 1,
      passThresholdPercent: PASS_THRESHOLD,
      completedAt,
      stage2Url: passed ? stage2Url : null,
      message: passed ? 'Congratulations! You passed Stage 1. Stage 2 (Coding Challenge) is OPEN NOW!' : `You scored below the ${PASS_THRESHOLD}% pass threshold.`,
    });

  } catch (err) {
    console.error('[QUIZ SUBMIT ERROR]', err);
    return NextResponse.json(
      { ok: false, error: `Internal server error: ${err.message}` },
      { status: 500 }
    );
  }
}
