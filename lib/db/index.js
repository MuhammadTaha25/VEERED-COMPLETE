/**
 * Veer — database layer.
 *
 * Production: Supabase Postgres (set DATABASE_URL).
 * Local dev without DATABASE_URL: a self-contained SQLite file (sql.js / WASM)
 *   at lib/db/data/veer.db — so `npm run dev` works with no external services.
 *
 * The public helpers (getDb / dbGet / dbAll / dbRun / dbInsertMany) keep the
 * same shape. Route handlers pass SQL with `?` placeholders and Postgres-style
 * `now()` / `::int`; the SQLite path rewrites those to SQLite syntax.
 */

const USE_PG = !!process.env.DATABASE_URL;

/* ───────────────────────────── Postgres ───────────────────────────── */
let _pg = null;
async function pgClient() {
  if (_pg) return _pg;
  const { default: postgres } = await import('postgres');
  _pg = postgres(process.env.DATABASE_URL, {
    ssl: 'require', prepare: false,
    max: Number(process.env.DB_POOL_MAX || 8), idle_timeout: 20, connect_timeout: 30,
  });
  return _pg;
}
const toPg = (q) => { let i = 0; return q.replace(/\?/g, () => `$${++i}`); };

/* ───────────────────────────── SQLite ───────────────────────────── */
let _sqlite = null;
let _sqliteInit = null;
async function sqliteDb() {
  if (_sqlite) return _sqlite;
  if (_sqliteInit) return _sqliteInit;
  _sqliteInit = (async () => {
    const [{ default: initSqlJs }, fs, path, { fileURLToPath }] = await Promise.all([
      import('sql.js'), import('node:fs'), import('node:path'), import('node:url'),
    ]);
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const DB_PATH = process.env.DB_PATH || path.join(dir, 'data', 'veer.db');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const SQL = await initSqlJs();
    _sqlite = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
    _sqlite.__path = DB_PATH;
    _sqlite.__fs = fs;
    _sqlite.run(SCHEMA_SQLITE);
    persist();
    console.log(`[DB] Local SQLite ready: ${DB_PATH}`);
    return _sqlite;
  })();
  return _sqliteInit;
}
function persist() {
  if (_sqlite && _sqlite.__fs) _sqlite.__fs.writeFileSync(_sqlite.__path, Buffer.from(_sqlite.export()));
}
// translate the handful of Postgres-isms our queries use into SQLite
function toSqlite(q) {
  return q
    .replace(/COUNT\(\*\)::int/gi, 'COUNT(*)')
    .replace(/count\(\*\)::int/g, 'count(*)')
    .replace(/::int\b/g, '')
    .replace(/\bnow\(\)/gi, "datetime('now')")
    .replace(/\bEXCLUDED\./gi, 'excluded.')
    .replace(/\bdouble precision\b/gi, 'REAL')
    .replace(/\btimestamptz\b/gi, 'TEXT');
}
function sqliteAll(db, q, params) {
  const stmt = db.prepare(toSqlite(q));
  stmt.bind(params);
  const cols = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) {
    const vals = stmt.get();
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i]; });
    rows.push(row);
  }
  stmt.free();
  return rows;
}

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, location TEXT DEFAULT '', target_role TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'candidate', consent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS recruiters (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, company_name TEXT NOT NULL, plan TEXT, billing_country TEXT DEFAULT 'GB', billing_currency TEXT DEFAULT 'GBP', payment_status TEXT DEFAULT 'unpaid', payment_amount REAL, role TEXT NOT NULL DEFAULT 'recruiter', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS job_postings (id TEXT PRIMARY KEY, recruiter_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', company TEXT NOT NULL, website TEXT DEFAULT '', location TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT 'uk', employment_type TEXT DEFAULT 'Full-time', work_arrangement TEXT DEFAULT 'On-site', salary REAL, salary_period TEXT DEFAULT 'year', currency TEXT DEFAULT 'GBP', contact_name TEXT DEFAULT '', contact_email TEXT DEFAULT '', contact_phone TEXT DEFAULT '', linkedin_url TEXT DEFAULT '', required_skills TEXT DEFAULT '[]', keywords TEXT DEFAULT '[]', min_experience INTEGER DEFAULT 0, seniority TEXT DEFAULT '', education TEXT DEFAULT '', status TEXT DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, job_posting_id TEXT, cv_file_path TEXT, cv_parsed_text TEXT DEFAULT '', ats_score REAL, ats_passed INTEGER DEFAULT 0, status TEXT DEFAULT 'submitted', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS scorecards (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, job_posting_id TEXT, ats_score REAL, quiz_score REAL, quiz_percentage REAL, stage2_status TEXT, stage3_status TEXT, total_score REAL, factors TEXT DEFAULT '[]', bias_flags TEXT DEFAULT '[]', model_version TEXT DEFAULT 'veer-score-1.0', job_version TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), stage2_score REAL, stage2_passed INTEGER, stage3_seconds INTEGER, stage3_passed INTEGER, video_recording_id TEXT, failed_stage TEXT, cheating_flag INTEGER DEFAULT 0, cheating_reason TEXT, verdict TEXT, stage2_submissions TEXT, stage3_responses TEXT);
CREATE TABLE IF NOT EXISTS quiz_questions (id TEXT PRIMARY KEY, external_id TEXT UNIQUE NOT NULL, section TEXT DEFAULT '', category TEXT NOT NULL, type TEXT NOT NULL, difficulty TEXT DEFAULT 'Medium', question TEXT NOT NULL, options TEXT DEFAULT '[]', correct_answer_ids TEXT DEFAULT '[]', scoring TEXT DEFAULT '1 / 0', rationale TEXT DEFAULT '', image TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS quiz_attempts (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, questions_served TEXT NOT NULL DEFAULT '[]', answers TEXT NOT NULL DEFAULT '{}', score REAL DEFAULT 0, total_questions INTEGER DEFAULT 35, percentage REAL DEFAULT 0, passed INTEGER DEFAULT 0, started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, pass_threshold INTEGER DEFAULT 80);
CREATE TABLE IF NOT EXISTS interview_recordings (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'stage3', file_path TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'video/webm', size_bytes INTEGER NOT NULL DEFAULT 0, duration_seconds INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT 'completed', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);
`;

/* ───────────────────────────── public API ───────────────────────────── */
export async function getDb() {
  return USE_PG ? pgClient() : sqliteDb();
}

export async function dbRun(sql, params = []) {
  if (USE_PG) { await (await pgClient()).unsafe(toPg(sql), params); return; }
  const db = await sqliteDb();
  db.run(toSqlite(sql), params);
  persist();
}

export async function dbGet(sql, params = []) {
  if (USE_PG) { const rows = await (await pgClient()).unsafe(toPg(sql), params); return rows[0] || null; }
  const db = await sqliteDb();
  return sqliteAll(db, sql, params)[0] || null;
}

export async function dbAll(sql, params = []) {
  if (USE_PG) { const rows = await (await pgClient()).unsafe(toPg(sql), params); return Array.from(rows); }
  const db = await sqliteDb();
  return sqliteAll(db, sql, params);
}

export async function dbInsertMany(table, columns, rows) {
  if (!rows.length) return;
  if (USE_PG) {
    const sql = await pgClient();
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const objs = rows.slice(i, i + CHUNK).map((vals) => {
        const o = {}; columns.forEach((c, idx) => { o[c] = vals[idx]; }); return o;
      });
      await sql`insert into ${sql(table)} ${sql(objs, ...columns)}`;
    }
    return;
  }
  const db = await sqliteDb();
  const ph = `(${columns.map(() => '?').join(',')})`;
  const stmt = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${ph}`;
  for (const vals of rows) db.run(stmt, vals);
  persist();
}

export function saveToDisk() { if (!USE_PG) persist(); }

export async function closeDb() {
  if (_pg) { await _pg.end({ timeout: 5 }); _pg = null; }
  if (_sqlite) { persist(); _sqlite.close(); _sqlite = null; _sqliteInit = null; }
}

export default getDb;
