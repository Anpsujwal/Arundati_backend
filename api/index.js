'use strict';

const app = require('../src/app');
const { migrations } = require('../src/database/migrations');
const { seedAdmin } = require('../src/database/seeds/admin.seed');

let isInitialized = false;

async function ensureDbInit() {
  if (isInitialized) return;
  try {
    for (const m of migrations) m.up();
    await seedAdmin();
    isInitialized = true;
  } catch (err) {
    console.error('[vercel serverless] Database initialization error:', err);
  }
}

module.exports = async (req, res) => {
  await ensureDbInit();
  return app(req, res);
};
