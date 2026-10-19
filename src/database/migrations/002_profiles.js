'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;
  await runner.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      profile_id       SERIAL PRIMARY KEY,
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
      created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { name: '002_profiles', up };
