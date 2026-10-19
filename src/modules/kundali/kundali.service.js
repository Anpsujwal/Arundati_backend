'use strict';

/**
 * Kundali Service (PostgreSQL)
 *
 * Business logic for Kundali generation, retrieval, and status management.
 * Uses kundali.provider.js for the actual calculation.
 */

const db = require('../../config/database');
const { generateKundali } = require('./kundali.provider');

const ALGORITHM_VERSION = '1.2';

// ─── Status constants ─────────────────────────────────────────────────────────

const KUNDALI_STATUS = {
  NOT_GENERATED:         'NOT_GENERATED',
  GENERATING:            'GENERATING',
  GENERATED:             'GENERATED',
  FAILED:                'FAILED',
  INCOMPLETE_BIRTH_DATA: 'INCOMPLETE_BIRTH_DATA',
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getBirthDetails(userId) {
  return db.queryOne(`
    SELECT
      p.date_of_birth,
      a.birth_time,
      a.birth_place,
      a.latitude,
      a.longitude,
      a.timezone
    FROM profiles p
    LEFT JOIN astro_data a ON a.profile_id = p.profile_id
    WHERE p.user_id = $1
  `, [userId]);
}

async function upsertKundaliStatus(userId, status, extra = {}) {
  const existing = await db.queryOne('SELECT kundali_id FROM kundalis WHERE user_id = $1', [userId]);

  if (existing) {
    const sets = ['kundali_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const vals = [status];
    let idx = 2;

    for (const col of [
      'lagna', 'rashi', 'nakshatra', 'nakshatra_pada', 'birth_data',
      'planetary_data', 'house_data', 'provider', 'provider_version',
      'calculation_config', 'failure_reason', 'generated_at',
    ]) {
      if (col in extra) {
        sets.push(`${col} = $${idx++}`);
        vals.push(extra[col] ?? null);
      }
    }

    vals.push(userId);
    await db.query(`UPDATE kundalis SET ${sets.join(', ')} WHERE user_id = $${idx}`, vals);
  } else {
    await db.query(`
      INSERT INTO kundalis (
        user_id, kundali_status,
        lagna, rashi, nakshatra, nakshatra_pada,
        birth_data, planetary_data, house_data,
        provider, provider_version, calculation_config,
        failure_reason, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      userId, status,
      extra.lagna ?? null, extra.rashi ?? null, extra.nakshatra ?? null, extra.nakshatra_pada ?? null,
      extra.birth_data ?? null, extra.planetary_data ?? null, extra.house_data ?? null,
      extra.provider ?? null, extra.provider_version ?? null, extra.calculation_config ?? null,
      extra.failure_reason ?? null, extra.generated_at ?? null,
    ]);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function getKundaliForUser(userId) {
  const row = await db.queryOne(`
    SELECT kundali_status, lagna, rashi, nakshatra, nakshatra_pada,
           planetary_data, house_data, provider, provider_version,
           calculation_config, generated_at
    FROM kundalis WHERE user_id = $1
  `, [userId]);

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

async function getChartData(userId) {
  const row = await db.queryOne(`
    SELECT kundali_status, lagna, rashi, nakshatra, nakshatra_pada,
           planetary_data, house_data, generated_at
    FROM kundalis WHERE user_id = $1
  `, [userId]);

  if (!row) return { kundali_status: KUNDALI_STATUS.NOT_GENERATED };
  if (row.kundali_status !== KUNDALI_STATUS.GENERATED) {
    return { kundali_status: row.kundali_status };
  }

  const planets = row.planetary_data ? JSON.parse(row.planetary_data) : [];
  const houses  = row.house_data     ? JSON.parse(row.house_data)     : [];

  const normalisedPlanets = planets.map((p) => ({
    name:           p.planet,
    rashi:          p.sign,
    degree:         p.degree,
    nakshatra:      p.nakshatra,
    nakshatra_pada: p.nakshatra_pada,
    house:          p.house,
  }));

  const ascendant = {
    rashi:  row.lagna,
    degree: null,
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

async function getKundaliAdmin(userId) {
  const row = await db.queryOne('SELECT * FROM kundalis WHERE user_id = $1', [userId]);
  if (!row) return { kundali_status: KUNDALI_STATUS.NOT_GENERATED };
  return {
    ...row,
    birth_data: row.birth_data ? JSON.parse(row.birth_data) : null,
    planetary_data: row.planetary_data ? JSON.parse(row.planetary_data) : null,
    house_data: row.house_data ? JSON.parse(row.house_data) : null,
    calculation_config: row.calculation_config ? JSON.parse(row.calculation_config) : null,
  };
}

async function hasBirthData(userId) {
  const details = await getBirthDetails(userId);
  if (!details) return false;
  const { date_of_birth, birth_time, birth_place, latitude, longitude, timezone } = details;
  return !!(date_of_birth && birth_time && birth_place && latitude != null && longitude != null && timezone);
}

async function triggerKundaliGeneration(userId) {
  const details = await getBirthDetails(userId);

  if (!details || !details.date_of_birth || !details.birth_time || !details.birth_place
      || details.latitude == null || details.longitude == null || !details.timezone) {
    await upsertKundaliStatus(userId, KUNDALI_STATUS.INCOMPLETE_BIRTH_DATA);
    console.warn(`[kundali] User ${userId}: incomplete birth data, cannot generate Kundali.`);
    return;
  }

  await upsertKundaliStatus(userId, KUNDALI_STATUS.GENERATING);

  setImmediate(() => {
    _runGeneration(userId, details).catch((err) => {
      console.error(`[kundali] User ${userId}: unexpected error in generation loop:`, err);
    });
  });
}

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

    await upsertKundaliStatus(userId, KUNDALI_STATUS.GENERATED, {
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

    await _invalidateMatchCache(userId);
  } catch (err) {
    const reason = `${err.code || 'UNKNOWN'}: ${err.internal || err.message}`;
    await upsertKundaliStatus(userId, KUNDALI_STATUS.FAILED, { failure_reason: reason });
    console.error(`[kundali] User ${userId}: FAILED — ${reason}`);
  }
}

async function retryKundaliGeneration(userId) {
  const user = await db.queryOne('SELECT user_id, account_status FROM users WHERE user_id = $1', [userId]);
  if (!user) {
    const err = new Error('User not found.'); err.statusCode = 404; throw err;
  }
  if (user.account_status !== 'Approved') {
    const err = new Error('User must be Approved before a Kundali can be generated.');
    err.statusCode = 400; throw err;
  }
  await triggerKundaliGeneration(userId);
  return { message: 'Kundali generation queued.', kundali_status: KUNDALI_STATUS.GENERATING };
}

async function _invalidateMatchCache(userId) {
  try {
    await db.query('DELETE FROM kundali_matches WHERE user_id = $1 OR candidate_id = $2', [userId, userId]);
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
