'use strict';

/**
 * Matches Service (PostgreSQL)
 *
 * Provides the match feed and candidate detail views.
 * All eligibility filtering is enforced SERVER-SIDE.
 */

const db = require('../../config/database');
const { publicProfile } = require('../../utils/sanitize.utils');
const { runMatchPipeline, normalizeGotra } = require('./matchPipeline.service');
const { generateExplanation } = require('../kundali/kundali.explanation.service');
const { getKundaliForUser } = require('../kundali/kundali.service');
const { getAlreadyDealtIds, getUserGrades } = require('./grades.service');

// ─── Match Feed ───────────────────────────────────────────────────────────────

async function getMatchFeed(userId, { page = 1, limit = 12 } = {}) {
  const currentUser    = await db.queryOne('SELECT * FROM users WHERE user_id = $1', [userId]);
  const currentProfile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!currentProfile) {
    const err = new Error('Your profile is not set up yet.');
    err.statusCode = 400;
    throw err;
  }

  const currentGotra = normalizeGotra(currentProfile.gotra);

  // Load grades
  const alreadyDealtIds = await getAlreadyDealtIds(userId);
  const grades = await getUserGrades(userId);
  const userGradesMap = {};
  for (const g of grades) userGradesMap[g.profile_id] = g.grade;

  // Candidate pool: approved, opposite gender, different non-empty gotra
  const candidates = await db.queryRows(`
    SELECT
      p.*,
      u.account_status,
      u.user_id as u_user_id,
      (SELECT filename FROM profile_photos WHERE profile_id = p.profile_id AND is_primary = 1 LIMIT 1) AS primary_photo
    FROM profiles p
    JOIN users u ON u.user_id = p.user_id
    WHERE
      u.account_status = 'Approved'
      AND p.gender != $1
      AND LOWER(TRIM(p.gotra)) != $2
      AND p.gotra != ''
      AND p.user_id != $3
    ORDER BY p.created_at DESC
    LIMIT 200
  `, [currentProfile.gender, currentGotra, userId]);

  // Run the pipeline for each candidate (reads from cache when valid)
  const results = [];
  for (const candidate of candidates) {
    if (alreadyDealtIds.has(candidate.profile_id)) continue;

    const candidateAccount = { account_status: candidate.account_status };
    const candidateProfile = { ...candidate, user_id: candidate.u_user_id };

    try {
      const matchResult = await runMatchPipeline(
        currentProfile, currentUser,
        candidateProfile, candidateAccount,
      );

      if (matchResult.excluded) continue;
      if (!matchResult.eligibility?.isEligible) continue;

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
        user_grade: userGradesMap[candidate.profile_id] ?? null,
      });
    } catch (pipelineErr) {
      console.error(`[matches] Pipeline error for candidate ${candidate.u_user_id}:`, pipelineErr.message);
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

async function getCandidateProfile(userId, candidateProfileId) {
  const currentProfile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!currentProfile) {
    const err = new Error('Your profile is not found.'); err.statusCode = 404; throw err;
  }

  const candidate = await db.queryOne(`
    SELECT p.*, u.account_status, u.user_id as u_user_id
    FROM profiles p JOIN users u ON u.user_id = p.user_id
    WHERE p.profile_id = $1
  `, [candidateProfileId]);

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

  const family = await db.queryOne('SELECT * FROM family_info WHERE profile_id = $1', [candidateProfileId]);
  const photos = await db.queryRows('SELECT * FROM profile_photos WHERE profile_id = $1 AND is_approved = 1', [candidateProfileId]);
  const astro  = await db.queryOne('SELECT * FROM astro_data WHERE profile_id = $1', [candidateProfileId]);

  const interest = await db.queryOne(`
    SELECT * FROM interests WHERE sender_profile_id = $1 AND receiver_profile_id = $2
  `, [currentProfile.profile_id, candidateProfileId]);

  const sanitized = publicProfile(candidate, family);
  const kundaliInfo = await getKundaliForUser(candidate.u_user_id);

  return {
    ...sanitized,
    photos,
    astro: astro ? { birth_place: astro.birth_place, timezone: astro.timezone } : null,
    interest_status: interest ? interest.status : null,
    kundali_status: kundaliInfo.kundali_status,
  };
}

// ─── Compatibility Detail ─────────────────────────────────────────────────────

async function getCompatibilityDetail(userId, candidateProfileId) {
  const currentUser    = await db.queryOne('SELECT * FROM users WHERE user_id = $1', [userId]);
  const currentProfile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!currentProfile) {
    const err = new Error('Your profile not found.'); err.statusCode = 404; throw err;
  }

  const candidate = await db.queryOne(`
    SELECT p.*, u.account_status, u.user_id as u_user_id
    FROM profiles p JOIN users u ON u.user_id = p.user_id
    WHERE p.profile_id = $1
  `, [candidateProfileId]);

  if (!candidate) {
    const err = new Error('Candidate not found.'); err.statusCode = 404; throw err;
  }

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

  const aiExplanation = await generateExplanation(matchResult);

  return {
    ...matchResult,
    aiExplanation,
  };
}

module.exports = { getMatchFeed, getCandidateProfile, getCompatibilityDetail };
