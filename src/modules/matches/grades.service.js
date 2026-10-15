'use strict';

/**
 * Profile Grades Service
 *
 * Allows a logged-in user to grade / tag any proposal shown in their match feed:
 *   • Prioritize    – High priority
 *   • MaybeLater    – Shortlisted, revisit later
 *   • NotInterested – Skip / hide from priority view
 *   • AlreadyDealt  – Permanently hide from feed (conversation started externally)
 */

const { getDb } = require('../../config/database');

const VALID_GRADES = ['Prioritize', 'MaybeLater', 'NotInterested', 'AlreadyDealt'];

/**
 * Upsert a grade for a profile.
 * If the user already graded this profile, the grade is updated.
 *
 * @param {number} userId
 * @param {number} profileId  — the profile_id of the candidate being graded
 * @param {string} grade      — one of VALID_GRADES
 */
function gradeProfile(userId, profileId, grade) {
  if (!VALID_GRADES.includes(grade)) {
    const e = new Error(`Invalid grade. Must be one of: ${VALID_GRADES.join(', ')}`);
    e.statusCode = 400;
    throw e;
  }

  const db = getDb();

  // Verify the candidate profile exists
  const profile = db.prepare('SELECT profile_id FROM profiles WHERE profile_id = ?').get(profileId);
  if (!profile) {
    const e = new Error('Profile not found.'); e.statusCode = 404; throw e;
  }

  // Upsert — INSERT or UPDATE if already graded
  db.prepare(`
    INSERT INTO profile_grades (user_id, profile_id, grade)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, profile_id)
    DO UPDATE SET grade = excluded.grade, updated_at = CURRENT_TIMESTAMP
  `).run(userId, profileId, grade);

  return { profile_id: profileId, grade };
}

/**
 * Get all grades set by the user (used for restoring UI state on reload).
 *
 * @param {number} userId
 * @returns {{ profile_id: number, grade: string }[] }
 */
function getUserGrades(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT profile_id, grade, updated_at
    FROM profile_grades
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId);
}

/**
 * Get the set of profile_ids that the user has marked as 'AlreadyDealt'.
 * Used by the match feed to exclude those profiles.
 *
 * @param {number} userId
 * @returns {Set<number>}
 */
function getAlreadyDealtIds(userId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT profile_id FROM profile_grades
    WHERE user_id = ? AND grade = 'AlreadyDealt'
  `).all(userId);
  return new Set(rows.map((r) => r.profile_id));
}

module.exports = { gradeProfile, getUserGrades, getAlreadyDealtIds };
