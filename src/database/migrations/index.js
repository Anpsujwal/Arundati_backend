'use strict';

const db = require('../../config/database');

const migrations = [
  require('./001_users'),
  require('./002_profiles'),
  require('./003_astro'),
  require('./004_family'),
  require('./005_photos'),
  require('./006_documents'),
  require('./007_interests'),
  require('./008_schema_v2'),
  require('./009_kundali'),
  require('./010_kundali_matches'),
  require('./011_profile_grades'),
];

/**
 * Run pending PostgreSQL migrations safely with idempotency and tracking.
 */
async function runMigrations() {
  const client = await db.getClient();
  try {
    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch already executed migrations
    const res = await client.query('SELECT name FROM _migrations');
    const appliedSet = new Set(res.rows.map((r) => r.name));

    let appliedCount = 0;

    for (const m of migrations) {
      const name = m.name;
      if (appliedSet.has(name)) {
        continue;
      }

      console.log(`[migrations] Applying ${name}...`);
      await client.query('BEGIN');
      try {
        await m.up(client);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        appliedCount++;
        console.log(`[migrations] ✓ ${name} applied.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrations] ✗ Failed to apply ${name}:`, err.message);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('[migrations] Database is up to date. No pending migrations.');
    } else {
      console.log(`[migrations] Successfully applied ${appliedCount} migration(s).`);
    }
  } finally {
    client.release();
  }
}

module.exports = { migrations, runMigrations };
