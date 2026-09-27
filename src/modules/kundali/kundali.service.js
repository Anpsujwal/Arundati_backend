'use strict';

/**
 * Kundali Service
 *
 * Business logic for Kundali generation, retrieval, and status management.
 * Uses kundali.provider.js for the actual calculation.
 * The rest of the application should call THIS service, not the provider directly.
 */

const { getDb } = require('../../config/database');
const { generateKundali } = require('./kundali.provider');

const ALGORITHM_VERSION = '1.2'; // 1.2: age-diff is now a hard exclusion filter (Stage 1.5)

// ─── Status constants ─────────────────────────────────────────────────────────

const KUNDALI_STATUS = {
  NOT_GENERATED:       'NOT_GENERATED',
  GENERATING:          'GENERATING',
  GENERATED:           'GENERATED',
  FAILED:              'FAILED',
  INCOMPLETE_BIRTH_DATA: 'INCOMPLETE_BIRTH_DATA',
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetch birth details for a user from astro_data + profiles.
 * Returns null if not found.
 */
function getBirthDetails(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT
      p.date_of_birth,
      a.birth_time,
      a.birth_place,
      a.latitude,
      a.longitude,
      a.timezone
    FROM profiles p
    LEFT JOIN astro_data a ON a.profile_id = p.profile_id
    WHERE p.user_id = ?
  `).get(userId);
}

/**
 * Upsert the kundalis row for a user (insert or replace).
 */
function upsertKundaliStatus(userId, status, extra = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT kundali_id FROM kundalis WHERE user_id = ?').get(userId);

  if (existing) {
    const sets = ['kundali_status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const vals = [status];
    if ('lagna' in extra)           { sets.push('lagna = ?');             vals.push(extra.lagna ?? null); }
    if ('rashi' in extra)           { sets.push('rashi = ?');             vals.push(extra.rashi ?? null); }
    if ('nakshatra' in extra)       { sets.push('nakshatra = ?');         vals.push(extra.nakshatra ?? null); }
    if ('nakshatra_pada' in extra)  { sets.push('nakshatra_pada = ?');    vals.push(extra.nakshatra_pada ?? null); }
    if ('birth_data' in extra)      { sets.push('birth_data = ?');        vals.push(extra.birth_data ?? null); }
    if ('planetary_data' in extra)  { sets.push('planetary_data = ?');    vals.push(extra.planetary_data ?? null); }
    if ('house_data' in extra)      { sets.push('house_data = ?');        vals.push(extra.house_data ?? null); }
    if ('provider' in extra)        { sets.push('provider = ?');          vals.push(extra.provider ?? null); }
    if ('provider_version' in extra){ sets.push('provider_version = ?');  vals.push(extra.provider_version ?? null); }
    if ('calculation_config' in extra){ sets.push('calculation_config = ?'); vals.push(extra.calculation_config ?? null); }
    if ('failure_reason' in extra)  { sets.push('failure_reason = ?');    vals.push(extra.failure_reason ?? null); }
    if ('generated_at' in extra)    { sets.push('generated_at = ?');      vals.push(extra.generated_at ?? null); }

    vals.push(userId);
    db.prepare(`UPDATE kundalis SET ${sets.join(', ')} WHERE user_id = ?`).run(...vals);
  } else {
    db.prepare(`
      INSERT INTO kundalis (user_id, kundali_status,
        lagna, rashi, nakshatra, nakshatra_pada,
        birth_data, planetary_data, house_data,
        provider, provider_version, calculation_config,
        failure_reason, generated_at)
      VALUES (?, ?,  ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?,  ?, ?)
    `).run(
      userId, status,
      extra.lagna ?? null, extra.rashi ?? null, extra.nakshatra ?? null, extra.nakshatra_pada ?? null,
      extra.birth_data ?? null, extra.planetary_data ?? null, extra.house_data ?? null,
      extra.provider ?? null, extra.provider_version ?? null, extra.calculation_config ?? null,
      extra.failure_reason ?? null, extra.generated_at ?? null,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get Kundali for a user (the public-facing fields only — no failure_reason).
 */
function getKundaliForUser(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT kundali_status, lagna, rashi, nakshatra, nakshatra_pada,
           planetary_data, house_data, provider, provider_version,
           calculation_config, generated_at
    FROM kundalis WHERE user_id = ?
  `).get(userId);
  if (!row) return { kundali_status: KUNDALI_STATUS.NOT_GENERATED };

  return {
    kundali_status: row.kundali_status,
    lagna: row.lagna,
    rashi: row.rashi,
    nakshatra: row.nakshatra,
    nakshatra_pada: row.nakshatra_pada,
    planetary_data: row.planetary_data ? JSON.parse(row.planetary_data) : null,
    house_data: row.house_data ? JSON.parse(row.house_data) : null,
    provider: row.provider,
    provider_version: row.provider_version,
    generated_at: row.generated_at,
  };
}

/**
 * Get normalized chart data for the frontend South Indian chart renderer.
 *
 * Returns a structure the SouthIndianChart component can consume directly:
 * {
 *   chart_type: 'rasi',
 *   kundali_status,
 *   ascendant: { rashi, degree },
 *   planets: [{ name, rashi, degree, nakshatra, nakshatra_pada, house }],
 *   houses:  [{ house, sign, lord }],
 *   meta: { lagna, rashi, nakshatra, nakshatra_pada, generated_at }
 * }
 */
function getChartData(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT kundali_status, lagna, rashi, nakshatra, nakshatra_pada,
           planetary_data, house_data, generated_at
    FROM kundalis WHERE user_id = ?
  `).get(userId);

  if (!row) return { kundali_status: KUNDALI_STATUS.NOT_GENERATED };
  if (row.kundali_status !== KUNDALI_STATUS.GENERATED) {
    return { kundali_status: row.kundali_status };
  }

  const planets = row.planetary_data ? JSON.parse(row.planetary_data) : [];
  const houses  = row.house_data     ? JSON.parse(row.house_data)     : [];

  // Normalise planet fields: the stored model uses `sign` for rashi name
  const normalisedPlanets = planets.map((p) => ({
    name:           p.planet,
    rashi:          p.sign,
    degree:         p.degree,
    nakshatra:      p.nakshatra,
    nakshatra_pada: p.nakshatra_pada,
    house:          p.house,
  }));

  // Lagna degree: find degree of ascendant from first house sign
  const lagnaSignIndex = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'].indexOf(row.lagna);
  // We don't store lagna degree separately; report the sign only
  const ascendant = {
    rashi:  row.lagna,
    degree: null, // degree within sign — not stored separately
  };

  return {
    chart_type:     'rasi',
    kundali_status: row.kundali_status,
    ascendant,
    planets:        normalisedPlanets,
    houses,
    meta: {
      lagna:          row.lagna,
      rashi:          row.rashi,
      nakshatra:      row.nakshatra,
      nakshatra_pada: row.nakshatra_pada,
      generated_at:   row.generated_at,
    },
  };
}

/**
 * Get full internal Kundali row (admin only — includes failure_reason).
 */
function getKundaliAdmin(userId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM kundalis WHERE user_id = ?').get(userId);
  if (!row) return { kundali_status: KUNDALI_STATUS.NOT_GENERATED };
  return {
    ...row,
    birth_data: row.birth_data ? JSON.parse(row.birth_data) : null,
    planetary_data: row.planetary_data ? JSON.parse(row.planetary_data) : null,
    house_data: row.house_data ? JSON.parse(row.house_data) : null,
    calculation_config: row.calculation_config ? JSON.parse(row.calculation_config) : null,
  };
}

/**
 * Check if a user has complete birth data. Used to gate admin approval.
 */
function hasBirthData(userId) {
  const details = getBirthDetails(userId);
  if (!details) return false;
  const { date_of_birth, birth_time, birth_place, latitude, longitude, timezone } = details;
  return !!(date_of_birth && birth_time && birth_place && latitude != null && longitude != null && timezone);
}

/**
 * Trigger Kundali generation for a user.
 * Sets status to GENERATING immediately (synchronous DB write),
 * then runs the actual calculation asynchronously.
 *
 * Designed to be called AFTER admin approval.
 * The HTTP response to the admin is NOT blocked by this.
 */
function triggerKundaliGeneration(userId) {
  const details = getBirthDetails(userId);

  // Pre-flight check — should already be validated by admin service
  if (!details || !details.date_of_birth || !details.birth_time || !details.birth_place
      || details.latitude == null || details.longitude == null || !details.timezone) {
    upsertKundaliStatus(userId, KUNDALI_STATUS.INCOMPLETE_BIRTH_DATA);
    console.warn(`[kundali] User ${userId}: incomplete birth data, cannot generate Kundali.`);
    return;
  }

  // Set GENERATING synchronously so callers can observe status
  upsertKundaliStatus(userId, KUNDALI_STATUS.GENERATING);

  // Run async without blocking the caller
  setImmediate(() => {
    _runGeneration(userId, details).catch((err) => {
      console.error(`[kundali] User ${userId}: unexpected error in generation loop:`, err);
    });
  });
}

/**
 * Internal: actually call the provider and persist the result.
 */
async function _runGeneration(userId, details) {
  console.log(`[kundali] Starting generation for user ${userId}`);
  try {
    const birthDetails = {
      date_of_birth: details.date_of_birth,
      birth_time:    details.birth_time,
      birth_place:   details.birth_place,
      latitude:      details.latitude,
      longitude:     details.longitude,
      timezone:      details.timezone,
    };

    const kundali = await generateKundali(birthDetails);

    upsertKundaliStatus(userId, KUNDALI_STATUS.GENERATED, {
      lagna:              kundali.chart.lagna,
      rashi:              kundali.chart.rashi,
      nakshatra:          kundali.chart.nakshatra,
      nakshatra_pada:     kundali.chart.nakshatra_pada,
      birth_data:         JSON.stringify(kundali.birth),
      planetary_data:     JSON.stringify(kundali.planets),
      house_data:         JSON.stringify(kundali.houses),
      provider:           kundali.meta.provider,
      provider_version:   kundali.meta.provider_version,
      calculation_config: JSON.stringify({
        ayanamsa:     kundali.meta.ayanamsa,
        house_system: kundali.meta.house_system,
      }),
      failure_reason:     null,
      generated_at:       kundali.meta.generated_at,
    });

    console.log(`[kundali] User ${userId}: GENERATED (Lagna=${kundali.chart.lagna}, Rashi=${kundali.chart.rashi})`);

    // Invalidate any stale match cache entries for this user
    _invalidateMatchCache(userId);
  } catch (err) {
    const reason = `${err.code || 'UNKNOWN'}: ${err.internal || err.message}`;
    upsertKundaliStatus(userId, KUNDALI_STATUS.FAILED, { failure_reason: reason });
    console.error(`[kundali] User ${userId}: FAILED — ${reason}`);
  }
}

/**
 * Admin retry: re-trigger generation for a FAILED or INCOMPLETE Kundali.
 */
function retryKundaliGeneration(userId) {
  const db = getDb();
  const user = db.prepare('SELECT user_id, account_status FROM users WHERE user_id = ?').get(userId);
  if (!user) {
    const err = new Error('User not found.'); err.statusCode = 404; throw err;
  }
  if (user.account_status !== 'Approved') {
    const err = new Error('User must be Approved before a Kundali can be generated.');
    err.statusCode = 400; throw err;
  }
  triggerKundaliGeneration(userId);
  return { message: 'Kundali generation queued.', kundali_status: KUNDALI_STATUS.GENERATING };
}

/**
 * Delete stale match cache rows when a Kundali is regenerated.
 */
function _invalidateMatchCache(userId) {
  try {
    const db = getDb();
    db.prepare('DELETE FROM kundali_matches WHERE user_id = ? OR candidate_id = ?').run(userId, userId);
    console.log(`[kundali] Match cache invalidated for user ${userId}`);
  } catch (e) {
    console.error(`[kundali] Failed to invalidate match cache for user ${userId}:`, e.message);
  }
}

module.exports = {
  KUNDALI_STATUS,
  ALGORITHM_VERSION,
  getKundaliForUser,
  getChartData,
  getKundaliAdmin,
  hasBirthData,
  triggerKundaliGeneration,
  retryKundaliGeneration,
};
