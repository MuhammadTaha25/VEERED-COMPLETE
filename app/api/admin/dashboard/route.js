/**
 * GET /api/admin/dashboard
 * Admin-only. Returns every candidate with their pipeline outcome:
 * pass/fail, which stage they failed, cheating flag + reason, per-stage scores,
 * Stage 3 interview duration, and a link to the recorded video.
 */
import { NextResponse } from 'next/server.js';
import { requireAdmin } from '../../../../lib/auth/index.js';
import { dbAll } from '../../../../lib/db/index.js';

function verdictLabel(sc) {
  if (!sc) return { verdict: 'IN_PROGRESS', label: 'In progress', failedStage: null, passed: false };
  if (sc.cheating_flag) return { verdict: 'REJECTED_CHEATING', label: 'Rejected — cheating', failedStage: sc.failed_stage, passed: false };
  if (sc.verdict) {
    const map = {
      PASSED_ALL: 'Passed all stages',
      FAILED_STAGE1: 'Failed — Stage 1 (MCQ)',
      FAILED_STAGE2: 'Failed — Stage 2 (Coding)',
      FAILED_STAGE3: 'Failed — Stage 3 (Interview)',
      REJECTED_CHEATING: 'Rejected — cheating',
    };
    return { verdict: sc.verdict, label: map[sc.verdict] || sc.verdict, failedStage: sc.failed_stage, passed: sc.verdict === 'PASSED_ALL' };
  }
  return { verdict: 'IN_PROGRESS', label: 'In progress', failedStage: null, passed: false };
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Admin authentication required.' }, { status: 401 });
    }

    const candidates = await dbAll(`
      SELECT c.id, c.first_name, c.last_name, c.email, c.location, c.target_role, c.created_at
      FROM candidates c
      ORDER BY c.created_at DESC
    `);
    const scorecards = await dbAll('SELECT * FROM scorecards');
    const attempts = await dbAll('SELECT candidate_id, score, percentage, passed, answers, completed_at FROM quiz_attempts ORDER BY started_at DESC');
    const apps = await dbAll('SELECT candidate_id, status, ats_score, ats_passed FROM applications');
    const recordings = await dbAll('SELECT * FROM interview_recordings ORDER BY created_at DESC');

    const scByCand = {};
    scorecards.forEach(s => { scByCand[s.candidate_id] = s; });
    const attemptByCand = {};
    attempts.forEach(a => { if (!attemptByCand[a.candidate_id]) attemptByCand[a.candidate_id] = a; });
    const appByCand = {};
    apps.forEach(a => { if (!appByCand[a.candidate_id]) appByCand[a.candidate_id] = a; });
    const recByCand = {};
    recordings.forEach(r => { if (!recByCand[r.candidate_id]) recByCand[r.candidate_id] = r; });

    const rows = candidates.map(c => {
      const sc = scByCand[c.id];
      const at = attemptByCand[c.id];
      const ap = appByCand[c.id];
      const rec = recByCand[c.id];
      const v = verdictLabel(sc);
      return {
        candidateId: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
        location: c.location,
        targetRole: c.target_role,
        registeredAt: c.created_at,
        applicationStatus: ap?.status || 'none',
        atsScore: sc?.ats_score ?? ap?.ats_score ?? null,
        stage1Percentage: sc?.quiz_percentage ?? at?.percentage ?? null,
        stage1Passed: at ? at.passed === 1 : null,
        stage2Score: sc?.stage2_score ?? null,
        stage2Passed: sc?.stage2_passed === 1 ? true : sc?.stage2_passed === 0 ? false : null,
        stage3Seconds: sc?.stage3_seconds ?? rec?.duration_seconds ?? null,
        stage3Passed: sc?.stage3_passed === 1 ? true : sc?.stage3_passed === 0 ? false : null,
        totalScore: sc?.total_score ?? null,
        quizAnswers: (() => { try { return JSON.parse(at?.answers || 'null'); } catch { return null; } })(),
        stage2Submissions: (() => { try { return JSON.parse(sc?.stage2_submissions || 'null'); } catch { return null; } })(),
        stage3Responses: (() => { try { return JSON.parse(sc?.stage3_responses || 'null'); } catch { return null; } })(),
        cheatingFlag: !!(sc?.cheating_flag),
        cheatingReason: sc?.cheating_reason || null,
        failedStage: v.failedStage,
        verdict: v.verdict,
        verdictLabel: v.label,
        passed: v.passed,
        recording: rec ? {
          id: rec.id,
          durationSeconds: rec.duration_seconds,
          sizeBytes: rec.size_bytes,
          reason: rec.reason,
          createdAt: rec.created_at,
          url: `/api/admin/video/${rec.id}/`,
        } : null,
      };
    });

    const stats = {
      totalCandidates: rows.length,
      passedAll: rows.filter(r => r.verdict === 'PASSED_ALL').length,
      cheating: rows.filter(r => r.cheatingFlag).length,
      failedStage1: rows.filter(r => r.verdict === 'FAILED_STAGE1').length,
      failedStage2: rows.filter(r => r.verdict === 'FAILED_STAGE2').length,
      failedStage3: rows.filter(r => r.verdict === 'FAILED_STAGE3').length,
      inProgress: rows.filter(r => r.verdict === 'IN_PROGRESS').length,
      recordings: recordings.length,
    };

    const criteria = {
      stage1: {
        name: 'Stage 1 — AI Skills MCQ',
        pass: '80%',
        passMarks: '28 of 35 correct answers',
        totalItems: '35 questions (randomly drawn from a 200-question bank)',
        time: '40 minutes — auto-submits at 0:00',
        scoring: '1 mark per correct answer. Percentage = correct ÷ 35 × 100. Pass threshold 80%.',
        gate: 'Below 80% → REJECTED at Stage 1. Cannot proceed to Stage 2.',
      },
      stage2: {
        name: 'Stage 2 — Coding Challenge',
        pass: '70%',
        passMarks: '70 of 100',
        totalItems: '2 practical coding problems (Python)',
        time: '40 minutes — auto-submits at 0:00',
        scoring: 'A complete, non-trivial answer to both problems scores 75%. One problem only ≈ 30%. Empty ≈ 0%. Pass threshold 70%.',
        gate: 'Below 70% → REJECTED at Stage 2. Cannot proceed to Stage 3.',
      },
      stage3: {
        name: 'Stage 3 — AI Video Interview',
        pass: 'Completion (no score threshold)',
        passMarks: 'n/a — the interview must be completed and submitted',
        totalItems: '3 structured technical questions',
        time: '15-minute cap — auto-submits at 15:00. Submitting earlier is allowed and all answers are saved.',
        scoring: 'Camera + microphone are recorded automatically for recruiter / HR review. A composite Veer score (0–100) is generated from ATS match, Stage 1 %, and role fit — shown as "Total".',
        gate: 'No time minimum. Only candidates who cleared Stage 1 and Stage 2 reach this stage.',
      },
      antiCheating: 'DISABLED — switching tabs or windows no longer terminates or rejects any stage.',
      finalVerdict: 'PASSED ALL = cleared Stage 1 (>=80%) AND Stage 2 (>=70%) AND completed Stage 3.',
      compositeScore: 'Total (0–100) = skills 35% (Stage 1 %) + experience 20% (ATS) + seniority 15% + location 12% + keywords 10% (ATS) + education 8%.',
    };

    return NextResponse.json({ ok: true, admin: { email: admin.email }, stats, criteria, candidates: rows });
  } catch (err) {
    console.error('[ADMIN DASHBOARD ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
