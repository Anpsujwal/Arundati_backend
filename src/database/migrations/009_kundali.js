'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;

  await runner.query(`
    CREATE TABLE IF NOT EXISTS kundalis (
      kundali_id          SERIAL PRIMARY KEY,
      user_id             INTEGER NOT NULL UNIQUE
                                  REFERENCES users(user_id) ON DELETE CASCADE,
      kundali_status      TEXT    NOT NULL DEFAULT 'NOT_GENERATED'
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
      failure_reason      TEXT,
      generated_at        TIMESTAMP WITH TIME ZONE,
      created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_kundalis_status
      ON kundalis (kundali_status);
  `);
}

module.exports = { name: '009_kundali', up };
