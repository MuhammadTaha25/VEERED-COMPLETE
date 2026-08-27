/**
 * POST /api/stage2/submit
 * Captures candidate code submissions for the 2 coding questions.
 * Updates scorecard stage2_status to 'submitted'.
 */
import { NextResponse } from 'next/server.js';
import { getSession } from '../../../../lib/auth/index.js';
import { dbGet, dbRun } from '../../../../lib/db/index.js';

export async function POST(req) {
  try {
    const session = await getSession();
    const { candidateId: bodyCandidateId, codeSubmissions } = await req.json();
    const candidateId = bodyCandidateId || session?.userId;

    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'candidateId is required' }, { status: 400 });
    }

    if (!codeSubmissions || Object.keys(codeSubmissions).length === 0) {
      return NextResponse.json({ ok: false, error: 'codeSubmissions are required' }, { status: 400 });
    }

    // Auto-scoring: both problems answered with real content => pass at 75%.
    const PASS_THRESHOLD = 70;
    const answers = Object.values(codeSubmissions).map(v => String(v || '').trim());
    const bothAnswered = answers.length >= 2 && answers.every(a => a.length >= 20);
    const stage2Score = bothAnswered ? 75 : Math.round((answers.filter(a => a.length >= 20).length / 2) * 60);
    const stage2Passed = stage2Score >= PASS_THRESHOLD ? 1 : 0;

    // Update application status
    await dbRun(`
      UPDATE applications
      SET status = ?
      WHERE candidate_id = ?
    `, [stage2Passed ? 'stage2_done' : 'stage2_failed', candidateId]);

    // Update scorecard stage2 fields (upsert-safe). Never clear an earlier
    // Stage 1 failure or a cheating flag just because Stage 2 was submitted.
    const existingSc = await dbGet('SELECT id, verdict, failed_stage, cheating_flag FROM scorecards WHERE candidate_id = ?', [candidateId]);
    const priorFailure = existingSc && (existingSc.cheating_flag || (existingSc.verdict && existingSc.verdict !== 'FAILED_STAGE2' && existingSc.verdict.startsWith('FAILED_')));
    const failedStage = priorFailure ? existingSc.failed_stage : (stage2Passed ? null : 'stage2');
    const verdict = priorFailure ? existingSc.verdict : (stage2Passed ? null : 'FAILED_STAGE2');
    const submissionsJson = JSON.stringify(codeSubmissions);
    if (existingSc) {
      await dbRun(`
        UPDATE scorecards
        SET stage2_status = 'submitted', stage2_score = ?, stage2_passed = ?, failed_stage = ?, verdict = ?, stage2_submissions = ?
        WHERE candidate_id = ?
      `, [stage2Score, stage2Passed, failedStage, verdict, submissionsJson, candidateId]);
    } else {
      const { v4: uuidv4 } = await import('uuid');
      await dbRun(`
        INSERT INTO scorecards (id, candidate_id, stage2_status, stage2_score, stage2_passed, failed_stage, verdict, total_score, stage2_submissions, created_at)
        VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, ?, now())
      `, [uuidv4(), candidateId, stage2Score, stage2Passed, failedStage, verdict, stage2Passed ? null : 0, submissionsJson]);
    }

    return NextResponse.json({
      ok: true,
      candidateId,
      stage2Status: 'submitted',
      stage2Score,
      passed: stage2Passed === 1,
      passThresholdPercent: PASS_THRESHOLD,
      message: stage2Passed
        ? 'Stage 2 coding submission received. Proceed to Stage 3 video interview.'
        : 'Stage 2 submission received but did not meet the 70% threshold.',
    });
  } catch (err) {
    console.error('[STAGE 2 SUBMIT ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
