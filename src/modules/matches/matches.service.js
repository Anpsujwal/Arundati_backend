'use strict';

const { getDb } = require('../../config/database');
const { publicProfile } = require('../../utils/sanitize.utils');

/**
 * CORE BUSINESS RULE: Gotra Restriction
 *
 * For a given user, only show candidates where:
 *   1. Candidate is opposite gender
 *   2. Candidate account_status = 'Approved'
 *   3. Candidate gotra != current user gotra
 *   4. Candidate is not the current user
 *
 * This rule is enforced at SQL level — it cannot be bypassed by any client.
 */
function getMatchFeed(userId, { page = 1, limit = 12 } = {}) {
  const db = getDb();

  const currentProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!currentProfile) {
    const err = new Error('Your profile is not set up yet.');
    err.statusCode = 400;
    throw err;
  }

  const offset = (page - 1) * limit;

  const matches = db.prepare(`
    SELECT
      p.profile_id,
      p.first_name,
      p.surname,
      p.gender,
      p.date_of_birth,
      p.sub_sect,
      p.gotra,
      p.pravara,
      p.veda,
      p.city,
      p.height_cm,
      p.marital_status,
      p.education,
      p.profession,
      p.annual_income,
      p.hide_income,
      p.dietary_habit,
      u.account_status,
      (SELECT filename FROM profile_photos WHERE profile_id = p.profile_id AND is_primary = 1 LIMIT 1) AS primary_photo
    FROM profiles p
    JOIN users u ON u.user_id = p.user_id
    WHERE
      u.account_status = 'Approved'
      AND p.gender != ?
      AND p.gotra != ?
      AND p.gotra != ''
      AND p.user_id != ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(currentProfile.gender, currentProfile.gotra, userId, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM profiles p
    JOIN users u ON u.user_id = p.user_id
    WHERE
      u.account_status = 'Approved'
      AND p.gender != ?
      AND p.gotra != ?
      AND p.gotra != ''
      AND p.user_id != ?
  `).get(currentProfile.gender, currentProfile.gotra, userId).count;

  return {
    matches: matches.map((m) => {
      if (m.hide_income) { m.annual_income = null; }
      delete m.hide_income;
      return m;
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Get a single candidate profile (public/privacy-sanitized view).
 * Still enforces gotra rule — cannot peek at same-gotra profiles by ID.
 */
function getCandidateProfile(userId, candidateProfileId) {
  const db = getDb();

  const currentProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!currentProfile) {
    const err = new Error('Your profile is not found.');
    err.statusCode = 404;
    throw err;
  }

  const candidate = db.prepare(`
    SELECT p.*, u.account_status, u.email
    FROM profiles p JOIN users u ON u.user_id = p.user_id
    WHERE p.profile_id = ?
  `).get(candidateProfileId);

  if (!candidate) {
    const err = new Error('Profile not found.');
    err.statusCode = 404;
    throw err;
  }

  // Enforce gotra restriction even on direct profile lookup
  if (candidate.account_status !== 'Approved') {
    const err = new Error('Profile not available.');
    err.statusCode = 404;
    throw err;
  }
  if (candidate.gender === currentProfile.gender) {
    const err = new Error('Profile not available.');
    err.statusCode = 404;
    throw err;
  }
  if (candidate.gotra === currentProfile.gotra) {
    const err = new Error('Profile not available due to Gotra compatibility rules.');
    err.statusCode = 403;
    throw err;
  }

  const family = db.prepare('SELECT * FROM family_info WHERE profile_id=?').get(candidateProfileId);
  const photos = db.prepare('SELECT * FROM profile_photos WHERE profile_id=? AND is_approved=1').all(candidateProfileId);
  const astro = db.prepare('SELECT * FROM astro_data WHERE profile_id=?').get(candidateProfileId);

  // Check if current user has sent interest to this candidate
  const interest = db.prepare(`
    SELECT * FROM interests
    WHERE sender_profile_id = ? AND receiver_profile_id = ?
  `).get(currentProfile.profile_id, candidateProfileId);

  const sanitized = publicProfile(candidate, family);

  return {
    ...sanitized,
    photos,
    astro: astro ? { birth_place: astro.birth_place, timezone: astro.timezone } : null, // No raw coords in public view
    interest_status: interest ? interest.status : null,
  };
}

module.exports = { getMatchFeed, getCandidateProfile };
