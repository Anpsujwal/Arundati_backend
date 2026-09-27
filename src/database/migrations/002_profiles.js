'use strict';

const { getDb } = require('../../config/database');

function up() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      profile_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
      first_name       TEXT    NOT NULL DEFAULT '',
      surname          TEXT    NOT NULL DEFAULT '',
      gender           TEXT    CHECK(gender IN ('Male','Female')),
      date_of_birth    DATE,
      marital_status   TEXT    CHECK(marital_status IN ('Never Married','Divorced','Widowed')),
      sub_sect         TEXT,
      gotra            TEXT    NOT NULL DEFAULT '',
      pravara          TEXT,
      maternal_gotra   TEXT,
      maternal_inti_peru TEXT,
      veda             TEXT,
      shakha           TEXT,
      sutra            TEXT,
      native_place     TEXT,
      city             TEXT,
      dietary_habit    TEXT    CHECK(dietary_habit IN ('Strict Vegetarian','Sattvic','Vegan')),
      education        TEXT,
      profession       TEXT,
      employer         TEXT,
      annual_income    TEXT,
      hide_income      INTEGER NOT NULL DEFAULT 0,
      height_cm        INTEGER,
      about_me         TEXT,
      registration_step INTEGER NOT NULL DEFAULT 0,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { up };
