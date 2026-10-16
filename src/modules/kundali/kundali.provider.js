'use strict';

/**
 * Kundali Provider — Abstraction Layer
 *
 * This is the ONLY place in the Node.js codebase that knows where the
 * astrology calculations come from.
 *
 * Current implementation: HTTP call to the Python/FastAPI astrology service.
 *
 * To swap providers (different library, commercial API, etc.):
 *   1. Change ONLY this file.
 *   2. The rest of the application continues to work with StandardKundali objects.
 *
 * Contract:
 *   generateKundali(birthDetails) → StandardKundali
 *
 * StandardKundali shape:
 *   { birth, chart: { lagna, rashi, nakshatra, nakshatra_pada },
 *     planets: [...], houses: [...], meta: { provider, provider_version, ... } }
 *
 * Error codes surfaced:
 *   PROVIDER_UNAVAILABLE    — astrology service unreachable / timed out
 *   INVALID_BIRTH_DATA      — service rejected birth data as invalid (422)
 *   CALCULATION_FAILED      — service returned 500
 *   INCOMPLETE_BIRTH_DATA   — birthDetails missing required fields (validated here)
 */

const http = require('http');
const env = require('../../config/env');

// Required birth detail fields
const REQUIRED_FIELDS = ['date_of_birth', 'birth_time', 'birth_place', 'latitude', 'longitude', 'timezone'];

/**
 * Validate birth details completeness before calling the provider.
 * Throws with code INCOMPLETE_BIRTH_DATA if any required field is missing.
 */
function validateBirthDetails(birthDetails) {
  const missing = REQUIRED_FIELDS.filter(
    (f) => birthDetails[f] === null || birthDetails[f] === undefined || birthDetails[f] === ''
  );
  if (missing.length > 0) {
    const err = new Error(`Missing birth data fields: ${missing.join(', ')}`);
    err.code = 'INCOMPLETE_BIRTH_DATA';
    err.statusCode = 422;
    throw err;
  }
}

/**
 * Call the Python astrology service and return a StandardKundali.
 *
 * @param {object} birthDetails
 * @param {string} birthDetails.date_of_birth  — ISO date 'YYYY-MM-DD'
 * @param {string} birthDetails.birth_time     — 'HH:MM' (24-hour)
 * @param {string} birthDetails.birth_place    — human-readable place name
 * @param {number} birthDetails.latitude
 * @param {number} birthDetails.longitude
 * @param {string} birthDetails.timezone       — IANA timezone string
 * @returns {Promise<object>} StandardKundali
 */
async function generateKundali(birthDetails) {
  validateBirthDetails(birthDetails);

  const serviceUrl = (env.ASTRO_SERVICE_URL || 'https://arundati-kundali-backend-n8q1.onrender.com').replace(/\/+$/, '');
  const endpoint = `${serviceUrl}/kundali/generate`;

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date_of_birth: birthDetails.date_of_birth,
        birth_time:    birthDetails.birth_time,
        birth_place:   birthDetails.birth_place,
        latitude:      Number(birthDetails.latitude),
        longitude:     Number(birthDetails.longitude),
        timezone:      birthDetails.timezone,
      }),
      signal: AbortSignal.timeout(30_000), // 30 s timeout
    });
  } catch (fetchErr) {
    const err = new Error('Astrology service is unavailable. Please try again later.');
    err.code = 'PROVIDER_UNAVAILABLE';
    err.statusCode = 503;
    err.internal = fetchErr.message;
    throw err;
  }

  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = {}; }

    if (res.status === 422) {
      const err = new Error('Invalid birth data provided to astrology engine.');
      err.code = 'INVALID_BIRTH_DATA';
      err.statusCode = 422;
      err.internal = body.detail || body.error;
      throw err;
    }

    const err = new Error('Kundali calculation failed.');
    err.code = 'CALCULATION_FAILED';
    err.statusCode = 500;
    err.internal = body.detail || body.error;
    throw err;
  }

  const kundali = await res.json();
  return kundali;
}

module.exports = { generateKundali };
