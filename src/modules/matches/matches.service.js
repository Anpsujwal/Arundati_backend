'use strict';

/**
 * Matches Service
 *
 * Provides the match feed and candidate detail views.
 * All eligibility filtering is enforced SERVER-SIDE.
 *
 * Match Feed pipeline:
 *   1. Approved + opposite gender + different gotra (SQL)
 *   2. Full match pipeline (eligibility → kundali → guna milan → preferences → score)
 *   3. Filter to is_eligible = true (Guna >= 18)
 *   4. Sort by overall_score DESC
 *   5. Paginate
 *
 * Architecture:
 *   This service calls matchPipeline.service.js for computation.
 *   It does NOT directly call PyJHora or the compatibility engine.
 */

const { getDb } = require('../../config/database');
const { publicProfile } = require('../../utils/sanitize.utils');
const { runMatchPipeline, normalizeGotra } = require('./matchPipeline.service');
const { generateExplanation } = require('../kundali/kundali.explanation.service');
const { getKundaliForUser } = require('../kundali/kundali.service');

// ─── Match Feed ───────────────────────────────────────────────────────────────

/**
 * Get the paginated, ranked match feed for the current user.
 * Only returns candidates with Guna Milan >= 18/36 (eligibility threshold).
 *
 * @param {number} userId
 * @param {object} options — { page, limit }
 */
async function getMatchFeed(userId, { page = 1, limit = 12 } = {}) {
  const db = getDb();

  const currentUser    = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  const currentProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!currentProfile) {
    const err = new Error('Your profile is not set up yet.');
    err.statusCode = 400;
    throw err;
  }

  const currentGotra = normalizeGotra(currentProfile.gotra);

  // Candidate pool: approved, opposite gender, different non-empty gotra
  // SQL enforces Stages 1 & 2 for performance (avoid loading all users into JS)
  const candidates = db.prepare(`
    SELECT
      p.*,
      u.account_status,
      u.user_id as u_user_id,
      (SELECT filename FROM profile_photos WHERE profile_id = p.profile_id AND is_primary = 1 LIMIT 1) AS primary_photo
    FROM profiles p
    JOIN users u ON u.user_id = p.user_id
    WHERE
      u.account_status = 'Approved'
      AND p.gender != ?
      AND LOWER(TRIM(p.gotra)) != ?
      AND p.gotra != ''
      AND p.user_id != ?
    ORDER BY p.created_at DESC
    LIMIT 200
  `).all(currentProfile.gender, currentGotra, userId);

  // Run the pipeline for each candidate (reads from cache when valid)
  const results = [];
  for (const candidate of candidates) {
    const candidateAccount = { account_status: candidate.account_status };
    const candidateProfile = { ...candidate, user_id: candidate.u_user_id };

    try {
      const matchResult = await runMatchPipeline(
        currentProfile, currentUser,
        candidateProfile, candidateAccount,
      );

      if (matchResult.excluded) continue;
      if (!matchResult.eligibility?.isEligible) continue; // Guna < 18 threshold

      results.push({
        profile_id:    candidate.profile_id,
        first_name:    candidate.first_name,
        surname:       candidate.surname,
        gender:        candidate.gender,
        date_of_birth: candidate.date_of_birth,
        sub_sect:      candidate.sub_sect,
        gotra:         candidate.gotra,
        city:          candidate.city,
        height_cm:     candidate.height_cm,
        marital_status: candidate.marital_status,
        education:     candidate.education,
        profession:    candidate.profession,
        annual_income: candidate.hide_income ? null : candidate.annual_income,
        primary_photo: candidate.primary_photo,
        kundali_status: matchResult.kundali?.available ? 'GENERATED' : 'NOT_READY',
        guna_milan: matchResult.gunaMilan ? {
          total:   matchResult.gunaMilan.total,
          maximum: matchResult.gunaMilan.maximum,
          doshas:  matchResult.gunaMilan.doshas,
        } : null,
        overall_score: matchResult.overall?.score ?? null,
      });
    } catch (pipelineErr) {
      console.error(`[matches] Pipeline error for candidate ${candidate.u_user_id}:`, pipelineErr.message);
      // Skip this candidate rather than crashing the entire feed
    }
  }

  // Sort by overall_score descending
  results.sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));

  // Paginate
  const total = results.length;
  const offset = (page - 1) * limit;
  const paginated = results.slice(offset, offset + limit);

  return {
    matches: paginated,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Candidate Profile (detail view) ─────────────────────────────────────────

/**
 * Get a single candidate profile (public/privacy-sanitized view).
 * Enforces all eligibility rules even on direct URL access.
 */
function getCandidateProfile(userId, candidateProfileId) {
  const db = getDb();

  const currentProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!currentProfile) {
    const err = new Error('Your profile is not found.'); err.statusCode = 404; throw err;
  }

  const candidate = db.prepare(`
    SELECT p.*, u.account_status, u.user_id as u_user_id
    FROM profiles p JOIN users u ON u.user_id = p.user_id
    WHERE p.profile_id = ?
  `).get(candidateProfileId);

  if (!candidate) {
    const err = new Error('Profile not found.'); err.statusCode = 404; throw err;
  }

  if (candidate.account_status !== 'Approved') {
    const err = new Error('Profile not available.'); err.statusCode = 404; throw err;
  }
  if (candidate.gender === currentProfile.gender) {
    const err = new Error('Profile not available.'); err.statusCode = 404; throw err;
  }
  const userGotra = normalizeGotra(currentProfile.gotra);
  const candidateGotra = normalizeGotra(candidate.gotra);
  if (userGotra && candidateGotra && userGotra === candidateGotra) {
    const err = new Error('Profile not available due to Gotra compatibility rules.'); err.statusCode = 403; throw err;
  }

  const family = db.prepare('SELECT * FROM family_info WHERE profile_id=?').get(candidateProfileId);
  const photos = db.prepare('SELECT * FROM profile_photos WHERE profile_id=? AND is_approved=1').all(candidateProfileId);
  const astro  = db.prepare('SELECT * FROM astro_data WHERE profile_id=?').get(candidateProfileId);

  const interest = db.prepare(`
    SELECT * FROM interests WHERE sender_profile_id = ? AND receiver_profile_id = ?
  `).get(currentProfile.profile_id, candidateProfileId);

  const sanitized = publicProfile(candidate, family);
  const kundaliInfo = getKundaliForUser(candidate.u_user_id);

  return {
    ...sanitized,
    photos,
    astro: astro ? { birth_place: astro.birth_place, timezone: astro.timezone } : null,
    interest_status: interest ? interest.status : null,
    kundali_status: kundaliInfo.kundali_status,
  };
}

// ─── Compatibility Detail ─────────────────────────────────────────────────────

/**
 * Get full compatibility breakdown between the current user and a candidate.
 * Includes Kundali compatibility, Guna Milan, preferences, and AI explanation.
 */
async function getCompatibilityDetail(userId, candidateProfileId) {
  const db = getDb();

  const currentUser    = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  const currentProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!currentProfile) {
    const err = new Error('Your profile not found.'); err.statusCode = 404; throw err;
  }

  const candidate = db.prepare(`
    SELECT p.*, u.account_status, u.user_id as u_user_id
    FROM profiles p JOIN users u ON u.user_id = p.user_id
    WHERE p.profile_id = ?
  `).get(candidateProfileId);

  if (!candidate) {
    const err = new Error('Candidate not found.'); err.statusCode = 404; throw err;
  }

  // Enforce eligibility rules
  if (candidate.account_status !== 'Approved') {
    const err = new Error('Profile not available.'); err.statusCode = 404; throw err;
  }
  const userGotra = normalizeGotra(currentProfile.gotra);
  const candidateGotra = normalizeGotra(candidate.gotra);
  if (userGotra && candidateGotra && userGotra === candidateGotra) {
    const err = new Error('Gotra compatibility rules prevent viewing this profile.'); err.statusCode = 403; throw err;
  }

  const candidateProfile = { ...candidate, user_id: candidate.u_user_id };
  const candidateAccount = { account_status: candidate.account_status };

  const matchResult = await runMatchPipeline(
    currentProfile, currentUser,
    candidateProfile, candidateAccount,
  );

  // Generate AI explanation from structured result
  const aiExplanation = await generateExplanation(matchResult);

  return {
    ...matchResult,
    aiExplanation,
  };
}

module.exports = { getMatchFeed, getCandidateProfile, getCompatibilityDetail };
