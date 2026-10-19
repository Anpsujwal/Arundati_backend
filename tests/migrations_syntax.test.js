'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrations } = require('../src/database/migrations');

test('All 11 migrations are present in correct order', () => {
  assert.equal(migrations.length, 11);
  const expectedNames = [
    '001_users',
    '002_profiles',
    '003_astro',
    '004_family',
    '005_photos',
    '006_documents',
    '007_interests',
    '008_schema_v2',
    '009_kundali',
    '010_kundali_matches',
    '011_profile_grades',
  ];

  for (let i = 0; i < expectedNames.length; i++) {
    assert.equal(migrations[i].name, expectedNames[i]);
    assert.equal(typeof migrations[i].up, 'function');
  }
});

test('All migration SQL statements target PostgreSQL and contain no SQLite-specific syntax', async () => {
  for (const m of migrations) {
    const executedSql = [];
    const mockClient = {
      query: async (sql) => {
        executedSql.push(sql);
        return { rows: [] };
      },
    };

    await m.up(mockClient);
    assert.ok(executedSql.length > 0, `Migration ${m.name} emitted SQL`);

    for (const sql of executedSql) {
      assert.doesNotMatch(
        sql,
        /INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i,
        `Migration ${m.name} should not contain AUTOINCREMENT`
      );
      assert.doesNotMatch(sql, /PRAGMA/i, `Migration ${m.name} should not contain PRAGMA`);
    }
  }
});
