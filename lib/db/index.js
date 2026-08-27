/**
 * Veer — database layer (Supabase Postgres).
 *
 * Migrated from local sql.js/SQLite. The public helpers (getDb / dbGet / dbAll
 * / dbRun) keep the same shape so route handlers barely change: they still pass
 * SQL with `?` placeholders — this module rewrites them to `$1, $2, …` for pg.
 *
 * Requires env: DATABASE_URL  (Supabase → Settings → Database → Connection string).
 */
import postgres from 'postgres';

let _sql = null;

function client() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — point it at your Supabase Postgres connection string.');
  }
  _sql = postgres(url, {
    // Supabase requires TLS; the poolers run in transaction mode so disable prepared statements.
    ssl: 'require',
    prepare: false,
    max: Number(process.env.DB_POOL_MAX || 8),
    idle_timeout: 20,
    connect_timeout: 30,
  });
  return _sql;
}

/** Rewrite `?` placeholders → `$1, $2, …` (our queries never contain a literal `?`). */
function toPg(query) {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

/**
 * Returns the underlying `postgres` tagged-template client.
 * Kept for compatibility / advanced callers.
 */
export async function getDb() {
  return client();
}

/** Run an INSERT/UPDATE/DELETE (or any statement); result ignored. */
export async function dbRun(sql, params = []) {
  await client().unsafe(toPg(sql), params);
}

/** Get a single row (or null). */
export async function dbGet(sql, params = []) {
  const rows = await client().unsafe(toPg(sql), params);
  return rows[0] || null;
}

/** Get all rows as plain objects. */
export async function dbAll(sql, params = []) {
  const rows = await client().unsafe(toPg(sql), params);
  return Array.from(rows);
}

/**
 * Bulk INSERT helper for seeding. `columns` is an array of column names,
 * `rows` is an array of value-arrays in the same order.
 */
export async function dbInsertMany(table, columns, rows) {
  if (!rows.length) return;
  const sql = client();
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const objs = slice.map((vals) => {
      const o = {};
      columns.forEach((c, idx) => { o[c] = vals[idx]; });
      return o;
    });
    await sql`insert into ${sql(table)} ${sql(objs, ...columns)}`;
  }
}

/** No-op: the schema lives in Supabase migrations now. Kept so callers don't break. */
export function saveToDisk() {}

export async function closeDb() {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}

export default getDb;
