'use strict';

/**
 * Match Pipeline Service
 *
 * Orchestrates the complete matchmaking process for a single user pair:
 *
 *   Stage 1 — Basic eligibility
 *   Stage 1.5 — Age difference hard filter (when user sets pref_age_diff)
 *   Stage 2 — Gotra hard filter
 *   Stage 3 — Kundali availability
 *   Stage 4 — Kundali compatibility (calculateCompatibility)
 *   Stage 5 — Ashta Koota / Guna Milan
 *   Stage 6 — Profile preference matching
 *   Stage 7 — Composite score calculation
 *   Stage 8 — Persist to cache (kundali_matches)
 *
 * SECURITY: All eligibility checks are server-side.
 *            No client value is trusted for gotra, score, or eligibility.
 *
 * PERFORMANCE: Results are cached in kundali_matches.
 *               The pipeline only runs when cache is stale or missing.
 *
 * AGE PREFERENCE: When pref_age_diff_min / pref_age_diff_max are set by the
 *   user, candidates outside that absolute age gap are EXCLUDED (hard filter),
 *   not merely ranked lower.  This mirrors the Matrimony expectation that the
 *   stated age range is a strict requirement.
 *   Only one side enforces the age filter (the seeker's preferences);
 *   the candidate's own preferences are not applied here.
 */

const { getDb } = require('../../config/database');
const { calculateCompatibility } = require('../kundali/kundali.compatibility.service');
const { calculateGunaMilan, GUNA_THRESHOLD } = require('../kundali/gunaMilan.service');
const { scorePreferences, PREFERENCE_WEIGHT_IN_OVERALL } = require('./preferenceScoring.service');
const { ALGORITHM_VERSION } = require('../kundali/kundali.service');

// Weights for overall_score (must sum to 1.0)
const SCORE_WEIGHTS = {
  gunaMilan:   0.60,  // 60% — primary compatibility signal
  kundali:     0.20,  // 20% — Rashi/Nakshatra harmony
  preference:  0.20,  // 20% — profile preferences
};

// ─── Age gap helper ───────────────────────────────────────────────────────────

/**
 * Returns the absolute age difference in whole years between two DOB strings,
 * or null if either DOB is missing.
 */
function calcAbsAgeDiff(dob1, dob2) {
  if (!dob1 || !dob2) return null;
  const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;
  const age1 = (Date.now() - new Date(dob1)) / MS_PER_YEAR;
  const age2 = (Date.now() - new Date(dob2)) / MS_PER_YEAR;
  return Math.abs(age1 - age2);
}

/**
 * Returns true when the candidate's age gap is within the user's stated
 * preference range.  Returns true (pass) when no preference is set or when
 * DOBs are unavailable (so we don't silently drop candidates with missing data).
 */
function passesAgeDiffFilter(userProfile, candidateProfile) {
  const { pref_age_diff_min, pref_age_diff_max } = userProfile;
  const prefSet = pref_age_diff_min != null || pref_age_diff_max != null;
  if (!prefSet) return { pass: true, reason: 'No age preference set' };

  const absGap = calcAbsAgeDiff(userProfile.date_of_birth, candidateProfile.date_of_birth);
  if (absGap === null) return { pass: true, reason: 'DOB unavailable — skipping age filter' };

  const min = pref_age_diff_min ?? 0;
  const max = pref_age_diff_max ?? Infinity;
  const gap = Math.floor(absGap);          // whole years

  if (gap >= min && gap <= max) {
    return { pass: true, reason: `Age gap ${gap}yr within [${min}, ${max}]` };
  }
  return { pass: false, reason: `Age gap ${gap}yr outside preferred [${min}, ${max}]` };
}

// ─── Gotra normalization ──────────────────────────────────────────────────────

function normalizeGotra(gotra) {
  if (!gotra) return '';
  return gotra.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ─── Kundali loader ───────────────────────────────────────────────────────────

function loadKundali(userId) {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM kundalis WHERE user_id = ? AND kundali_status = 'GENERATED'"
  ).get(userId);
  if (!row) return null;

  return {
    chart: {
      lagna:           row.lagna,
      rashi:           row.rashi,
      nakshatra:       row.nakshatra,
      nakshatra_pada:  row.nakshatra_pada,
    },
    planets: row.planetary_data ? JSON.parse(row.planetary_data) : [],
    houses:  row.house_data     ? JSON.parse(row.house_data) : [],
    meta: {
      provider:         row.provider,
      provider_version: row.provider_version,
    },
  };
}

// ─── Cache read/write ─────────────────────────────────────────────────────────

function readCache(userId, candidateId) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM kundali_matches WHERE user_id = ? AND candidate_id = ?'
  ).get(userId, candidateId);
}

function writeCache(userId, candidateId, result) {
  const db = getDb();
  const existing = readCache(userId, candidateId);
  const guna = result.gunaMilan;
  const data = {
    kundali_compatibility: result.kundali?.compatibility ? JSON.stringify(result.kundali.compatibility) : null,
    guna_milan:   guna ? JSON.stringify(guna) : null,
    guna_total:   guna?.total ?? null,
    profile_score: result.preferences?.composite ?? null,
    overall_score: result.overall?.score ?? null,
    is_eligible:   result.eligibility?.isEligible ? 1 : 0,
    algorithm_version: ALGORITHM_VERSION,
    provider_version: result.providerVersion || null,
  };

  if (existing) {
    db.prepare(`
      UPDATE kundali_matches SET
        kundali_compatibility = ?, guna_milan = ?, guna_total = ?,
        profile_score = ?, overall_score = ?, is_eligible = ?,
        algorithm_version = ?, provider_version = ?,
        calculated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND candidate_id = ?
    `).run(
      data.kundali_compatibility, data.guna_milan, data.guna_total,
      data.profile_score, data.overall_score, data.is_eligible,
      data.algorithm_version, data.provider_version,
      userId, candidateId,
    );
  } else {
    db.prepare(`
      INSERT INTO kundali_matches
        (user_id, candidate_id, kundali_compatibility, guna_milan, guna_total,
         profile_score, overall_score, is_eligible, algorithm_version, provider_version)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      userId, candidateId,
      data.kundali_compatibility, data.guna_milan, data.guna_total,
      data.profile_score, data.overall_score, data.is_eligible,
      data.algorithm_version, data.provider_version,
    );
  }
}

// ─── Harmony level → numeric score ───────────────────────────────────────────

const HARMONY_SCORE = { high: 1.0, moderate: 0.65, neutral: 0.5, challenging: 0.2 };

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Run the complete matchmaking pipeline for one user-candidate pair.
 * Reads from cache when available and valid.
 *
 * @param {object} userProfile     — profiles row for the current user
 * @param {object} userAccountRow  — users row for the current user
 * @param {object} candidateProfile — profiles row for the candidate
 * @param {object} candidateAccount — users row for the candidate
 * @param {boolean} forceRecalc    — skip cache (e.g. after Kundali retry)
 * @returns {object} MatchResult
 */
async function runMatchPipeline(
  userProfile, userAccountRow,
  candidateProfile, candidateAccount,
  { forceRecalc = false } = {},
) {
  const userId = userProfile.user_id;
  const candidateId = candidateProfile.user_id;

  // ── Stage 1: Basic Eligibility ─────────────────────────────────────────────
  const approved      = candidateAccount.account_status === 'Approved';
  const oppositeGender = userProfile.gender !== candidateProfile.gender;
  const notSelf       = userId !== candidateId;

  if (!approved || !oppositeGender || !notSelf) {
    return {
      candidateId,
      eligibility: { approved, oppositeGender, notSelf, gotraEligible: false, isEligible: false },
      excluded: true,
      excludeReason: !approved ? 'NOT_APPROVED' : !oppositeGender ? 'SAME_GENDER' : 'SELF',
    };
  }

  // ── Stage 1.5: Age Difference Hard Filter ────────────────────────────────
  // Only applied when the user has explicitly set an age preference.
  const ageFilter = passesAgeDiffFilter(userProfile, candidateProfile);
  if (!ageFilter.pass) {
    return {
      candidateId,
      eligibility: { approved, oppositeGender, notSelf, gotraEligible: null, isEligible: false },
      excluded: true,
      excludeReason: 'AGE_PREFERENCE',
      excludeDetail: ageFilter.reason,
    };
  }

  // ── Stage 2: Gotra Hard Filter ─────────────────────────────────────────────
  const userGotra      = normalizeGotra(userProfile.gotra);
  const candidateGotra = normalizeGotra(candidateProfile.gotra);
  const gotraEligible  = !!(userGotra && candidateGotra && userGotra !== candidateGotra);

  if (!gotraEligible) {
    return {
      candidateId,
      eligibility: { approved, oppositeGender, notSelf, gotraEligible, isEligible: false },
      excluded: true,
      excludeReason: 'SAME_GOTRA',
    };
  }

  // ── Check cache ────────────────────────────────────────────────────────────
  if (!forceRecalc) {
    const cached = readCache(userId, candidateId);
    if (cached && cached.algorithm_version === ALGORITHM_VERSION) {
      return {
        candidateId,
        fromCache: true,
        eligibility: { approved, oppositeGender, notSelf, gotraEligible, isEligible: !!cached.is_eligible },
        kundali:     { available: !!cached.kundali_compatibility, compatibility: cached.kundali_compatibility ? JSON.parse(cached.kundali_compatibility) : null },
        gunaMilan:   cached.guna_milan ? JSON.parse(cached.guna_milan) : null,
        preferences: { composite: cached.profile_score },
        overall:     { score: cached.overall_score },
        providerVersion: cached.provider_version,
      };
    }
  }

  // ── Stage 3: Kundali Availability ─────────────────────────────────────────
  const userKundali      = loadKundali(userId);
  const candidateKundali = loadKundali(candidateId);
  const kundaliAvailable = !!(userKundali && candidateKundali);

  if (!kundaliAvailable) {
    const result = {
      candidateId,
      eligibility: { approved, oppositeGender, notSelf, gotraEligible, isEligible: false },
      kundali: {
        available: false,
        userStatus:      userKundali ? 'GENERATED' : 'NOT_READY',
        candidateStatus: candidateKundali ? 'GENERATED' : 'NOT_READY',
      },
      gunaMilan: null,
      preferences: null,
      overall: { score: 0 },
    };
    writeCache(userId, candidateId, result);
    return result;
  }

  // ── Stage 4: Kundali Compatibility ────────────────────────────────────────
  const compatibility = calculateCompatibility(userKundali, candidateKundali);

  // ── Stage 5: Guna Milan ───────────────────────────────────────────────────
  const gunaMilan = calculateGunaMilan(
    userKundali, userProfile.gender,
    candidateKundali, candidateProfile.gender,
  );

  // ── Stage 6: Preference Scoring ──────────────────────────────────────────
  const preferences = scorePreferences(userProfile, candidateProfile);

  // ── Stage 7: Overall Score ────────────────────────────────────────────────
  const gunaScore      = gunaMilan.total / 36;                              // normalised 0–1
  const kundaliScore   = HARMONY_SCORE[compatibility.harmonyLevel] || 0.5; // 0–1
  const prefScore      = preferences.composite;                             // 0–1

  const overallScore = (
    SCORE_WEIGHTS.gunaMilan  * gunaScore +
    SCORE_WEIGHTS.kundali    * kundaliScore +
    SCORE_WEIGHTS.preference * prefScore
  ) * 100; // Express as 0–100

  const isEligible = gunaMilan.isEligible; // Must be >= GUNA_THRESHOLD (18/36)

  const result = {
    candidateId,
    fromCache: false,
    eligibility: { approved, oppositeGender, notSelf, gotraEligible, isEligible },
    kundali: { available: true, compatibility },
    gunaMilan,
    preferences,
    overall: { score: parseFloat(overallScore.toFixed(2)) },
    providerVersion: userKundali.meta?.provider_version,
    algorithmVersion: ALGORITHM_VERSION,
  };

  // ── Stage 8: Cache ────────────────────────────────────────────────────────
  writeCache(userId, candidateId, result);

  return result;
}

module.exports = { runMatchPipeline, normalizeGotra };
