/**
 * Node-only startup: seed the database (Supabase in prod, local SQLite in dev).
 * Idempotent. Never crashes boot.
 */
try {
  const { seedQuizQuestions, seedJobPostings, seedAdmin } = await import('./lib/db/seed.js');
  const count = await seedQuizQuestions();
  await seedJobPostings();
  await seedAdmin();
  console.log(`[STARTUP] Database ready. Quiz questions: ${count} (${process.env.DATABASE_URL ? 'Supabase' : 'local SQLite'})`);
} catch (err) {
  console.error('[STARTUP] Seeding failed (server will still start):', err.message);
}
