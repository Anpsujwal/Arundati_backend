'use strict';

/**
 * Profile Grades Service (PostgreSQL)
 *
 * Allows a logged-in user to grade / tag any proposal shown in their match feed:
 *   • Prioritize    – High priority
 *   • MaybeLater    – Shortlisted, revisit later
 *   • NotInterested – Skip / hide from priority view
 *   • AlreadyDealt  – Permanently hide from feed (conversation started externally)
 */

const db = require('../../config/database');

const VALID_GRADES = ['Prioritize', 'MaybeLater', 'NotInterested', 'AlreadyDealt'];

/**
 * Upsert a grade for a profile.
 * If the user already graded this profile, the grade is updated.
 */
async function gradeProfile(userId, profileId, grade) {
  if (!VALID_GRADES.includes(grade)) {
    const e = new Error(`Invalid grade. Must be one of: ${VALID_GRADES.join(', ')}`);
    e.statusCode = 400;
    throw e;
  }

  // Verify the candidate profile exists
  const profile = await db.queryOne('SELECT profile_id FROM profiles WHERE profile_id = $1', [profileId]);
  if (!profile) {
    const e = new Error('Profile not found.');
    e.statusCode = 404;
    throw e;
  }

  // Upsert — INSERT or UPDATE if already graded
  await db.query(`
    INSERT INTO profile_grades (user_id, profile_id, grade)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, profile_id)
    DO UPDATE SET grade = EXCLUDED.grade, updated_at = CURRENT_TIMESTAMP
  `, [userId, profileId, grade]);

  return { profile_id: profileId, grade };
}

/**
 * Get all grades set by the user (used for restoring UI state on reload).
 */
async function getUserGrades(userId) {
  return db.queryRows(`
    SELECT profile_id, grade, updated_at
    FROM profile_grades
    WHERE user_id = $1
    ORDER BY updated_at DESC
  `, [userId]);
}

/**
 * Get the set of profile_ids that the user has marked as 'AlreadyDealt'.
 * Used by the match feed to exclude those profiles.
 */
async function getAlreadyDealtIds(userId) {
  const rows = await db.queryRows(`
    SELECT profile_id FROM profile_grades
    WHERE user_id = $1 AND grade = 'AlreadyDealt'
  `, [userId]);
  return new Set(rows.map((r) => r.profile_id));
}

module.exports = { gradeProfile, getUserGrades, getAlreadyDealtIds };
