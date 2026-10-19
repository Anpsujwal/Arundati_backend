'use strict';

const app = require('../src/app');
const { runMigrations } = require('../src/database/migrations');
const { seedAdmin } = require('../src/database/seeds/admin.seed');

let initPromise = null;

async function ensureDbInit() {
  if (!process.env.DATABASE_URL) {
    console.error(
      '[vercel serverless] DATABASE_URL is not set. Please configure DATABASE_URL in Vercel environment variables.'
    );
    return;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        await runMigrations();
        await seedAdmin();
        console.log('[vercel serverless] Database initialized successfully.');
      } catch (err) {
        console.error('[vercel serverless] Database initialization error:', err.message);
      }
    })();
  }

  await initPromise;
}

module.exports = async (req, res) => {
  await ensureDbInit();
  return app(req, res);
};
