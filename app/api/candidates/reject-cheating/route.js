/**
 * POST /api/candidates/reject-cheating
 * Handles instant test cancellation & candidate rejection when window focus is lost or tab is switched.
 * Updates candidate application status to 'rejected_cheating' and marks candidate email/CV as rejected.
 */
import { NextResponse } from 'next/server.js';
import { getSession } from '../../../../lib/auth/index.js';
import { dbGet, dbRun } from '../../../../lib/db/index.js';
import { sendEmail } from '../../../../lib/email/index.js';

export async function POST(req) {
  try {
    const session = await getSession();
    const body = await req.json();
    const candidateId = body.candidateId || session?.userId;
    const stage = body.stage || 'assessment';
    const reason = body.reason || 'Window or tab switch detected during timed assessment';

    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'candidateId is required' }, { status: 400 });
    }

    // 1. Update application status to rejected_cheating
    await dbRun(`
      UPDATE applications
      SET status = 'rejected_cheating'
      WHERE candidate_id = ?
    `, [candidateId]);

    // 2. Mark candidate record as rejected
    await dbRun(`
      UPDATE candidates
      SET consent = 0
      WHERE id = ?
    `, [candidateId]);

    // 3. Upsert scorecard with 0 score and rejection flag
    const existingSc = await dbGet('SELECT id FROM scorecards WHERE candidate_id = ?', [candidateId]);
    const completedAt = new Date().toISOString();

    const flagText = `Security Violation (${stage}): ${reason}`;
    if (existingSc) {
      await dbRun(`
        UPDATE scorecards
        SET total_score = 0, stage2_status = 'rejected', stage3_status = 'rejected',
            cheating_flag = 1, cheating_reason = ?, failed_stage = ?, verdict = 'REJECTED_CHEATING',
            bias_flags = ?
        WHERE candidate_id = ?
      `, [flagText, stage, JSON.stringify([flagText]), candidateId]);
    } else {
      const { v4: uuidv4 } = await import('uuid');
      await dbRun(`
        INSERT INTO scorecards (id, candidate_id, ats_score, quiz_score, quiz_percentage, stage2_status, stage3_status, total_score, factors, bias_flags, cheating_flag, cheating_reason, failed_stage, verdict, model_version, created_at)
        VALUES (?, ?, 0, 0, 0, 'rejected', 'rejected', 0, '[]', ?, 1, ?, ?, 'REJECTED_CHEATING', 'veer-score-1.0', ?)
      `, [uuidv4(), candidateId, JSON.stringify([flagText]), flagText, stage, completedAt]);
    }

    // 4. Send rejection email notification
    const candidate = await dbGet('SELECT first_name, email FROM candidates WHERE id = ?', [candidateId]);
    if (candidate && candidate.email) {
      const subject = `⚠️ Application Update — Assessment Terminated & Candidate Status Rejected`;
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;border:2px solid #dc2626;">
          <h2 style="color:#dc2626;margin-top:0;">Assessment Security Violation — Application Cancelled</h2>
          <p>Dear ${candidate.first_name || 'Candidate'},</p>
          <p>During your <strong>${stage.toUpperCase()}</strong> on Veer, our anti-cheating monitoring system detected a <strong>window focus loss / tab switch event</strong> (e.g. opening another browser like Microsoft Edge, switching tabs, or bringing another application in front of the exam window).</p>
          <div style="background:#fff5f5;border:1.5px solid #fecaca;padding:16px;border-radius:10px;margin:18px 0;">
            <strong style="color:#b91c1c;">Status: APPLICATION REJECTED &amp; LOCKED</strong><br/>
            <span style="font-size:13.5px;color:#7f1d1d;">Reason: Violation of anti-cheating policy (${reason}). Per our exam integrity rules, your CV and email address have been marked as rejected for this vacancy.</span>
          </div>
          <p style="font-size:13px;color:#6b7280;">If you believe this occurred due to a system error, please contact Veer support.</p>
        </div>
      `;
      sendEmail({ to: candidate.email, subject, html }).catch(err =>
        console.error('[CHEATING REJECTION EMAIL ERROR]', err.message)
      );
    }

    return NextResponse.json({
      ok: true,
      candidateId,
      status: 'rejected_cheating',
      message: 'Assessment cancelled and candidate marked as rejected due to security focus violation.',
    });
  } catch (err) {
    console.error('[REJECT CHEATING ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
