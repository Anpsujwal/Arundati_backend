'use strict';

const { getDb } = require('../../config/database');

/**
 * Migration 009 — Kundali table
 *
 * Stores the machine-readable generated Kundali for each approved user.
 * This is the PRIMARY source for matchmaking — not the uploaded PDF.
 *
 * kundali_status values:
 *   NOT_GENERATED       — default; user not yet approved
 *   GENERATING          — generation in progress (background task)
 *   GENERATED           — successfully generated and stored
 *   FAILED              — generation failed; see failure_reason (internal only)
 *   INCOMPLETE_BIRTH_DATA — admin tried to approve but birth data was missing
 *
 * JSON columns (stored as TEXT):
 *   birth_data          — { date_of_birth, birth_time, birth_place, latitude, longitude, timezone }
 *   planetary_data      — array of PlanetPosition objects
 *   house_data          — array of HouseInfo objects
 *   calculation_config  — { ayanamsa, house_system, provider, provider_version }
 *
 * Note: lagna, rashi, nakshatra, nakshatra_pada are stored as normalised
 * columns for fast SQL queries during matchmaking.
 */
function up() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS kundalis (
      kundali_id          INTEGER  PRIMARY KEY AUTOINCREMENT,
      user_id             INTEGER  NOT NULL UNIQUE
                                   REFERENCES users(user_id) ON DELETE CASCADE,
      kundali_status      TEXT     NOT NULL DEFAULT 'NOT_GENERATED'
                                   CHECK(kundali_status IN (
                                     'NOT_GENERATED',
                                     'GENERATING',
                                     'GENERATED',
                                     'FAILED',
                                     'INCOMPLETE_BIRTH_DATA'
                                   )),
      lagna               TEXT,
      rashi               TEXT,
      nakshatra           TEXT,
      nakshatra_pada      INTEGER,
      birth_data          TEXT,
      planetary_data      TEXT,
      house_data          TEXT,
      provider            TEXT,
      provider_version    TEXT,
      calculation_config  TEXT,
      failure_reason      TEXT,    -- internal; never exposed to users or frontend
      generated_at        DATETIME,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Index for matchmaking eligibility checks
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_kundalis_status
      ON kundalis (kundali_status);
  `);
}

module.exports = { up };
