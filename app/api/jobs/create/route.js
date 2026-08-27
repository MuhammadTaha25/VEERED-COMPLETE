/**
 * POST /api/jobs/create
 * Creates a new job posting record in the database.
 * Wired from vacancy.html.
 */
import { NextResponse } from 'next/server.js';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../../../../lib/auth/index.js';
import { dbGet, dbRun } from '../../../../lib/db/index.js';

export async function POST(req) {
  try {
    const session = await getSession();
    const body = await req.json();

    const {
      company, website, title, description, location,
      employmentType, workArrangement, salary, contact,
      email, phone, linkedin, country: reqCountry, recruiterId: bodyRecruiterId
    } = body;

    if (!company || !title || !description || !location) {
      return NextResponse.json({ ok: false, error: 'Company, title, description, and location are required' }, { status: 400 });
    }

    const recruiterId = bodyRecruiterId || session?.userId || 'recruiter-default-01';

    // Auto-detect country: if location mentions Dublin/Ireland or currency is EUR -> 'ie', else 'uk'
    let country = 'uk';
    const locLower = (location || '').toLowerCase();
    const curr = salary?.currency || 'GBP';
    if (locLower.includes('ireland') || locLower.includes('dublin') || locLower.includes('cork') || locLower.includes('galway') || curr === 'EUR' || reqCountry === 'ie') {
      country = 'ie';
    }

    const salaryAmount = typeof salary === 'object' ? salary.amount : parseFloat(salary) || 0;
    const salaryPeriod = typeof salary === 'object' ? salary.period : 'year';

    // Extract core keywords from description
    const defaultSkillList = ['Python', 'PyTorch', 'LangChain', 'RAG', 'LLM', 'GPT-4', 'Docker', 'FastAPI', 'SQL', 'React', 'Node.js'];
    const descLower = (description || '').toLowerCase();
    const requiredSkills = defaultSkillList.filter(s => descLower.includes(s.toLowerCase()));

    const jobId = uuidv4();

    await dbRun(`
      INSERT INTO job_postings (
        id, recruiter_id, title, description, company, website, location, country,
        employment_type, work_arrangement, salary, salary_period, currency,
        contact_name, contact_email, contact_phone, linkedin_url,
        required_skills, keywords, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', now())
    `, [
      jobId, recruiterId, title, description, company, website || '', location, country,
      employmentType || 'Full-time', workArrangement || 'On-site', salaryAmount, salaryPeriod, curr,
      contact || '', email || '', phone || '', linkedin || '',
      JSON.stringify(requiredSkills.length ? requiredSkills : ['Python', 'AI']),
      JSON.stringify(requiredSkills),
    ]);

    const createdJob = await dbGet('SELECT * FROM job_postings WHERE id = ?', [jobId]);

    console.log(`[JOB CREATED LOG] Job ID: ${jobId} | Title: "${title}" | Company: ${company} | Country: ${country}`);

    return NextResponse.json({
      ok: true,
      jobId,
      job: {
        ...createdJob,
        required_skills: JSON.parse(createdJob.required_skills || '[]'),
        keywords: JSON.parse(createdJob.keywords || '[]'),
      },
      message: 'Job posting published successfully.',
    });

  } catch (err) {
    console.error('[CREATE JOB ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
