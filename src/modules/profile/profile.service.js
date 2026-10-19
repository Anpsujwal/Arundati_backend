'use strict';

const db = require('../../config/database');
const { safeUser } = require('../../utils/sanitize.utils');
const env = require('../../config/env');

/**
 * Geocode a place name via the Python astrology service.
 * Returns { latitude, longitude } or null if not resolved.
 * Best-effort — never throws.
 */
async function geocodeBirthPlace(placeName) {
  if (!placeName) return null;
  try {
    const baseUrl = (env.ASTRO_SERVICE_URL || 'https://arundati-kundali-backend-n8q1.onrender.com').replace(/\/+$/, '');
    const url = `${baseUrl}/geocode?place=${encodeURIComponent(placeName)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.found && data.latitude != null && data.longitude != null) {
      return { latitude: data.latitude, longitude: data.longitude };
    }
  } catch (e) {
    console.warn('[profile] Geocoding failed for place:', placeName, e.message);
  }
  return null;
}

// Helper: get or assert profile exists for user
async function getProfileByUserId(userId) {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!profile) {
    const err = new Error('Profile not found.');
    err.statusCode = 404;
    throw err;
  }
  return profile;
}

// ─── Step 1: Basic Information ───────────────────────────────────────────────
async function saveStep1(userId, data) {
  const { first_name, surname, gender, date_of_birth } = data;

  // Normalise marital_status aliases → canonical DB values
  const MARITAL_MAP = { 'Unmarried': 'Never Married', 'Single': 'Never Married' };
  const marital_status = MARITAL_MAP[data.marital_status] ?? data.marital_status;

  // Normalise profile_managed_by aliases → canonical DB values
  const MANAGED_BY_MAP = { 'Relative': 'Joint' };
  const managed_by = data.profile_managed_by
    ? (MANAGED_BY_MAP[data.profile_managed_by] ?? data.profile_managed_by)
    : null;

  await db.query(`
    UPDATE profiles SET
      first_name = $1, surname = $2, gender = $3, date_of_birth = $4,
      marital_status = $5, registration_step = GREATEST(registration_step, 1),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $6
  `, [first_name, surname, gender, date_of_birth, marital_status, userId]);

  // Update profile_managed_by on users table
  if (managed_by) {
    await db.query('UPDATE users SET profile_managed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [
      managed_by,
      userId,
    ]);
  }

  return getProfileByUserId(userId);
}

// ─── Step 2: Lineage ──────────────────────────────────────────────────────────
async function saveStep2(userId, data) {
  const { sub_sect, gotra, pravara, maternal_gotra, maternal_inti_peru, veda, shakha, native_place } = data;
  const pravaraNorm = pravara && pravara.trim() ? pravara.trim() : null;

  await db.query(`
    UPDATE profiles SET
      sub_sect = $1, gotra = $2, pravara = $3, maternal_gotra = $4, maternal_inti_peru = $5,
      veda = $6, shakha = $7, native_place = $8,
      registration_step = GREATEST(registration_step, 2),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $9
  `, [sub_sect, gotra, pravaraNorm, maternal_gotra, maternal_inti_peru, veda, shakha, native_place, userId]);

  return getProfileByUserId(userId);
}

// ─── Step 3: Birth Information ───────────────────────────────────────────────
async function saveStep3(userId, data) {
  let { birth_time, birth_place, latitude, longitude, timezone } = data;

  // Auto-geocode if place is provided but coordinates are missing
  if (birth_place && (latitude == null || longitude == null || latitude === '' || longitude === '')) {
    const coords = await geocodeBirthPlace(birth_place);
    if (coords) {
      latitude = coords.latitude;
      longitude = coords.longitude;
      console.log(`[profile] Auto-geocoded '${birth_place}' → (${latitude}, ${longitude})`);
    }
  }

  const profile = await getProfileByUserId(userId);

  // Upsert astro_data with PostgreSQL ON CONFLICT
  await db.query(`
    INSERT INTO astro_data (profile_id, birth_time, birth_place, latitude, longitude, timezone)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (profile_id)
    DO UPDATE SET
      birth_time = EXCLUDED.birth_time,
      birth_place = EXCLUDED.birth_place,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      timezone = EXCLUDED.timezone
  `, [
    profile.profile_id,
    birth_time,
    birth_place,
    latitude != null && latitude !== '' ? parseFloat(latitude) : null,
    longitude != null && longitude !== '' ? parseFloat(longitude) : null,
    timezone,
  ]);

  await db.query(`
    UPDATE profiles SET registration_step = GREATEST(registration_step, 3), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
  `, [userId]);

  const astro = await db.queryOne('SELECT * FROM astro_data WHERE profile_id = $1', [profile.profile_id]);
  const updatedProfile = await getProfileByUserId(userId);

  return { profile: updatedProfile, astro };
}

// ─── Step 4: Education & Profession ──────────────────────────────────────────
async function saveStep4(userId, data) {
  const { education, profession, employer, annual_income, hide_income, dietary_habit, height_cm, city } = data;

  await db.query(`
    UPDATE profiles SET
      education = $1, profession = $2, employer = $3, annual_income = $4, hide_income = $5,
      dietary_habit = $6, height_cm = $7, city = $8,
      registration_step = GREATEST(registration_step, 4),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $9
  `, [
    education,
    profession,
    employer,
    annual_income,
    hide_income ? 1 : 0,
    dietary_habit,
    height_cm != null ? parseInt(height_cm, 10) : null,
    city,
    userId,
  ]);

  return getProfileByUserId(userId);
}

// ─── Step 5: Family & Elder References ─────────────────────────────────────────
async function saveStep5(userId, data) {
  const profile = await getProfileByUserId(userId);
  const {
    father_name, father_occupation, mother_name, mother_maiden_inti_peru, sibling_count,
    elder_ref_1_name, elder_ref_1_phone, elder_ref_1_address, elder_ref_1_occupation,
    elder_ref_2_name, elder_ref_2_phone, elder_ref_2_address, elder_ref_2_occupation,
    elder_ref_3_name, elder_ref_3_phone, elder_ref_3_address, elder_ref_3_occupation,
  } = data;

  await db.query(`
    INSERT INTO family_info (
      profile_id,
      father_name, father_occupation, mother_name, mother_maiden_inti_peru, sibling_count,
      elder_ref_1_name, elder_ref_1_phone, elder_ref_1_address, elder_ref_1_occupation,
      elder_ref_2_name, elder_ref_2_phone, elder_ref_2_address, elder_ref_2_occupation,
      elder_ref_3_name, elder_ref_3_phone, elder_ref_3_address, elder_ref_3_occupation
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (profile_id)
    DO UPDATE SET
      father_name = EXCLUDED.father_name,
      father_occupation = EXCLUDED.father_occupation,
      mother_name = EXCLUDED.mother_name,
      mother_maiden_inti_peru = EXCLUDED.mother_maiden_inti_peru,
      sibling_count = EXCLUDED.sibling_count,
      elder_ref_1_name = EXCLUDED.elder_ref_1_name,
      elder_ref_1_phone = EXCLUDED.elder_ref_1_phone,
      elder_ref_1_address = EXCLUDED.elder_ref_1_address,
      elder_ref_1_occupation = EXCLUDED.elder_ref_1_occupation,
      elder_ref_2_name = EXCLUDED.elder_ref_2_name,
      elder_ref_2_phone = EXCLUDED.elder_ref_2_phone,
      elder_ref_2_address = EXCLUDED.elder_ref_2_address,
      elder_ref_2_occupation = EXCLUDED.elder_ref_2_occupation,
      elder_ref_3_name = EXCLUDED.elder_ref_3_name,
      elder_ref_3_phone = EXCLUDED.elder_ref_3_phone,
      elder_ref_3_address = EXCLUDED.elder_ref_3_address,
      elder_ref_3_occupation = EXCLUDED.elder_ref_3_occupation
  `, [
    profile.profile_id,
    father_name, father_occupation, mother_name, mother_maiden_inti_peru, sibling_count != null ? parseInt(sibling_count, 10) : 0,
    elder_ref_1_name, elder_ref_1_phone, elder_ref_1_address, elder_ref_1_occupation,
    elder_ref_2_name, elder_ref_2_phone, elder_ref_2_address, elder_ref_2_occupation,
    elder_ref_3_name, elder_ref_3_phone, elder_ref_3_address, elder_ref_3_occupation,
  ]);

  await db.query(`
    UPDATE profiles SET registration_step = GREATEST(registration_step, 5), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
  `, [userId]);

  return getProfileByUserId(userId);
}

// ─── Step 7: Preferences ────────────────────────────────────────────────────
async function saveStep7(userId, data) {
  const { pref_sub_sect, pref_location, pref_age_diff_min, pref_age_diff_max } = data;

  await db.query(`
    UPDATE profiles SET
      pref_sub_sect = $1, pref_location = $2,
      pref_age_diff_min = $3, pref_age_diff_max = $4,
      registration_step = GREATEST(registration_step, 7),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $5
  `, [
    pref_sub_sect || null,
    pref_location || null,
    pref_age_diff_min != null ? parseInt(pref_age_diff_min, 10) : null,
    pref_age_diff_max != null ? parseInt(pref_age_diff_max, 10) : null,
    userId,
  ]);

  return getProfileByUserId(userId);
}

// ─── Step 6: Finalize ────────────────────────────────────────────────────────
async function finalizeRegistration(userId) {
  await db.query(`
    UPDATE profiles SET registration_step = 6, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1
  `, [userId]);
  return getProfileByUserId(userId);
}

// ─── Own Profile ─────────────────────────────────────────────────────────────
async function getMyProfile(userId) {
  const user = await db.queryOne('SELECT * FROM users WHERE user_id = $1', [userId]);
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  const astro = profile ? await db.queryOne('SELECT * FROM astro_data WHERE profile_id = $1', [profile.profile_id]) : null;
  const family = profile ? await db.queryOne('SELECT * FROM family_info WHERE profile_id = $1', [profile.profile_id]) : null;
  const photos = profile ? await db.queryRows('SELECT * FROM profile_photos WHERE profile_id = $1', [profile.profile_id]) : [];

  return {
    user: safeUser(user),
    profile,
    astro,
    family,
    photos,
  };
}

// ─── Upload Photo ─────────────────────────────────────────────────────────────
async function savePhoto(userId, filename) {
  const profile = await getProfileByUserId(userId);

  const countRow = await db.queryOne('SELECT COUNT(*) as c FROM profile_photos WHERE profile_id = $1', [profile.profile_id]);
  const count = parseInt(countRow.c, 10);
  if (count >= 5) {
    const err = new Error('Maximum 5 profile photos allowed.');
    err.statusCode = 400;
    throw err;
  }

  const isPrimary = count === 0 ? 1 : 0;
  const photo = await db.queryOne(`
    INSERT INTO profile_photos (profile_id, filename, is_primary) VALUES ($1, $2, $3) RETURNING *
  `, [profile.profile_id, filename, isPrimary]);

  return photo;
}

// ─── Delete Photo ─────────────────────────────────────────────────────────────
async function deletePhoto(userId, photoId) {
  const profile = await getProfileByUserId(userId);
  const photo = await db.queryOne('SELECT * FROM profile_photos WHERE photo_id = $1 AND profile_id = $2', [photoId, profile.profile_id]);
  if (!photo) {
    const err = new Error('Photo not found.');
    err.statusCode = 404;
    throw err;
  }
  await db.query('DELETE FROM profile_photos WHERE photo_id = $1', [photoId]);
  if (photo.is_primary) {
    const next = await db.queryOne('SELECT photo_id FROM profile_photos WHERE profile_id = $1 LIMIT 1', [profile.profile_id]);
    if (next) {
      await db.query('UPDATE profile_photos SET is_primary = 1 WHERE photo_id = $1', [next.photo_id]);
    }
  }
  return { filename: photo.filename };
}

// ─── Save Document ────────────────────────────────────────────────────────────
async function saveDocument(userId, doc_type, filename) {
  await db.query('DELETE FROM documents WHERE user_id = $1 AND doc_type = $2', [userId, doc_type]);
  const doc = await db.queryOne(`
    INSERT INTO documents (user_id, doc_type, filename) VALUES ($1, $2, $3)
    RETURNING doc_id, user_id, doc_type, uploaded_at
  `, [userId, doc_type, filename]);
  return doc;
}

module.exports = {
  getProfileByUserId,
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  saveStep5,
  saveStep7,
  finalizeRegistration,
  getMyProfile,
  savePhoto,
  deletePhoto,
  saveDocument,
};
