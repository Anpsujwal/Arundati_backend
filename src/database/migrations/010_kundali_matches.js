'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;

  await runner.query(`
    CREATE TABLE IF NOT EXISTS kundali_matches (
      match_id               SERIAL PRIMARY KEY,
      user_id                INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      candidate_id           INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      kundali_compatibility  TEXT,
      guna_milan             TEXT,
      guna_total             DOUBLE PRECISION,
      profile_score          DOUBLE PRECISION,
      overall_score          DOUBLE PRECISION,
      is_eligible            INTEGER NOT NULL DEFAULT 0,
      algorithm_version      TEXT    NOT NULL DEFAULT '1.0',
      provider_version       TEXT,
      calculated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, candidate_id)
    );

    CREATE INDEX IF NOT EXISTS idx_kundali_matches_user
      ON kundali_matches (user_id, is_eligible, overall_score DESC);
  `);
}

module.exports = { name: '010_kundali_matches', up };
