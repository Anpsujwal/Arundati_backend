'use strict';

const { getDb } = require('../../config/database');

function up() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email            TEXT    UNIQUE NOT NULL,
      password_hash    TEXT    NOT NULL,
      role             TEXT    NOT NULL DEFAULT 'user'
                               CHECK(role IN ('user','admin')),
      account_status   TEXT    NOT NULL DEFAULT 'Pending_ID'
                               CHECK(account_status IN ('Pending_ID','Approved','Rejected','Suspended')),
      profile_managed_by TEXT  CHECK(profile_managed_by IN ('Self','Parent','Sibling','Joint')),
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { up };
