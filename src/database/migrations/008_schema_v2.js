'use strict';

const db = require('../../config/database');

/**
 * Migration 008 — Schema v2 (PostgreSQL)
 *
 * Additive migration: ADD COLUMN IF NOT EXISTS ensures idempotency and safe execution.
 */
async function up(client) {
  const runner = client || db;

  await runner.query(`
    -- Preferences (stored on profiles)
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pref_sub_sect TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pref_location TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pref_age_diff_min INTEGER;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pref_age_diff_max INTEGER;

    -- Elder References (stored on family_info)
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_1_name TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_1_phone TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_1_address TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_1_occupation TEXT;

    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_2_name TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_2_phone TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_2_address TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_2_occupation TEXT;

    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_3_name TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_3_phone TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_3_address TEXT;
    ALTER TABLE family_info ADD COLUMN IF NOT EXISTS elder_ref_3_occupation TEXT;
  `);
}

module.exports = { name: '008_schema_v2', up };
