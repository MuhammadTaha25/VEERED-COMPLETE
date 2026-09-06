import postgres from 'postgres';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const URL = process.env.DATABASE_URL
  || 'postgresql://postgres.nwdquveqyluepoqbuosg:x%3FLRT2erBxjz-B8@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';
const sql = postgres(URL, { ssl: 'require', prepare: false });

const bank = JSON.parse(fs.readFileSync('_archive/veer_assessment_question_bank.json', 'utf8')).question_bank;

await sql`DELETE FROM quiz_questions`;
console.log('cleared quiz_questions');

const rows = bank.map(q => ({
  id: randomUUID(),
  external_id: q.id,
  section: q.section || '',
  category: q.category,
  type: q.type,
  difficulty: q.difficulty || 'Easy',
  question: q.question,
  options: JSON.stringify(q.options || []),
  correct_answer_ids: JSON.stringify(q.correct_answer_ids || []),
  scoring: q.scoring || '1 / 0',
  rationale: q.rationale || '',
  image: q.image || null,
}));

const cols = ['id','external_id','section','category','type','difficulty','question','options','correct_answer_ids','scoring','rationale','image'];
for (let i = 0; i < rows.length; i += 100) {
  await sql`insert into quiz_questions ${sql(rows.slice(i, i + 100), ...cols)}`;
}

const [{ c }] = await sql`SELECT count(*)::int c FROM quiz_questions`;
const cats = await sql`SELECT category, count(*)::int n FROM quiz_questions GROUP BY category ORDER BY category`;
console.log('inserted; quiz_questions now =', c);
cats.forEach(r => console.log('  ', r.category, r.n));
await sql.end();
