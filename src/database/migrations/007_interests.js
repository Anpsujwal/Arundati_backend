'use strict';

const { getDb } = require('../../config/database');

function up() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS interests (
      interest_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_profile_id  INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      receiver_profile_id INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      status             TEXT NOT NULL DEFAULT 'Pending'
                         CHECK(status IN ('Pending','Accepted','Declined')),
      created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sender_profile_id, receiver_profile_id)
    );
  `);
}

module.exports = { up };
