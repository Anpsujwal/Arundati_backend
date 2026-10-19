'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Database config fails cleanly when DATABASE_URL is missing', () => {
  const origUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  // Clear require cache for database module
  delete require.cache[require.resolve('../src/config/database')];
  const db = require('../src/config/database');

  assert.throws(
    () => {
      db.getPool();
    },
    (err) => {
      assert.match(err.message, /DATABASE_URL environment variable is required/);
      return true;
    }
  );

  // Restore
  if (origUrl) process.env.DATABASE_URL = origUrl;
});

test('Database exports required pool and query helpers', () => {
  const db = require('../src/config/database');
  assert.equal(typeof db.getPool, 'function');
  assert.equal(typeof db.query, 'function');
  assert.equal(typeof db.queryOne, 'function');
  assert.equal(typeof db.queryRows, 'function');
  assert.equal(typeof db.getClient, 'function');
  assert.equal(typeof db.transaction, 'function');
  assert.equal(typeof db.closePool, 'function');
});
