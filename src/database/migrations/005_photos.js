'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;
  await runner.query(`
    CREATE TABLE IF NOT EXISTS profile_photos (
      photo_id    SERIAL PRIMARY KEY,
      profile_id  INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      filename    TEXT    NOT NULL,
      is_primary  INTEGER NOT NULL DEFAULT 0,
      is_approved INTEGER NOT NULL DEFAULT 1,
      uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { name: '005_photos', up };
