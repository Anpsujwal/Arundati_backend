'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;

  await runner.query(`
    CREATE TABLE IF NOT EXISTS profile_grades (
      grade_id    SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      profile_id  INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      grade       TEXT    NOT NULL
                  CHECK(grade IN ('Prioritize', 'MaybeLater', 'NotInterested', 'AlreadyDealt')),
      created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, profile_id)
    );

    CREATE INDEX IF NOT EXISTS idx_profile_grades_user
      ON profile_grades(user_id);
  `);
}

module.exports = { name: '011_profile_grades', up };
