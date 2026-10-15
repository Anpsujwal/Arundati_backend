'use strict';

const { getDb } = require('../../config/database');

/**
 * Migration 011 — Profile Grades
 *
 * Allows a user to tag/grade each proposal shown in the match feed:
 *   • Prioritize      – High priority, contact soon
 *   • MaybeLater      – Shortlisted but not urgent
 *   • NotInterested   – Skip / hide
 *   • AlreadyDealt    – Conversation already started externally; hide permanently
 *
 * The match feed will exclude profiles graded 'AlreadyDealt' for that user.
 */
function up() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_grades (
      grade_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      profile_id  INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
      grade       TEXT    NOT NULL
                  CHECK(grade IN ('Prioritize', 'MaybeLater', 'NotInterested', 'AlreadyDealt')),
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, profile_id)
    );
  `);

  // Index to quickly find all graded profiles for a given user
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_profile_grades_user
      ON profile_grades(user_id);
  `);
}

module.exports = { up };
