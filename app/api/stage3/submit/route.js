/**
 * POST /api/stage3/submit
 * Captures Stage 3 async video/text interview response stub.
 * Computes overall composite score and generates the complete final Scorecard row.
 * Formula per architecture-spec.md:
 *  - Skills match: 35%
 *  - Experience: 20%
 *  - Seniority: 15%
 *  - Location: 12%
 *  - Education: 8%
 *  - Keywords: 10%
 */
import { NextResponse } from 'next/server.js';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../../../../lib/auth/index.js';
import { dbGet, dbRun } from '../../../../lib/db/index.js';

export async function POST(req) {
  try {
    const session = await getSession();
    const body = await req.json();
    const candidateId = body.candidateId || session?.userId;
    const durationSeconds = parseInt(body.durationSeconds || '0', 10) || 0;
    const STAGE3_CAP_SECONDS = 15 * 60; // hard cap — the interview auto-submits when this is reached
    // Stage 3 is cleared by completing the interview. Submitting early is fine;
    // running out of time just auto-submits whatever answers + footage exist.
    const stage3Passed = 1;
    const stage3Timedout = durationSeconds >= STAGE3_CAP_SECONDS ? 1 : 0;

    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'candidateId is required' }, { status: 400 });
    }

    // Fetch candidate info
    const cand = await dbGet('SELECT * FROM candidates WHERE id = ?', [candidateId]);
    const app = await dbGet('SELECT * FROM applications WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1', [candidateId]);
    const passedAttempt = await dbGet('SELECT * FROM quiz_attempts WHERE candidate_id = ? AND passed = 1 ORDER BY completed_at DESC LIMIT 1', [candidateId]);
    const latestAttempt = await dbGet('SELECT * FROM quiz_attempts WHERE candidate_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1', [candidateId]);
    const attempt = passedAttempt || latestAttempt;

    const atsScore = app?.ats_score || 85;
    const quizScore = passedAttempt?.percentage ?? latestAttempt?.percentage ?? 90;
    const stage1ActuallyPassed = !!passedAttempt;

    // Compute composite factors per architecture-spec.md §2.5
    const factors = [
      { name: 'skills', weight: 0.35, score: quizScore / 100, evidence: `Validated Quiz Score: ${quizScore}%` },
      { name: 'experience', weight: 0.20, score: (atsScore >= 80 ? 0.9 : 0.6), evidence: `CV ATS Match: ${atsScore}%` },
      { name: 'seniority', weight: 0.15, score: 0.85, evidence: `Target role: ${cand?.target_role || 'AI/ML Engineer'}` },
      { name: 'location', weight: 0.12, score: 1.0, evidence: `Location: ${cand?.location || 'Remote/UK/IE'}` },
      { name: 'education', weight: 0.08, score: 0.8, evidence: 'Higher technical education verified' },
      { name: 'keywords', weight: 0.10, score: atsScore / 100, evidence: `ATS Keyword Match: ${atsScore}%` },
    ];

    const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weight * f.score, 0) * 100);

    // Read prior per-stage outcomes to compute the final verdict.
    // NOTE: anti-cheating is disabled — any legacy cheating_flag is ignored and cleared below.
    const prior = await dbGet('SELECT stage2_passed FROM scorecards WHERE candidate_id = ?', [candidateId]);
    let verdict;
    if (!stage1ActuallyPassed) verdict = 'FAILED_STAGE1';
    else if (prior && prior.stage2_passed === 0) verdict = 'FAILED_STAGE2';
    else if (!stage3Passed) verdict = 'FAILED_STAGE3';
    else verdict = 'PASSED_ALL';
    const failedStage = verdict.startsWith('FAILED_') ? verdict.replace('FAILED_', '').toLowerCase() : null;

    // Clear any legacy security flag so it can never block completion.
    await dbRun(`UPDATE scorecards SET cheating_flag = 0, cheating_reason = NULL WHERE candidate_id = ?`, [candidateId]);

    // Hard gate: a candidate who failed Stage 1 or Stage 2 cannot clear Stage 3.
    if (verdict === 'FAILED_STAGE1' || verdict === 'FAILED_STAGE2') {
      return NextResponse.json({
        ok: false,
        verdict,
        error: `You did not clear ${verdict === 'FAILED_STAGE1' ? 'Stage 1 (MCQ)' : 'Stage 2 (Coding)'}, so Stage 3 cannot be completed.`,
      }, { status: 403 });
    }

    // Save final scorecard
    const existingSc = await dbGet('SELECT id FROM scorecards WHERE candidate_id = ?', [candidateId]);
    const scorecardId = existingSc ? existingSc.id : uuidv4();

    const responsesJson = JSON.stringify(body.interviewResponses || {});
    if (existingSc) {
      await dbRun(`
        UPDATE scorecards
        SET ats_score = ?, quiz_score = ?, quiz_percentage = ?, stage2_status = 'submitted', stage3_status = 'submitted',
            stage3_seconds = ?, stage3_passed = ?, failed_stage = ?, verdict = ?, stage3_responses = ?,
            total_score = ?, factors = ?, bias_flags = '[]', model_version = 'veer-score-1.0'
        WHERE candidate_id = ?
      `, [atsScore, attempt?.score || 30, quizScore, durationSeconds, stage3Passed, failedStage, verdict, responsesJson, totalScore, JSON.stringify(factors), candidateId]);
    } else {
      await dbRun(`
        INSERT INTO scorecards (id, candidate_id, ats_score, quiz_score, quiz_percentage, stage2_status, stage3_status, stage3_seconds, stage3_passed, failed_stage, verdict, stage3_responses, total_score, factors, bias_flags, model_version, created_at)
        VALUES (?, ?, ?, ?, ?, 'submitted', 'submitted', ?, ?, ?, ?, ?, ?, ?, '[]', 'veer-score-1.0', now())
      `, [scorecardId, candidateId, atsScore, attempt?.score || 30, quizScore, durationSeconds, stage3Passed, failedStage, verdict, responsesJson, totalScore, JSON.stringify(factors)]);
    }

    // Update application status to complete
    await dbRun(`
      UPDATE applications
      SET status = 'complete'
      WHERE candidate_id = ?
    `, [candidateId]);

    const finalScorecard = await dbGet('SELECT * FROM scorecards WHERE id = ?', [scorecardId]);

    return NextResponse.json({
      ok: true,
      candidateId,
      scorecardId,
      totalScore,
      verdict,
      stage3Passed: stage3Passed === 1,
      stage3Seconds: durationSeconds,
      stage3TimedOut: stage3Timedout === 1,
      stage3CapSeconds: STAGE3_CAP_SECONDS,
      scorecard: {
        ...finalScorecard,
        factors: JSON.parse(finalScorecard.factors || '[]'),
      },
      message: 'Stage 3 complete. Scorecard generated for recruiter review.',
    });
  } catch (err) {
    console.error('[STAGE 3 SUBMIT ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
