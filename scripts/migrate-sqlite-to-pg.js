'use strict';

/**
 * SQLite to PostgreSQL Data Migration Utility
 *
 * Copies all data from the local SQLite database into PostgreSQL (Neon)
 * in foreign-key dependency order, preserving IDs, password hashes,
 * timestamps, and relationships.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-pg.js [--dry-run] [--force]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/database/migrations');
const db = require('../src/config/database');

const SQLITE_PATH = path.resolve(__dirname, '../data/arundhati.db');

const TABLES_IN_ORDER = [
  { table: 'users', pk: 'user_id' },
  { table: 'profiles', pk: 'profile_id' },
  { table: 'astro_data', pk: 'astro_id' },
  { table: 'family_info', pk: 'family_id' },
  { table: 'profile_photos', pk: 'photo_id' },
  { table: 'documents', pk: 'doc_id' },
  { table: 'interests', pk: 'interest_id' },
  { table: 'kundalis', pk: 'kundali_id' },
  { table: 'kundali_matches', pk: 'match_id' },
  { table: 'profile_grades', pk: 'grade_id' },
];

async function migrateData({ dryRun = false } = {}) {
  console.log('='.repeat(65));
  console.log('  SQLite → PostgreSQL (Neon) Data Migration Utility');
  console.log('='.repeat(65));

  if (!fs.existsSync(SQLITE_PATH)) {
    throw new Error(`Source SQLite database not found at: ${SQLITE_PATH}`);
  }

  // 1. Safe SQLite Backup
  const backupPath = `${SQLITE_PATH}.backup_${Date.now()}`;
  console.log(`\n[1/5] Backing up SQLite database to: ${path.basename(backupPath)}...`);
  fs.copyFileSync(SQLITE_PATH, backupPath);
  console.log('✓ SQLite backup created safely.');

  // 2. Open SQLite in read-only mode
  const sqlite = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });

  // 3. Ensure destination PostgreSQL schema exists
  console.log('\n[2/5] Verifying PostgreSQL destination schema...');
  await runMigrations();
  console.log('✓ PostgreSQL schema verified.');

  const client = await db.getClient();
  const report = [];

  try {
    console.log(`\n[3/5] Migrating table data (dryRun = ${dryRun})...`);

    if (!dryRun) {
      await client.query('BEGIN');
    }

    for (const { table, pk } of TABLES_IN_ORDER) {
      // Get all columns present in SQLite
      const pragmaCols = sqlite.prepare(`PRAGMA table_info("${table}")`).all();
      if (!pragmaCols || pragmaCols.length === 0) {
        console.log(`  - Table "${table}" not found in SQLite, skipping.`);
        continue;
      }

      const colNames = pragmaCols.map((c) => c.name);
      const rows = sqlite.prepare(`SELECT * FROM "${table}" ORDER BY "${pk}" ASC`).all();

      let insertedCount = 0;
      let skippedCount = 0;

      for (const row of rows) {
        if (dryRun) {
          insertedCount++;
          continue;
        }

        // Build parameterized insert
        const colsSql = colNames.map((c) => `"${c}"`).join(', ');
        const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ');
        const values = colNames.map((c) => row[c] ?? null);

        try {
          await client.query(
            `INSERT INTO "${table}" (${colsSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          insertedCount++;
        } catch (insertErr) {
          console.warn(`  [warn] Row conflict in ${table} (${pk}=${row[pk]}): ${insertErr.message}`);
          skippedCount++;
        }
      }

      // Reset sequence in Postgres
      if (!dryRun && pk) {
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence($1, $2),
            COALESCE((SELECT MAX("${pk}") FROM "${table}"), 1),
            true
          )
        `, [table, pk]);
      }

      // Check count in PostgreSQL
      let pgCount = 0;
      if (!dryRun) {
        const cntRes = await client.query(`SELECT COUNT(*) as c FROM "${table}"`);
        pgCount = parseInt(cntRes.rows[0].c, 10);
      } else {
        pgCount = insertedCount;
      }

      report.push({
        table,
        sqliteRows: rows.length,
        migrated: insertedCount,
        conflicts: skippedCount,
        pgTotal: pgCount,
        status: rows.length === pgCount ? 'MATCH' : 'DIFFERENCE',
      });

      console.log(`  ✓ ${table.padEnd(16)}: ${rows.length} in SQLite → ${insertedCount} migrated (${pgCount} in PG)`);
    }

    if (!dryRun) {
      await client.query('COMMIT');
      console.log('\n[4/5] Transaction committed successfully.');
    } else {
      console.log('\n[4/5] Dry run completed. No data was written.');
    }

    // 5. Verification Report
    console.log('\n[5/5] Migration Verification Report:');
    console.log('-'.repeat(65));
    console.log(
      'Table'.padEnd(18) +
      'SQLite Rows'.padEnd(14) +
      'Migrated'.padEnd(12) +
      'PG Rows'.padEnd(12) +
      'Status'
    );
    console.log('-'.repeat(65));
    for (const r of report) {
      console.log(
        r.table.padEnd(18) +
        String(r.sqliteRows).padEnd(14) +
        String(r.migrated).padEnd(12) +
        String(r.pgTotal).padEnd(12) +
        r.status
      );
    }
    console.log('-'.repeat(65));

    sqlite.close();
    console.log('\n✓ Migration finished successfully.');
    return report;
  } catch (err) {
    if (!dryRun) {
      try {
        await client.query('ROLLBACK');
        console.log('[rollback] Transaction rolled back cleanly.');
      } catch (_) {}
    }
    sqlite.close();
    throw err;
  } finally {
    client.release();
    await db.closePool();
  }
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  migrateData({ dryRun: isDryRun }).catch((err) => {
    console.error('\n✗ Migration failed:', err.message);
    process.exit(1);
  });
}

module.exports = { migrateData };
