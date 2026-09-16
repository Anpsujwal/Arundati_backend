'use strict';

const { getDb } = require('../../config/database');

function up() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_photos (
      photo_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id  INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      filename    TEXT    NOT NULL,
      is_primary  INTEGER NOT NULL DEFAULT 0,
      is_approved INTEGER NOT NULL DEFAULT 1,
      uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { up };
