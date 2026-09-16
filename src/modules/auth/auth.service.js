'use strict';

const { getDb } = require('../../config/database');
const { hashPassword, comparePassword } = require('../../utils/hash.utils');
const { signToken } = require('../../utils/jwt.utils');
const { safeUser } = require('../../utils/sanitize.utils');

async function register({ email, password, profile_managed_by }) {
  const db = getDb();

  // Check duplicate email
  const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email);
  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  const password_hash = await hashPassword(password);

  // Insert user — starts as Pending_ID
  const { lastInsertRowid: userId } = db.prepare(`
    INSERT INTO users (email, password_hash, role, account_status, profile_managed_by)
    VALUES (?, ?, 'user', 'Pending_ID', ?)
  `).run(email, password_hash, profile_managed_by);

  // Create empty profile row so wizard steps can update it
  db.prepare(`
    INSERT INTO profiles (user_id, first_name, surname, gotra, registration_step)
    VALUES (?, '', '', '', 0)
  `).run(userId);

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  const token = signToken({ userId: user.user_id, role: user.role });

  return { user: safeUser(user), token };
}

async function login({ email, password }) {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  if (user.account_status === 'Suspended') {
    const err = new Error('Your account has been suspended. Please contact support.');
    err.statusCode = 403;
    throw err;
  }

  const token = signToken({ userId: user.user_id, role: user.role });
  return { user: safeUser(user), token };
}

function getMe(userId) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  return { user: safeUser(user), profile: profile || null };
}

module.exports = { register, login, getMe };
