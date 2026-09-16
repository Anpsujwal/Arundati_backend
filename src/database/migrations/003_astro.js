'use strict';

const { getDb } = require('../../config/database');

function up() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS astro_data (
      astro_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id   INTEGER NOT NULL UNIQUE REFERENCES profiles(profile_id) ON DELETE CASCADE,
      birth_time   TEXT,
      birth_place  TEXT,
      latitude     REAL,
      longitude    REAL,
      timezone     TEXT
    );
  `);
}

module.exports = { up };
