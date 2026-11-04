'use strict';

const db = require('../../config/database');

/**
 * Migration 012 — Community Categories (Primary Sect + Sub-Sect taxonomy)
 *
 * Creates community_categories table with a self-referencing parent_id tree.
 * Also adds primary_sect + custom community fields to the profiles table.
 *
 * Fully idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 */
async function up(client) {
  const runner = client || db;

  // 1. Create the taxonomy table
  await runner.query(`
    CREATE TABLE IF NOT EXISTS community_categories (
      id             SERIAL PRIMARY KEY,
      name           TEXT    NOT NULL,
      slug           TEXT    NOT NULL UNIQUE,
      parent_id      INTEGER REFERENCES community_categories(id) ON DELETE RESTRICT,
      category_level SMALLINT NOT NULL CHECK (category_level IN (1, 2)),
      is_active      BOOLEAN  NOT NULL DEFAULT TRUE,
      display_order  INTEGER  NOT NULL DEFAULT 0,
      created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Indexes for lookup performance
  await runner.query(`
    CREATE INDEX IF NOT EXISTS idx_comm_cat_parent_id ON community_categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_comm_cat_slug      ON community_categories(slug);
    CREATE INDEX IF NOT EXISTS idx_comm_cat_level     ON community_categories(category_level);
    CREATE INDEX IF NOT EXISTS idx_comm_cat_active    ON community_categories(is_active);
  `);

  // 3. Add primary_sect + custom-entry columns to profiles (backward-compatible)
  await runner.query(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_sect            TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_custom_name   TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_custom_pending BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pref_primary_sect            TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pref_community_custom_name   TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pref_community_custom_pending BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}

module.exports = { name: '012_community_categories', up };
