'use strict';

/**
 * Preference Scoring Service
 *
 * Scores a candidate against the current user's stated partner preferences.
 * Produces a 0–1 score per dimension for use in match ranking.
 *
 * DESIGN: Preferences are used for RANKING, not EXCLUSION.
 * A candidate who doesn't match preferences can still appear;
 * they simply rank lower.
 *
 * Configurable weights — change here to rebalance the preference component:
 */

const WEIGHTS = {
  age:      0.40,  // 40% of preference score
  location: 0.30,  // 30%
  subSect:  0.30,  // 30%
};

// Total preference score contributes this fraction to overall_score:
const PREFERENCE_WEIGHT_IN_OVERALL = 0.20; // 20% of total overall_score

/**
 * Calculate age difference score.
 * Returns 1.0 if candidate age is within the preferred range,
 * degrades linearly outside it.
 */
function scoreAge(userProfile, candidateProfile) {
  const { pref_age_diff_min, pref_age_diff_max, date_of_birth: userDob } = userProfile;
  const { date_of_birth: candidateDob } = candidateProfile;

  if (!userDob || !candidateDob) return { score: 0.5, detail: 'DOB unavailable' };

  const userAge = Math.floor((Date.now() - new Date(userDob)) / (365.25 * 24 * 3600 * 1000));
  const candidateAge = Math.floor((Date.now() - new Date(candidateDob)) / (365.25 * 24 * 3600 * 1000));
  const ageDiff    = candidateAge - userAge;       // signed: positive = candidate is older
  const absAgeDiff = Math.abs(ageDiff);             // absolute gap (matches UI which collects 0–20)

  if (pref_age_diff_min == null && pref_age_diff_max == null) {
    return { score: 0.8, detail: 'No age preference set', userAge, candidateAge };
  }

  const min = pref_age_diff_min ?? 0;
  const max = pref_age_diff_max ?? 20;

  if (absAgeDiff >= min && absAgeDiff <= max) {
    return { score: 1.0, detail: `Age gap ${absAgeDiff}yr within preferred range [${min}, ${max}]`, userAge, candidateAge, ageDiff };
  }

  // Degrade score for each year outside range
  const yearsOutside = absAgeDiff < min ? min - absAgeDiff : absAgeDiff - max;
  const score = Math.max(0, 1.0 - yearsOutside * 0.15);
  return { score: parseFloat(score.toFixed(3)), detail: `Age gap ${absAgeDiff}yr outside preferred [${min}, ${max}]`, userAge, candidateAge, ageDiff };
}

/**
 * Location preference score.
 * 1.0 if city matches, 0.6 if pref_location matches city loosely, 0.3 otherwise.
 */
function scoreLocation(userProfile, candidateProfile) {
  const pref = (userProfile.pref_location || '').toLowerCase().trim();
  const city = (candidateProfile.city || '').toLowerCase().trim();

  if (!pref) return { score: 0.7, detail: 'No location preference set' };
  if (!city) return { score: 0.5, detail: 'Candidate city unknown' };

  if (city === pref || city.includes(pref) || pref.includes(city)) {
    return { score: 1.0, detail: `City match: ${candidateProfile.city}` };
  }
  return { score: 0.2, detail: `Preferred: ${userProfile.pref_location}, Candidate: ${candidateProfile.city}` };
}

/**
 * Sub-sect preference score.
 * 1.0 if matches exactly, 0.5 otherwise.
 */
function scoreSubSect(userProfile, candidateProfile) {
  const pref = (userProfile.pref_sub_sect || '').toLowerCase().trim();
  const actual = (candidateProfile.sub_sect || '').toLowerCase().trim();

  if (!pref) return { score: 0.7, detail: 'No sub-sect preference' };
  if (!actual) return { score: 0.5, detail: 'Candidate sub-sect unknown' };

  const match = pref === actual;
  return {
    score: match ? 1.0 : 0.3,
    detail: match ? `Sub-sect match: ${candidateProfile.sub_sect}` : `Preferred: ${userProfile.pref_sub_sect}, Candidate: ${candidateProfile.sub_sect}`,
  };
}

/**
 * Main: score all preferences and return weighted composite.
 *
 * @param {object} userProfile — current user's profiles row
 * @param {object} candidateProfile — candidate's profiles row
 * @returns {object} PreferenceScore
 */
function scorePreferences(userProfile, candidateProfile) {
  const age     = scoreAge(userProfile, candidateProfile);
  const location = scoreLocation(userProfile, candidateProfile);
  const subSect  = scoreSubSect(userProfile, candidateProfile);

  const composite =
    WEIGHTS.age * age.score +
    WEIGHTS.location * location.score +
    WEIGHTS.subSect * subSect.score;

  return {
    age,
    location,
    subSect,
    composite: parseFloat(composite.toFixed(4)),
    weights: WEIGHTS,
  };
}

module.exports = { scorePreferences, PREFERENCE_WEIGHT_IN_OVERALL };
