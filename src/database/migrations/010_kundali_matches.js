'use strict';

const { getDb } = require('../../config/database');

/**
 * Migration 010 — Kundali match cache table
 *
 * Caches the computed compatibility between two users so the matchmaking
 * pipeline does not recalculate from scratch on every dashboard request.
 *
 * Cache is invalidated (row deleted or updated_at bumped with new data) when:
 *   - Either user's Kundali changes (new generation or retry)
 *   - algorithm_version changes (code update)
 *   - provider_version changes (PyJHora update)
 *   - Relevant partner preferences change
 *
 * JSON columns:
 *   kundali_compatibility  — CompatibilityResult object
 *   guna_milan             — GunaMilanResult object (all 8 kootas + total)
 *
 * overall_score: composite float used for ranking in match feed.
 * is_eligible: 1 if the pair passes all hard filters (gotra + Kundali status + Guna >= 18).
 */
function up() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS kundali_matches (
      match_id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      candidate_id           INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      kundali_compatibility  TEXT,
      guna_milan             TEXT,
      guna_total             REAL,
      profile_score          REAL,
      overall_score          REAL,
      is_eligible            INTEGER NOT NULL DEFAULT 0,
      algorithm_version      TEXT    NOT NULL DEFAULT '1.0',
      provider_version       TEXT,
      calculated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, candidate_id)
    );
  `);

  // Index for fast match feed lookup
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_kundali_matches_user
      ON kundali_matches (user_id, is_eligible, overall_score DESC);
  `);
}

module.exports = { up };
