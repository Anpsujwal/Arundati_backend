'use strict';

const bcrypt = require('bcryptjs');
const db = require('../../config/database');

async function seedAdmin() {
  const email = 'admin@arundhati.local';
  const existing = await db.queryOne('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existing) {
    console.log('[seed] Admin already exists, skipping.');
    return;
  }
  const hash = await bcrypt.hash('Admin@1234', 12);
  await db.query(`
    INSERT INTO users (email, password_hash, role, account_status)
    VALUES ($1, $2, 'admin', 'Approved')
  `, [email, hash]);
  console.log('[seed] Admin created: admin@arundhati.local / Admin@1234');
}

module.exports = { seedAdmin };
