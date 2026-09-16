'use strict';

const { getDb } = require('../../config/database');

function up() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      doc_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      doc_type    TEXT    NOT NULL CHECK(doc_type IN ('gov_id','kundli_pdf')),
      filename    TEXT    NOT NULL,
      admin_notes TEXT,
      uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { up };
