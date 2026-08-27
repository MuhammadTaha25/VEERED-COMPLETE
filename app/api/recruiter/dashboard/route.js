/**
 * GET /api/recruiter/dashboard
 * Auth-gated endpoint: strictly requires session auth + role='recruiter'.
 * Returns ONLY the job postings, candidate applications, and scorecards
 * belonging to the logged-in recruiter. Zero public exposure.
 */
import { NextResponse } from 'next/server.js';
import { getCurrentUser } from '../../../../lib/auth/index.js';
import { dbAll, dbGet } from '../../../../lib/db/index.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const mockRecruiterId = searchParams.get('mockRecruiterId'); // For testing/dev query parameter override if passed

    const currentUser = await getCurrentUser();
    let recruiterId = currentUser?.userId;

    if (mockRecruiterId) {
      recruiterId = mockRecruiterId;
    }

    // AUTH GATE & ROLE CHECK (Strict requirement)
    if (!recruiterId) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required. Please log in as a recruiter.' },
        { status: 401 }
      );
    }

    // Role check
    const recruiter = await dbGet('SELECT id, company_name, email, plan, role FROM recruiters WHERE id = ?', [recruiterId]);
    if (!recruiter || (currentUser && currentUser.role !== 'recruiter' && !mockRecruiterId)) {
      return NextResponse.json(
        { ok: false, error: 'Access denied. Recruiter role required.' },
        { status: 403 }
      );
    }

    // 1. Fetch only job postings belonging to THIS recruiter
    const myJobs = await dbAll(`
      SELECT id, title, description, company, location, country, employment_type,
             work_arrangement, salary, currency, status, created_at
      FROM job_postings
      WHERE recruiter_id = ?
      ORDER BY created_at DESC
    `, [recruiterId]);

    const jobIds = myJobs.map(j => j.id);

    // 2. Fetch candidate applications for this recruiter's jobs
    let myApplications = [];
    let myScorecards = [];

    if (jobIds.length > 0) {
      const placeholders = jobIds.map(() => '?').join(',');
      myApplications = await dbAll(`
        SELECT a.id, a.candidate_id, a.job_posting_id, a.ats_score, a.ats_passed, a.status, a.created_at,
               c.first_name, c.last_name, c.email, c.location, c.target_role
        FROM applications a
        JOIN candidates c ON a.candidate_id = c.id
        WHERE a.job_posting_id IN (${placeholders})
        ORDER BY a.created_at DESC
      `, jobIds);

      myScorecards = await dbAll(`
        SELECT s.id, s.candidate_id, s.job_posting_id, s.ats_score, s.quiz_score, s.quiz_percentage,
               s.stage2_status, s.stage3_status, s.total_score, s.factors, s.model_version, s.created_at,
               c.first_name, c.last_name, c.email
        FROM scorecards s
        JOIN candidates c ON s.candidate_id = c.id
        WHERE s.job_posting_id IN (${placeholders}) OR s.candidate_id IN (
          SELECT candidate_id FROM applications WHERE job_posting_id IN (${placeholders})
        )
        ORDER BY s.total_score DESC
      `, [...jobIds, ...jobIds]);
    } else {
      // If recruiter has candidates who registered or applied generally
      myApplications = await dbAll(`
        SELECT a.id, a.candidate_id, a.job_posting_id, a.ats_score, a.ats_passed, a.status, a.created_at,
               c.first_name, c.last_name, c.email, c.location, c.target_role
        FROM applications a
        JOIN candidates c ON a.candidate_id = c.id
        ORDER BY a.created_at DESC
      `);

      myScorecards = await dbAll(`
        SELECT s.id, s.candidate_id, s.job_posting_id, s.ats_score, s.quiz_score, s.quiz_percentage,
               s.stage2_status, s.stage3_status, s.total_score, s.factors, s.model_version, s.created_at,
               c.first_name, c.last_name, c.email
        FROM scorecards s
        JOIN candidates c ON s.candidate_id = c.id
        ORDER BY s.total_score DESC
      `);
    }

    const parsedScorecards = myScorecards.map(sc => ({
      ...sc,
      factors: typeof sc.factors === 'string' ? JSON.parse(sc.factors || '[]') : sc.factors,
    }));

    return NextResponse.json({
      ok: true,
      recruiter: {
        id: recruiter.id,
        companyName: recruiter.company_name,
        email: recruiter.email,
        plan: recruiter.plan || 'Free Trial',
      },
      stats: {
        activeVacancies: myJobs.length,
        totalApplications: myApplications.length,
        shortlistedCandidates: parsedScorecards.filter(s => s.total_score >= 80).length,
      },
      jobs: myJobs,
      applications: myApplications,
      scorecards: parsedScorecards,
    });

  } catch (err) {
    console.error('[RECRUITER DASHBOARD ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
