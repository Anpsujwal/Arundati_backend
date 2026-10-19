'use strict';

const db = require('../../config/database');

async function up(client) {
  const runner = client || db;
  await runner.query(`
    CREATE TABLE IF NOT EXISTS documents (
      doc_id      SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      doc_type    TEXT    NOT NULL CHECK(doc_type IN ('gov_id','kundli_pdf')),
      filename    TEXT    NOT NULL,
      admin_notes TEXT,
      uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { name: '006_documents', up };
