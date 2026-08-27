/**
 * GET /api/admin/candidate/[id]
 * Admin-only. Full per-candidate detail for the admin panel:
 * CV/ATS, every MCQ (question + their answer + correct answer), Stage 2 code,
 * Stage 3 interview answers, and the interview recording.
 */
import { NextResponse } from 'next/server.js';
import { requireAdmin } from '../../../../../lib/auth/index.js';
import { dbGet, dbAll } from '../../../../../lib/db/index.js';

const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

export async function GET(req, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Admin authentication required.' }, { status: 401 });

  const { id } = await params;
  const cand = await dbGet('SELECT * FROM candidates WHERE id = ?', [id]);
  if (!cand) return NextResponse.json({ ok: false, error: 'Candidate not found' }, { status: 404 });

  const app = await dbGet('SELECT * FROM applications WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1', [id]);
  const sc = await dbGet('SELECT * FROM scorecards WHERE candidate_id = ?', [id]);
  const attempt = await dbGet('SELECT * FROM quiz_attempts WHERE candidate_id = ? ORDER BY started_at DESC LIMIT 1', [id]);
  const rec = await dbGet('SELECT * FROM interview_recordings WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1', [id]);

  // Resolve the MCQ questions the candidate was served, with their answer + the correct one.
  let mcq = [];
  if (attempt) {
    const servedIds = parse(attempt.questions_served, []);
    const answers = parse(attempt.answers, {});
    if (servedIds.length) {
      const placeholders = servedIds.map(() => '?').join(',');
      const qs = await dbAll(
        `SELECT id, external_id, category, question, options, correct_answer_ids FROM quiz_questions WHERE id IN (${placeholders})`,
        servedIds
      );
      const byId = {}; qs.forEach(q => { byId[q.id] = q; });
      mcq = servedIds.map((qid, i) => {
        const q = byId[qid];
        if (!q) return null;
        const opts = parse(q.options, []);
        const correct = parse(q.correct_answer_ids, []);
        const given = answers[qid];
        const givenArr = Array.isArray(given) ? given : (given != null ? [given] : []);
        const isCorrect = givenArr.length > 0 && givenArr.slice().sort().join(',') === correct.slice().sort().join(',');
        return {
          n: i + 1,
          category: q.category,
          question: q.question,
          options: opts,
          givenIds: givenArr,
          correctIds: correct,
          isCorrect,
        };
      }).filter(Boolean);
    }
  }

  return NextResponse.json({
    ok: true,
    candidate: {
      id: cand.id, name: `${cand.first_name} ${cand.last_name}`.trim(), email: cand.email,
      location: cand.location, targetRole: cand.target_role, registeredAt: cand.created_at, consent: cand.consent,
    },
    cv: {
      atsScore: sc?.ats_score ?? app?.ats_score ?? null,
      atsPassed: (app?.ats_passed ?? 0) === 1,
      parsedText: app?.cv_parsed_text || null,
      filePath: app?.cv_file_path || null,
    },
    stage1: {
      percentage: sc?.quiz_percentage ?? attempt?.percentage ?? null,
      correct: attempt?.score ?? null,
      total: attempt?.total_questions ?? (mcq.length || null),
      passed: attempt ? attempt.passed === 1 : null,
      completedAt: attempt?.completed_at || null,
      questions: mcq,
    },
    stage2: {
      score: sc?.stage2_score ?? null,
      passed: sc?.stage2_passed === 1 ? true : sc?.stage2_passed === 0 ? false : null,
      submissions: parse(sc?.stage2_submissions, null),
    },
    stage3: {
      seconds: sc?.stage3_seconds ?? rec?.duration_seconds ?? null,
      passed: sc?.stage3_passed === 1,
      responses: parse(sc?.stage3_responses, null),
      recording: rec ? {
        id: rec.id, durationSeconds: rec.duration_seconds, sizeBytes: rec.size_bytes,
        reason: rec.reason, createdAt: rec.created_at,
        url: `/api/admin/video/${rec.id}/`, downloadUrl: `/api/admin/video/${rec.id}/?dl=1`,
      } : null,
    },
    verdict: sc?.verdict || null,
    totalScore: sc?.total_score ?? null,
    cheatingFlag: !!(sc?.cheating_flag),
    cheatingReason: sc?.cheating_reason || null,
  });
}
