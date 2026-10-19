'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, comparePassword } = require('../src/utils/hash.utils');
const { signToken, verifyToken } = require('../src/utils/jwt.utils');
const { safeUser } = require('../src/utils/sanitize.utils');
const app = require('../src/app');

test('Password hashing and bcrypt verification', async () => {
  const plain = 'StrongPass@123';
  const hashed = await hashPassword(plain);
  assert.ok(hashed.startsWith('$2'));

  const valid = await comparePassword(plain, hashed);
  assert.equal(valid, true);

  const invalid = await comparePassword('WrongPassword', hashed);
  assert.equal(invalid, false);
});

test('JWT signing and verification preserves payload', () => {
  const payload = { userId: 42, role: 'admin' };
  const token = signToken(payload);
  assert.ok(token && typeof token === 'string');

  const decoded = verifyToken(token);
  assert.equal(decoded.userId, 42);
  assert.equal(decoded.role, 'admin');
});

test('safeUser sanitizes sensitive fields', () => {
  const rawUser = {
    user_id: 1,
    email: 'test@example.com',
    password_hash: '$2a$12$secretHash',
    role: 'user',
    account_status: 'Approved',
  };

  const sanitized = safeUser(rawUser);
  assert.equal(sanitized.user_id, 1);
  assert.equal(sanitized.email, 'test@example.com');
  assert.equal(sanitized.password_hash, undefined);
});

test('Express app exports valid request handler with routes', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');
});
