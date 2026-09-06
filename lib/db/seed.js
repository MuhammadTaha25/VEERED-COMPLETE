/**
 * Veer — seeders (Supabase Postgres).
 * All idempotent: each checks for existing rows before inserting.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { dbGet, dbRun, dbInsertMany } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dir = path.dirname(__filename);
const QUESTION_BANK_PATH = path.join(__dir, '..', '..', '_archive', 'veer_assessment_question_bank.json');

/** Seed a single admin account (recruiters table, role='admin'). */
export async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@veer.ie').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || 'veer-admin-2026';
  const hash = bcrypt.hashSync(password, 12);

  const existing = await dbGet('SELECT id FROM recruiters WHERE email = ?', [email]);
  if (existing) {
    await dbRun(`UPDATE recruiters SET password_hash = ?, role = 'admin' WHERE email = ?`, [hash, email]);
  } else {
    await dbRun(
      `INSERT INTO recruiters (id, email, password_hash, company_name, plan, payment_status, role, created_at)
       VALUES (?, ?, ?, 'Veer Admin', 'enterprise', 'paid', 'admin', now())`,
      [uuidv4(), email, hash]
    );
  }
  console.log(`[SEED] Admin account ready: ${email}`);
}

export async function seedJobPostings() {
  const row = await dbGet('SELECT COUNT(*)::int AS count FROM job_postings', []);
  if (row && row.count > 0) return row.count;

  const sampleJobs = [
    { id: 'uk-ai-eng-01', recruiter_id: 'rec-01', title: 'Senior AI Engineer', company: 'Northbridge Analytics', location: 'London, UK', country: 'uk', employment_type: 'Full-time', work_arrangement: 'Hybrid', salary: 85000, salary_period: 'year', currency: 'GBP', required_skills: ['RAG','LangChain','Python','Vector databases'], description: 'Own the retrieval layer for our candidate-matching engine — design, ship and monitor production RAG pipelines end to end.' },
    { id: 'uk-mle-01', recruiter_id: 'rec-01', title: 'Machine Learning Engineer', company: 'Fenwick Software', location: 'Manchester, UK', country: 'uk', employment_type: 'Full-time', work_arrangement: 'Remote', salary: 70000, salary_period: 'year', currency: 'GBP', required_skills: ['PyTorch','MLOps','AWS'], description: 'Build and maintain the training and evaluation pipelines behind our explainable scoring model.' },
    { id: 'ie-ai-eng-01', recruiter_id: 'rec-02', title: 'Senior AI Engineer', company: 'Northbridge Analytics', location: 'Dublin, Ireland', country: 'ie', employment_type: 'Full-time', work_arrangement: 'Hybrid', salary: 90000, salary_period: 'year', currency: 'EUR', required_skills: ['RAG','LangChain','Python','Vector databases'], description: 'Own the retrieval layer for our candidate-matching engine — design, ship and monitor production RAG pipelines end to end.' },
    { id: 'ie-mle-01', recruiter_id: 'rec-02', title: 'Machine Learning Engineer', company: 'Fenwick Software', location: 'Cork, Ireland', country: 'ie', employment_type: 'Full-time', work_arrangement: 'Remote', salary: 75000, salary_period: 'year', currency: 'EUR', required_skills: ['PyTorch','MLOps','AWS'], description: 'Build and maintain the training and evaluation pipelines behind our explainable scoring model.' },
  ];

  for (const j of sampleJobs) {
    await dbRun(`
      INSERT INTO job_postings (id, recruiter_id, title, company, location, country, employment_type, work_arrangement, salary, salary_period, currency, required_skills, keywords, description, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', now())
    `, [
      j.id, j.recruiter_id, j.title, j.company, j.location, j.country, j.employment_type, j.work_arrangement, j.salary, j.salary_period, j.currency,
      JSON.stringify(j.required_skills), JSON.stringify(j.required_skills), j.description,
    ]);
  }
  console.log(`[SEED] Seeded ${sampleJobs.length} sample job postings.`);
  return sampleJobs.length;
}

// Bump this whenever _archive/veer_assessment_question_bank.json changes so the
// live database re-seeds itself on the next deploy.
const QUIZ_BANK_VERSION = '2026-09-06-easy-v2';

export async function seedQuizQuestions() {
  let bankData;
  try {
    bankData = JSON.parse(fs.readFileSync(QUESTION_BANK_PATH, 'utf-8'));
  } catch (err) {
    console.error(`[SEED] Failed to read question bank at ${QUESTION_BANK_PATH}: ${err.message}`);
    return 0;
  }
  const questions = bankData.question_bank || [];
  if (!questions.length) {
    console.warn('[SEED] No questions found in question bank JSON.');
    return 0;
  }

  // Version gate: skip only if the DB already holds THIS bank version.
  await dbRun(`CREATE TABLE IF NOT EXISTS app_meta (key text PRIMARY KEY, value text)`);
  const meta = await dbGet('SELECT value FROM app_meta WHERE key = ?', ['quiz_bank_version']);
  const countRow = await dbGet('SELECT COUNT(*)::int AS count FROM quiz_questions', []);
  if (meta && meta.value === QUIZ_BANK_VERSION && countRow && countRow.count > 0) {
    console.log(`[SEED] Quiz bank ${QUIZ_BANK_VERSION} already loaded (${countRow.count} rows). Skipping.`);
    return countRow.count;
  }

  console.log(`[SEED] Loading quiz bank ${QUIZ_BANK_VERSION} (was: ${meta?.value || 'none'}). Replacing quiz_questions…`);
  await dbRun('DELETE FROM quiz_questions');

  const columns = ['id', 'external_id', 'section', 'category', 'type', 'difficulty', 'question', 'options', 'correct_answer_ids', 'scoring', 'rationale', 'image'];
  const rows = questions.map((q) => [
    uuidv4(),
    q.id || uuidv4(),
    q.section || '',
    q.category || 'AI',
    q.type || 'single',
    q.difficulty || 'Medium',
    q.question || '',
    JSON.stringify(q.options || []),
    JSON.stringify(q.correct_answer_ids || q.correct_answers || []),
    q.scoring || '1 / 0',
    q.rationale || '',
    q.image || null,
  ]);

  await dbInsertMany('quiz_questions', columns, rows);
  await dbRun(
    `INSERT INTO app_meta (key, value) VALUES ('quiz_bank_version', ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [QUIZ_BANK_VERSION]
  );
  console.log(`[SEED] Seeded ${rows.length} quiz questions (bank ${QUIZ_BANK_VERSION}).`);
  return rows.length;
}

// Standalone execution: `npm run seed`
const isMain = process.argv[1] && fileURLToPath(import.meta.url).replace(/\\/g, '/').includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  try {
    const envContent = fs.readFileSync(path.join(__dir, '..', '..', '.env.local'), 'utf-8');
    for (const line of envContent.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const [k, ...rest] = t.split('=');
        process.env[k.trim()] = rest.join('=').trim();
      }
    }
  } catch { /* no .env.local */ }

  Promise.resolve()
    .then(() => seedQuizQuestions())
    .then(() => seedJobPostings())
    .then(() => seedAdmin())
    .then(() => { console.log('[SEED] Done.'); process.exit(0); })
    .catch((e) => { console.error('[SEED] Failed:', e); process.exit(1); });
}
