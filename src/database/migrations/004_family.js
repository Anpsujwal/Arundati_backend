'use strict';

const { getDb } = require('../../config/database');

function up() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS family_info (
      family_id               INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id              INTEGER NOT NULL UNIQUE REFERENCES profiles(profile_id) ON DELETE CASCADE,
      father_name             TEXT,
      father_occupation       TEXT,
      mother_name             TEXT,
      mother_maiden_inti_peru TEXT,
      sibling_count           INTEGER DEFAULT 0,
      paternal_uncle_name     TEXT,
      paternal_uncle_phone    TEXT,
      maternal_uncle_name     TEXT,
      maternal_uncle_phone    TEXT,
      purohit_reference_phone TEXT
    );
  `);
}

module.exports = { up };
