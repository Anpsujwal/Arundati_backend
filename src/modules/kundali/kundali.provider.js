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
 * Format date of birth to strict YYYY-MM-DD string required by the astrology service.
 */
function formatDob(dob) {
  if (!dob) return '';
  if (typeof dob === 'string') {
    const match = dob.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (dob instanceof Date) {
    const y = dob.getFullYear();
    const m = String(dob.getMonth() + 1).padStart(2, '0');
    const d = String(dob.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(dob).trim();
}

/**
 * Format birth time to strict HH:MM string required by the astrology service.
 */
function formatBirthTime(timeStr) {
  if (!timeStr) return '';
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const m = match[2];
    return `${h}:${m}`;
  }
  return String(timeStr).trim();
}

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
 * @param {string|Date} birthDetails.date_of_birth  — 'YYYY-MM-DD'
 * @param {string}      birthDetails.birth_time     — 'HH:MM' (24-hour)
 * @param {string}      birthDetails.birth_place    — human-readable place name
 * @param {number}      birthDetails.latitude
 * @param {number}      birthDetails.longitude
 * @param {string}      birthDetails.timezone       — IANA timezone string
 * @returns {Promise<object>} StandardKundali
 */
async function generateKundali(birthDetails) {
  validateBirthDetails(birthDetails);

  const cleanDob = formatDob(birthDetails.date_of_birth);
  const cleanTime = formatBirthTime(birthDetails.birth_time);

  const serviceUrl = (env.ASTRO_SERVICE_URL || 'https://arundati-kundali-backend-n8q1.onrender.com').replace(/\/+$/, '');
  const endpoint = `${serviceUrl}/kundali/generate`;

  const payload = {
    date_of_birth: cleanDob,
    birth_time:    cleanTime,
    birth_place:   birthDetails.birth_place,
    latitude:      Number(birthDetails.latitude),
    longitude:     Number(birthDetails.longitude),
    timezone:      birthDetails.timezone,
  };

  let res;
  let lastFetchErr;

  // Up to 2 attempts with 60s timeout each to accommodate Render free-tier cold starts
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60_000), // 60s timeout
      });
      break;
    } catch (fetchErr) {
      lastFetchErr = fetchErr;
      if (attempt === 1) {
        // Render cold start retry after 3 seconds
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  if (!res) {
    const err = new Error('Astrology service is unavailable. Please try again later.');
    err.code = 'PROVIDER_UNAVAILABLE';
    err.statusCode = 503;
    err.internal = lastFetchErr?.message || 'Connection failed';
    throw err;
  }

  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = {}; }

    const detailMsg = typeof body.detail === 'object'
      ? JSON.stringify(body.detail)
      : (body.detail || body.error || `HTTP ${res.status}`);

    if (res.status === 422) {
      const err = new Error('Invalid birth data provided to astrology engine.');
      err.code = 'INVALID_BIRTH_DATA';
      err.statusCode = 422;
      err.internal = detailMsg;
      throw err;
    }

    const err = new Error('Kundali calculation failed.');
    err.code = 'CALCULATION_FAILED';
    err.statusCode = 500;
    err.internal = detailMsg;
    throw err;
  }

  const kundali = await res.json();
  return kundali;
}

module.exports = { generateKundali };
