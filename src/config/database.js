'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');

const dbPath = path.resolve(__dirname, '../../', env.DB_PATH);

const fs = require('fs');

let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    // Recommended SQLite settings for correctness and performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

module.exports = { getDb };
