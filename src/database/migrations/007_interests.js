'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;
  await runner.query(`
    CREATE TABLE IF NOT EXISTS interests (
      interest_id        SERIAL PRIMARY KEY,
      sender_profile_id  INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      receiver_profile_id INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      status             TEXT NOT NULL DEFAULT 'Pending'
                         CHECK(status IN ('Pending','Accepted','Declined')),
      created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sender_profile_id, receiver_profile_id)
    );
  `);
}

module.exports = { name: '007_interests', up };
