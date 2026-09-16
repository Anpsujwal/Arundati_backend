'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../../config/database');

async function seedAdmin() {
  const db = getDb();
  const email = 'admin@arundhati.local';
  const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email);
  if (existing) {
    console.log('[seed] Admin already exists, skipping.');
    return;
  }
  const hash = await bcrypt.hash('Admin@1234', 12);
  db.prepare(`
    INSERT INTO users (email, password_hash, role, account_status)
    VALUES (?, ?, 'admin', 'Approved')
  `).run(email, hash);
  console.log('[seed] Admin created: admin@arundhati.local / Admin@1234');
}

module.exports = { seedAdmin };
