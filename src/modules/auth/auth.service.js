'use strict';

const db = require('../../config/database');
const { hashPassword, comparePassword } = require('../../utils/hash.utils');
const { signToken } = require('../../utils/jwt.utils');
const { safeUser } = require('../../utils/sanitize.utils');

async function register({ email, password, profile_managed_by }) {
  // Check duplicate email
  const existing = await db.queryOne('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  const password_hash = await hashPassword(password);

  // Insert user and create empty profile row inside a single atomic transaction
  const user = await db.transaction(async (client) => {
    const resUser = await client.query(`
      INSERT INTO users (email, password_hash, role, account_status, profile_managed_by)
      VALUES ($1, $2, 'user', 'Pending_ID', $3)
      RETURNING *
    `, [email, password_hash, profile_managed_by || null]);

    const newUser = resUser.rows[0];

    await client.query(`
      INSERT INTO profiles (user_id, first_name, surname, gotra, registration_step)
      VALUES ($1, '', '', '', 0)
    `, [newUser.user_id]);

    return newUser;
  });

  const token = signToken({ userId: user.user_id, role: user.role });
  return { user: safeUser(user), token };
}

async function login({ email, password }) {
  const user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email]);
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

async function getMe(userId) {
  const user = await db.queryOne('SELECT * FROM users WHERE user_id = $1', [userId]);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  return { user: safeUser(user), profile: profile || null };
}

module.exports = { register, login, getMe };
