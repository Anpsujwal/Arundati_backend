'use strict';

const db = require('../../config/database');
const { safeUser } = require('../../utils/sanitize.utils');
const env = require('../../config/env');
const fs = require('fs');
const path = require('path');

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

// ─── Step Validation Helper ──────────────────────────────────────────────────
async function validateProfileSteps(userId) {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!profile) return { isComplete: false, steps: {}, missing: ['Profile not found'] };

  const astro = await db.queryOne('SELECT * FROM astro_data WHERE profile_id = $1', [profile.profile_id]);
  const family = await db.queryOne('SELECT * FROM family_info WHERE profile_id = $1', [profile.profile_id]);
  const photos = await db.queryRows('SELECT * FROM profile_photos WHERE profile_id = $1', [profile.profile_id]);

  const step1Missing = [];
  if (!profile.first_name || !profile.first_name.trim()) step1Missing.push('First name');
  if (!profile.surname || !profile.surname.trim()) step1Missing.push('Surname / Inti Peru');
  if (!profile.gender) step1Missing.push('Gender');
  if (!profile.date_of_birth) step1Missing.push('Date of birth');
  if (!profile.marital_status) step1Missing.push('Marital status');

  const step2Missing = [];
  if (!profile.sub_sect || !profile.sub_sect.trim()) step2Missing.push('Sub-sect');
  if (!profile.gotra || !profile.gotra.trim()) step2Missing.push('Gotra');

  const step3Missing = [];
  if (!astro || !astro.birth_time) step3Missing.push('Time of birth');
  if (!astro || !astro.birth_place || !astro.birth_place.trim()) step3Missing.push('Birth place');
  if (!astro || !astro.timezone) step3Missing.push('Timezone');

  const step4Missing = [];
  if (!profile.education || !profile.education.trim()) step4Missing.push('Highest education');
  if (!profile.profession || !profile.profession.trim()) step4Missing.push('Profession');
  if (!profile.city || !profile.city.trim()) step4Missing.push('Current city');
  if (!profile.height_cm) step4Missing.push('Height');
  if (!profile.annual_income) step4Missing.push('Annual income');
  if (!profile.dietary_habit) step4Missing.push('Dietary preference');

  const step5Missing = [];
  if (!family || !family.father_name || !family.father_name.trim()) step5Missing.push("Father's name");
  if (!family || !family.mother_name || !family.mother_name.trim()) step5Missing.push("Mother's name");

  const step6Missing = [];
  if (!photos || photos.length === 0) step6Missing.push('At least 1 profile photo');

  const steps = {
    step1: { stepNum: 1, complete: step1Missing.length === 0, missing: step1Missing, label: 'Basic Information' },
    step2: { stepNum: 2, complete: step2Missing.length === 0, missing: step2Missing, label: 'Lineage & Gotra' },
    step3: { stepNum: 3, complete: step3Missing.length === 0, missing: step3Missing, label: 'Birth Details' },
    step4: { stepNum: 4, complete: step4Missing.length === 0, missing: step4Missing, label: 'Education & Profession' },
    step5: { stepNum: 5, complete: step5Missing.length === 0, missing: step5Missing, label: 'Family Information' },
    step6: { stepNum: 6, complete: step6Missing.length === 0, missing: step6Missing, label: 'Profile Photos' },
    step7: { stepNum: 7, complete: true, missing: [], label: 'Partner Preferences' },
  };

  const isComplete = Object.values(steps).every((s) => s.complete);

  return {
    isComplete,
    steps,
  };
}

// ─── Step 7: Preferences & Final Submission ──────────────────────────────────
async function saveStep7(userId, data) {
  const validation = await validateProfileSteps(userId);
  if (!validation.isComplete) {
    const incompleteDetails = Object.values(validation.steps)
      .filter((s) => !s.complete)
      .map((s) => `${s.label}: missing ${s.missing.join(', ')}`)
      .join('; ');
    const error = new Error(`Cannot submit application. All 7 steps and mandatory fields must be completed. Incomplete: ${incompleteDetails}`);
    error.status = 400;
    throw error;
  }

  const { pref_sub_sect, pref_location, pref_age_diff_min, pref_age_diff_max } = data;

  await db.query(`
    UPDATE profiles SET
      pref_sub_sect = $1, pref_location = $2,
      pref_age_diff_min = $3, pref_age_diff_max = $4,
      registration_step = 7,
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
    UPDATE profiles SET registration_step = GREATEST(registration_step, 6), updated_at = CURRENT_TIMESTAMP WHERE user_id = $1
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
  const validation = await validateProfileSteps(userId);

  return {
    user: safeUser(user),
    profile,
    astro,
    family,
    photos,
    validation,
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

// ─── Update Full Profile ──────────────────────────────────────────────────────
async function updateFullProfile(userId, data) {
  // 1. Basic profile info
  if (
    data.first_name !== undefined ||
    data.surname !== undefined ||
    data.gender !== undefined ||
    data.date_of_birth !== undefined ||
    data.marital_status !== undefined ||
    data.profile_managed_by !== undefined
  ) {
    const existing = await getProfileByUserId(userId);
    const MARITAL_MAP = { 'Unmarried': 'Never Married', 'Single': 'Never Married' };
    const marital_status = data.marital_status ? (MARITAL_MAP[data.marital_status] ?? data.marital_status) : existing.marital_status;
    const MANAGED_BY_MAP = { 'Relative': 'Joint' };
    const managed_by = data.profile_managed_by ? (MANAGED_BY_MAP[data.profile_managed_by] ?? data.profile_managed_by) : null;

    await db.query(`
      UPDATE profiles SET
        first_name = COALESCE($1, first_name),
        surname = COALESCE($2, surname),
        gender = COALESCE($3, gender),
        date_of_birth = COALESCE($4, date_of_birth),
        marital_status = COALESCE($5, marital_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $6
    `, [
      data.first_name !== undefined ? data.first_name : null,
      data.surname !== undefined ? data.surname : null,
      data.gender !== undefined ? data.gender : null,
      data.date_of_birth !== undefined ? data.date_of_birth : null,
      marital_status,
      userId
    ]);

    if (managed_by) {
      await db.query('UPDATE users SET profile_managed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [
        managed_by,
        userId
      ]);
    }
  }

  // 2. Lineage
  if (
    data.sub_sect !== undefined ||
    data.gotra !== undefined ||
    data.pravara !== undefined ||
    data.maternal_gotra !== undefined ||
    data.maternal_inti_peru !== undefined ||
    data.veda !== undefined ||
    data.shakha !== undefined ||
    data.native_place !== undefined
  ) {
    await db.query(`
      UPDATE profiles SET
        sub_sect = COALESCE($1, sub_sect),
        gotra = COALESCE($2, gotra),
        pravara = COALESCE($3, pravara),
        maternal_gotra = COALESCE($4, maternal_gotra),
        maternal_inti_peru = COALESCE($5, maternal_inti_peru),
        veda = COALESCE($6, veda),
        shakha = COALESCE($7, shakha),
        native_place = COALESCE($8, native_place),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $9
    `, [
      data.sub_sect !== undefined ? data.sub_sect : null,
      data.gotra !== undefined ? data.gotra : null,
      data.pravara !== undefined ? (data.pravara?.trim() || null) : null,
      data.maternal_gotra !== undefined ? data.maternal_gotra : null,
      data.maternal_inti_peru !== undefined ? data.maternal_inti_peru : null,
      data.veda !== undefined ? data.veda : null,
      data.shakha !== undefined ? data.shakha : null,
      data.native_place !== undefined ? data.native_place : null,
      userId
    ]);
  }

  // 3. Birth details / Astro
  let birthDataChanged = false;
  if (
    data.birth_time !== undefined ||
    data.birth_place !== undefined ||
    data.latitude !== undefined ||
    data.longitude !== undefined ||
    data.timezone !== undefined
  ) {
    const profile = await getProfileByUserId(userId);
    let { birth_time, birth_place, latitude, longitude, timezone } = data;

    // Auto-geocode if place is provided but coords are missing
    if (birth_place && (latitude == null || longitude == null || latitude === '' || longitude === '')) {
      const coords = await geocodeBirthPlace(birth_place);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    }

    const currentAstro = await db.queryOne('SELECT * FROM astro_data WHERE profile_id = $1', [profile.profile_id]);
    const finalBirthTime = birth_time !== undefined ? birth_time : currentAstro?.birth_time;
    const finalBirthPlace = birth_place !== undefined ? birth_place : currentAstro?.birth_place;
    const finalLat = latitude !== undefined && latitude !== '' ? parseFloat(latitude) : (currentAstro?.latitude ?? null);
    const finalLng = longitude !== undefined && longitude !== '' ? parseFloat(longitude) : (currentAstro?.longitude ?? null);
    const finalTz = timezone !== undefined ? timezone : (currentAstro?.timezone ?? 'Asia/Kolkata');

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
      finalBirthTime,
      finalBirthPlace,
      finalLat,
      finalLng,
      finalTz
    ]);
    birthDataChanged = true;
  }

  // 4. Education & Career
  if (
    data.education !== undefined ||
    data.profession !== undefined ||
    data.employer !== undefined ||
    data.annual_income !== undefined ||
    data.hide_income !== undefined ||
    data.dietary_habit !== undefined ||
    data.height_cm !== undefined ||
    data.city !== undefined
  ) {
    await db.query(`
      UPDATE profiles SET
        education = COALESCE($1, education),
        profession = COALESCE($2, profession),
        employer = COALESCE($3, employer),
        annual_income = COALESCE($4, annual_income),
        hide_income = CASE WHEN $5::INTEGER IS NOT NULL THEN $5::INTEGER ELSE hide_income END,
        dietary_habit = COALESCE($6, dietary_habit),
        height_cm = CASE WHEN $7::INTEGER IS NOT NULL THEN $7::INTEGER ELSE height_cm END,
        city = COALESCE($8, city),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $9
    `, [
      data.education !== undefined ? data.education : null,
      data.profession !== undefined ? data.profession : null,
      data.employer !== undefined ? data.employer : null,
      data.annual_income !== undefined ? data.annual_income : null,
      data.hide_income !== undefined ? (data.hide_income ? 1 : 0) : null,
      data.dietary_habit !== undefined ? data.dietary_habit : null,
      data.height_cm !== undefined && data.height_cm !== '' ? parseInt(data.height_cm, 10) : null,
      data.city !== undefined ? data.city : null,
      userId
    ]);
  }

  // 5. Family
  if (
    data.father_name !== undefined ||
    data.father_occupation !== undefined ||
    data.mother_name !== undefined ||
    data.mother_maiden_inti_peru !== undefined ||
    data.sibling_count !== undefined ||
    data.elder_ref_1_name !== undefined ||
    data.elder_ref_1_phone !== undefined ||
    data.elder_ref_1_address !== undefined ||
    data.elder_ref_1_occupation !== undefined ||
    data.elder_ref_2_name !== undefined ||
    data.elder_ref_2_phone !== undefined ||
    data.elder_ref_2_address !== undefined ||
    data.elder_ref_2_occupation !== undefined ||
    data.elder_ref_3_name !== undefined ||
    data.elder_ref_3_phone !== undefined ||
    data.elder_ref_3_address !== undefined ||
    data.elder_ref_3_occupation !== undefined
  ) {
    const profile = await getProfileByUserId(userId);
    const existingFamily = await db.queryOne('SELECT * FROM family_info WHERE profile_id = $1', [profile.profile_id]);

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
      data.father_name !== undefined ? data.father_name : existingFamily?.father_name,
      data.father_occupation !== undefined ? data.father_occupation : existingFamily?.father_occupation,
      data.mother_name !== undefined ? data.mother_name : existingFamily?.mother_name,
      data.mother_maiden_inti_peru !== undefined ? data.mother_maiden_inti_peru : existingFamily?.mother_maiden_inti_peru,
      data.sibling_count !== undefined ? parseInt(data.sibling_count, 10) : (existingFamily?.sibling_count ?? 0),
      data.elder_ref_1_name !== undefined ? data.elder_ref_1_name : existingFamily?.elder_ref_1_name,
      data.elder_ref_1_phone !== undefined ? data.elder_ref_1_phone : existingFamily?.elder_ref_1_phone,
      data.elder_ref_1_address !== undefined ? data.elder_ref_1_address : existingFamily?.elder_ref_1_address,
      data.elder_ref_1_occupation !== undefined ? data.elder_ref_1_occupation : existingFamily?.elder_ref_1_occupation,
      data.elder_ref_2_name !== undefined ? data.elder_ref_2_name : existingFamily?.elder_ref_2_name,
      data.elder_ref_2_phone !== undefined ? data.elder_ref_2_phone : existingFamily?.elder_ref_2_phone,
      data.elder_ref_2_address !== undefined ? data.elder_ref_2_address : existingFamily?.elder_ref_2_address,
      data.elder_ref_2_occupation !== undefined ? data.elder_ref_2_occupation : existingFamily?.elder_ref_2_occupation,
      data.elder_ref_3_name !== undefined ? data.elder_ref_3_name : existingFamily?.elder_ref_3_name,
      data.elder_ref_3_phone !== undefined ? data.elder_ref_3_phone : existingFamily?.elder_ref_3_phone,
      data.elder_ref_3_address !== undefined ? data.elder_ref_3_address : existingFamily?.elder_ref_3_address,
      data.elder_ref_3_occupation !== undefined ? data.elder_ref_3_occupation : existingFamily?.elder_ref_3_occupation,
    ]);
  }

  // 6. Preferences
  if (
    data.pref_sub_sect !== undefined ||
    data.pref_location !== undefined ||
    data.pref_age_diff_min !== undefined ||
    data.pref_age_diff_max !== undefined
  ) {
    await db.query(`
      UPDATE profiles SET
        pref_sub_sect = COALESCE($1, pref_sub_sect),
        pref_location = COALESCE($2, pref_location),
        pref_age_diff_min = CASE WHEN $3::INTEGER IS NOT NULL THEN $3::INTEGER ELSE pref_age_diff_min END,
        pref_age_diff_max = CASE WHEN $4::INTEGER IS NOT NULL THEN $4::INTEGER ELSE pref_age_diff_max END,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $5
    `, [
      data.pref_sub_sect !== undefined ? data.pref_sub_sect : null,
      data.pref_location !== undefined ? data.pref_location : null,
      data.pref_age_diff_min !== undefined ? (data.pref_age_diff_min != null && data.pref_age_diff_min !== '' ? parseInt(data.pref_age_diff_min, 10) : null) : null,
      data.pref_age_diff_max !== undefined ? (data.pref_age_diff_max != null && data.pref_age_diff_max !== '' ? parseInt(data.pref_age_diff_max, 10) : null) : null,
      userId
    ]);
  }

  // If birth data or DOB changed, trigger kundali recalculation
  if (birthDataChanged || data.date_of_birth !== undefined) {
    try {
      const { triggerKundaliGeneration } = require('../kundali/kundali.service');
      await triggerKundaliGeneration(userId);
    } catch (e) {
      console.warn('[profile] Could not re-trigger kundali generation:', e.message);
    }
  }

  return getMyProfile(userId);
}

// ─── Delete Account Permanently ───────────────────────────────────────────────
async function deleteMyAccount(userId) {
  const user = await db.queryOne('SELECT * FROM users WHERE user_id = $1', [userId]);
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  if (user.role === 'admin') {
    const err = new Error('Admin accounts cannot be self-deleted.');
    err.statusCode = 403;
    throw err;
  }

  // Fetch photos and documents to unlink from filesystem
  const docRows = await db.queryRows('SELECT filename FROM documents WHERE user_id = $1', [userId]);
  const photoRows = await db.queryRows(`
    SELECT p.filename FROM profile_photos p
    JOIN profiles pr ON p.profile_id = pr.profile_id
    WHERE pr.user_id = $1
  `, [userId]);

  await db.transaction(async (client) => {
    // 1. Documents
    await client.query('DELETE FROM documents WHERE user_id = $1', [userId]);

    const profile = (await client.query('SELECT profile_id FROM profiles WHERE user_id = $1', [userId])).rows[0];
    if (profile) {
      // 2. Profile photos
      await client.query('DELETE FROM profile_photos WHERE profile_id = $1', [profile.profile_id]);

      // 3. Interests
      await client.query('DELETE FROM interests WHERE sender_profile_id = $1 OR receiver_profile_id = $1', [
        profile.profile_id,
      ]);

      // 4. Astro data
      await client.query('DELETE FROM astro_data WHERE profile_id = $1', [profile.profile_id]);

      // 5. Family info
      await client.query('DELETE FROM family_info WHERE profile_id = $1', [profile.profile_id]);

      // 6. Profile grades
      await client.query('DELETE FROM profile_grades WHERE profile_id = $1 OR user_id = $2', [
        profile.profile_id,
        userId,
      ]);

      // 7. Profile row
      await client.query('DELETE FROM profiles WHERE profile_id = $1', [profile.profile_id]);
    }

    // 8. User row — cascades to kundalis + kundali_matches
    await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
  });

  // Clean up disk files
  for (const p of photoRows) {
    try {
      const filePath = path.resolve(__dirname, '../../../uploads/photos', p.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
  }
  for (const d of docRows) {
    try {
      const filePath = path.resolve(__dirname, '../../../uploads/documents', d.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
  }

  console.log(`[profile] User ${userId} account permanently deleted.`);
  return { success: true, user_id: userId };
}

module.exports = {
  getProfileByUserId,
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  saveStep5,
  saveStep7,
  validateProfileSteps,
  finalizeRegistration,
  getMyProfile,
  savePhoto,
  deletePhoto,
  saveDocument,
  updateFullProfile,
  deleteMyAccount,
};
