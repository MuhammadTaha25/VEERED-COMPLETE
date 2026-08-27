/**
 * GET /api/jobs
 * List published job postings, filterable by country.
 * Matches architecture-spec.md §4 GET /v1/jobs shape.
 */
import { NextResponse } from 'next/server';
import { dbAll } from '@/lib/db/index.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country'); // 'uk' or 'ie'

    let jobs;
    if (country) {
      jobs = await dbAll(
        `SELECT id, title, description, company, location, country,
                employment_type, work_arrangement, salary, salary_period,
                currency, required_skills, keywords, min_experience,
                seniority, education, status, created_at
         FROM job_postings
         WHERE status = 'published' AND country = ?
         ORDER BY created_at DESC`,
        [country.toLowerCase()]
      );
    } else {
      jobs = await dbAll(
        `SELECT id, title, description, company, location, country,
                employment_type, work_arrangement, salary, salary_period,
                currency, required_skills, keywords, min_experience,
                seniority, education, status, created_at
         FROM job_postings
         WHERE status = 'published'
         ORDER BY created_at DESC`
      );
    }

    // Parse JSON fields
    const parsed = jobs.map((j) => ({
      ...j,
      required_skills: JSON.parse(j.required_skills || '[]'),
      keywords: JSON.parse(j.keywords || '[]'),
    }));

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[JOBS LIST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
