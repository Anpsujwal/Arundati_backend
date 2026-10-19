'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;
  await runner.query(`
    CREATE TABLE IF NOT EXISTS astro_data (
      astro_id     SERIAL PRIMARY KEY,
      profile_id   INTEGER NOT NULL UNIQUE REFERENCES profiles(profile_id) ON DELETE CASCADE,
      birth_time   TEXT,
      birth_place  TEXT,
      latitude     DOUBLE PRECISION,
      longitude    DOUBLE PRECISION,
      timezone     TEXT
    );
  `);
}

module.exports = { name: '003_astro', up };
