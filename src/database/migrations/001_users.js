'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;
  await runner.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id          SERIAL PRIMARY KEY,
      email            TEXT    UNIQUE NOT NULL,
      password_hash    TEXT    NOT NULL,
      role             TEXT    NOT NULL DEFAULT 'user'
                               CHECK(role IN ('user','admin')),
      account_status   TEXT    NOT NULL DEFAULT 'Pending_ID'
                               CHECK(account_status IN ('Pending_ID','Approved','Rejected','Suspended')),
      profile_managed_by TEXT  CHECK(profile_managed_by IN ('Self','Parent','Sibling','Joint')),
      created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { name: '001_users', up };
