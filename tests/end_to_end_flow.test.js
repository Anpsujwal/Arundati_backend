'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Auth service flow and duplicate registration detection', async () => {
  // Mock db module
  const db = require('../src/config/database');
  const authService = require('../src/modules/auth/auth.service');

  const origQueryOne = db.queryOne;
  const origTransaction = db.transaction;

  try {
    let mockUsers = [];
    let mockProfiles = [];

    db.queryOne = async (sql, params) => {
      if (sql.includes('SELECT user_id FROM users WHERE email = $1')) {
        const found = mockUsers.find((u) => u.email === params[0]);
        return found ? { user_id: found.user_id } : null;
      }
      if (sql.includes('SELECT * FROM users WHERE email = $1')) {
        return mockUsers.find((u) => u.email === params[0]) || null;
      }
      if (sql.includes('SELECT * FROM users WHERE user_id = $1')) {
        return mockUsers.find((u) => u.user_id === params[0]) || null;
      }
      if (sql.includes('SELECT * FROM profiles WHERE user_id = $1')) {
        return mockProfiles.find((p) => p.user_id === params[0]) || null;
      }
      return null;
    };

    db.transaction = async (cb) => {
      const mockClient = {
        query: async (sql, params) => {
          if (sql.includes('INSERT INTO users')) {
            const newUser = {
              user_id: mockUsers.length + 1,
              email: params[0],
              password_hash: params[1],
              role: 'user',
              account_status: 'Pending_ID',
              profile_managed_by: params[2],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            mockUsers.push(newUser);
            return { rows: [newUser] };
          }
          if (sql.includes('INSERT INTO profiles')) {
            const newProfile = {
              profile_id: mockProfiles.length + 1,
              user_id: params[0],
              first_name: '',
              surname: '',
              gotra: '',
              registration_step: 0,
            };
            mockProfiles.push(newProfile);
            return { rows: [newProfile] };
          }
          return { rows: [] };
        },
      };
      return cb(mockClient);
    };

    // 1. Successful registration
    const regRes = await authService.register({
      email: 'user1@example.com',
      password: 'Password@123',
      profile_managed_by: 'Self',
    });

    assert.equal(regRes.user.email, 'user1@example.com');
    assert.equal(regRes.user.account_status, 'Pending_ID');
    assert.ok(regRes.token);

    // 2. Duplicate registration throws 409
    await assert.rejects(
      async () => {
        await authService.register({
          email: 'user1@example.com',
          password: 'Password@123',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /already exists/);
        return true;
      }
    );

    // 3. Successful login
    const loginRes = await authService.login({
      email: 'user1@example.com',
      password: 'Password@123',
    });
    assert.equal(loginRes.user.email, 'user1@example.com');
    assert.ok(loginRes.token);

    // 4. Invalid password throws 401
    await assert.rejects(
      async () => {
        await authService.login({
          email: 'user1@example.com',
          password: 'WrongPassword',
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        return true;
      }
    );

    // 5. getMe returns user and profile
    const meRes = await authService.getMe(regRes.user.user_id);
    assert.equal(meRes.user.email, 'user1@example.com');
    assert.equal(meRes.profile.user_id, regRes.user.user_id);
  } finally {
    db.queryOne = origQueryOne;
    db.transaction = origTransaction;
  }
});
