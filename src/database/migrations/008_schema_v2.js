'use strict';

const { getDb } = require('../../config/database');

/**
 * Migration 008 — Schema v2
 *
 * Safe additive migration: only ADD COLUMN (never drop) so existing data is
 * never destroyed.  SQLite supports ALTER TABLE … ADD COLUMN without rebuilding
 * the table, making this safe to run against a live database.
 *
 * Adds:
 *  profiles:    pref_sub_sect, pref_location, pref_age_diff_min, pref_age_diff_max
 *  family_info: elder_ref_{1,2,3}_{name,phone,address,occupation}
 *
 * Deprecated but NOT dropped (data preservation):
 *  profiles.sutra              — replaced by relabelling shakha as "Sect / Shakha"
 *  family_info.paternal_uncle_name / phone
 *  family_info.maternal_uncle_name / phone
 *  family_info.purohit_reference_phone
 */
function up() {
  const db = getDb();

  // Helper: add a column only if it doesn't exist yet (idempotent)
  function addColumnIfMissing(table, column, definition) {
    const existing = db.pragma(`table_info(${table})`);
    if (!existing.find((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // ── Preferences (stored on profiles) ───────────────────────────────────────
  addColumnIfMissing('profiles', 'pref_sub_sect',      'TEXT');
  addColumnIfMissing('profiles', 'pref_location',      'TEXT');
  addColumnIfMissing('profiles', 'pref_age_diff_min',  'INTEGER');
  addColumnIfMissing('profiles', 'pref_age_diff_max',  'INTEGER');

  // ── Elder References (stored on family_info) ────────────────────────────────
  addColumnIfMissing('family_info', 'elder_ref_1_name',       'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_1_phone',      'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_1_address',    'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_1_occupation', 'TEXT');

  addColumnIfMissing('family_info', 'elder_ref_2_name',       'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_2_phone',      'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_2_address',    'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_2_occupation', 'TEXT');

  addColumnIfMissing('family_info', 'elder_ref_3_name',       'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_3_phone',      'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_3_address',    'TEXT');
  addColumnIfMissing('family_info', 'elder_ref_3_occupation', 'TEXT');
}

module.exports = { up };
