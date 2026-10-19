'use strict';

require('dotenv').config();
const { runMigrations } = require('./migrations');
const { closePool } = require('../config/database');

async function main() {
  console.log('[migrate] Starting PostgreSQL migration...');
  try {
    await runMigrations();
    console.log('[migrate] Migration completed successfully.');
  } catch (err) {
    console.error('[migrate] Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
