/**
 * Node-only startup: seed the Supabase database (idempotent). Never crashes boot.
 */
if (!process.env.DATABASE_URL) {
  console.warn('[STARTUP] DATABASE_URL not set — skipping DB seed. Set it before serving traffic.');
} else {
  try {
    const { seedQuizQuestions, seedJobPostings, seedAdmin } = await import('./lib/db/seed.js');
    const count = await seedQuizQuestions();
    await seedJobPostings();
    await seedAdmin();
    console.log(`[STARTUP] Database ready. Quiz questions: ${count}`);
  } catch (err) {
    console.error('[STARTUP] Seeding failed (server will still start):', err.message);
  }
}
