'use strict';

const { getDb } = require('../../config/database');
const { safeUser, publicProfile, adminProfile } = require('../../utils/sanitize.utils');
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
function getProfileByUserId(userId) {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!profile) {
    const err = new Error('Profile not found.');
    err.statusCode = 404;
    throw err;
  }
  return profile;
}

// ─── Step 1: Basic Information ───────────────────────────────────────────────
function saveStep1(userId, data) {
  const db = getDb();
  const { first_name, surname, gender, date_of_birth } = data;

  // Normalise marital_status aliases → canonical DB values
  // DB CHECK: ('Never Married','Divorced','Widowed')
  const MARITAL_MAP = { 'Unmarried': 'Never Married', 'Single': 'Never Married' };
  const marital_status = MARITAL_MAP[data.marital_status] ?? data.marital_status;

  // Normalise profile_managed_by aliases → canonical DB values
  // DB CHECK: ('Self','Parent','Sibling','Joint')
  const MANAGED_BY_MAP = { 'Relative': 'Joint' };
  const managed_by = data.profile_managed_by
    ? (MANAGED_BY_MAP[data.profile_managed_by] ?? data.profile_managed_by)
    : null;

  db.prepare(`
    UPDATE profiles SET
      first_name = ?, surname = ?, gender = ?, date_of_birth = ?,
      marital_status = ?, registration_step = MAX(registration_step, 1),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(first_name, surname, gender, date_of_birth, marital_status, userId);

  // Update profile_managed_by on users table
  if (managed_by) {
    db.prepare('UPDATE users SET profile_managed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run(managed_by, userId);
  }
  return getProfileByUserId(userId);
}

// ─── Step 2: Lineage ──────────────────────────────────────────────────────────
function saveStep2(userId, data) {
  const db = getDb();
  const { sub_sect, gotra, pravara, maternal_gotra, maternal_inti_peru, veda, shakha, native_place } = data;
  // pravara is optional — store null if blank
  const pravaraNorm = pravara && pravara.trim() ? pravara.trim() : null;
  db.prepare(`
    UPDATE profiles SET
      sub_sect = ?, gotra = ?, pravara = ?, maternal_gotra = ?, maternal_inti_peru = ?,
      veda = ?, shakha = ?, native_place = ?,
      registration_step = MAX(registration_step, 2),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(sub_sect, gotra, pravaraNorm, maternal_gotra, maternal_inti_peru, veda, shakha, native_place, userId);
  return getProfileByUserId(userId);
}

// ─── Step 3: Birth Information ───────────────────────────────────────────────
async function saveStep3(userId, data) {
  const db = getDb();
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

  const profile = getProfileByUserId(userId);

  // Upsert astro_data
  const existing = db.prepare('SELECT astro_id FROM astro_data WHERE profile_id = ?').get(profile.profile_id);
  if (existing) {
    db.prepare(`
      UPDATE astro_data SET birth_time=?, birth_place=?, latitude=?, longitude=?, timezone=?
      WHERE profile_id=?
    `).run(birth_time, birth_place, latitude ?? null, longitude ?? null, timezone, profile.profile_id);
  } else {
    db.prepare(`
      INSERT INTO astro_data (profile_id, birth_time, birth_place, latitude, longitude, timezone)
      VALUES (?,?,?,?,?,?)
    `).run(profile.profile_id, birth_time, birth_place, latitude ?? null, longitude ?? null, timezone);
  }

  db.prepare(`
    UPDATE profiles SET registration_step = MAX(registration_step, 3), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(userId);

  return { profile: getProfileByUserId(userId), astro: db.prepare('SELECT * FROM astro_data WHERE profile_id=?').get(profile.profile_id) };
}

// ─── Step 4: Education & Profession ──────────────────────────────────────────
function saveStep4(userId, data) {
  const db = getDb();
  const { education, profession, employer, annual_income, hide_income, dietary_habit, height_cm, city } = data;
  db.prepare(`
    UPDATE profiles SET
      education=?, profession=?, employer=?, annual_income=?, hide_income=?,
      dietary_habit=?, height_cm=?, city=?,
      registration_step = MAX(registration_step, 4),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(education, profession, employer, annual_income, hide_income ? 1 : 0, dietary_habit, height_cm, city, userId);
  return getProfileByUserId(userId);
}

// ─── Step 5: Family & Elder References ─────────────────────────────────────────
function saveStep5(userId, data) {
  const db = getDb();
  const profile = getProfileByUserId(userId);
  const {
    father_name, father_occupation, mother_name, mother_maiden_inti_peru, sibling_count,
    // Elder references (up to 3, all optional)
    elder_ref_1_name, elder_ref_1_phone, elder_ref_1_address, elder_ref_1_occupation,
    elder_ref_2_name, elder_ref_2_phone, elder_ref_2_address, elder_ref_2_occupation,
    elder_ref_3_name, elder_ref_3_phone, elder_ref_3_address, elder_ref_3_occupation,
  } = data;

  const existing = db.prepare('SELECT family_id FROM family_info WHERE profile_id=?').get(profile.profile_id);
  if (existing) {
    db.prepare(`
      UPDATE family_info SET
        father_name=?, father_occupation=?, mother_name=?, mother_maiden_inti_peru=?,
        sibling_count=?,
        elder_ref_1_name=?, elder_ref_1_phone=?, elder_ref_1_address=?, elder_ref_1_occupation=?,
        elder_ref_2_name=?, elder_ref_2_phone=?, elder_ref_2_address=?, elder_ref_2_occupation=?,
        elder_ref_3_name=?, elder_ref_3_phone=?, elder_ref_3_address=?, elder_ref_3_occupation=?
      WHERE profile_id=?
    `).run(
      father_name, father_occupation, mother_name, mother_maiden_inti_peru, sibling_count,
      elder_ref_1_name, elder_ref_1_phone, elder_ref_1_address, elder_ref_1_occupation,
      elder_ref_2_name, elder_ref_2_phone, elder_ref_2_address, elder_ref_2_occupation,
      elder_ref_3_name, elder_ref_3_phone, elder_ref_3_address, elder_ref_3_occupation,
      profile.profile_id
    );
  } else {
    db.prepare(`
      INSERT INTO family_info (
        profile_id,
        father_name, father_occupation, mother_name, mother_maiden_inti_peru, sibling_count,
        elder_ref_1_name, elder_ref_1_phone, elder_ref_1_address, elder_ref_1_occupation,
        elder_ref_2_name, elder_ref_2_phone, elder_ref_2_address, elder_ref_2_occupation,
        elder_ref_3_name, elder_ref_3_phone, elder_ref_3_address, elder_ref_3_occupation
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      profile.profile_id,
      father_name, father_occupation, mother_name, mother_maiden_inti_peru, sibling_count,
      elder_ref_1_name, elder_ref_1_phone, elder_ref_1_address, elder_ref_1_occupation,
      elder_ref_2_name, elder_ref_2_phone, elder_ref_2_address, elder_ref_2_occupation,
      elder_ref_3_name, elder_ref_3_phone, elder_ref_3_address, elder_ref_3_occupation
    );
  }

  db.prepare(`
    UPDATE profiles SET registration_step = MAX(registration_step, 5), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(userId);
  return getProfileByUserId(userId);
}

// ─── Step 7: Preferences ────────────────────────────────────────────────────
function saveStep7(userId, data) {
  const db = getDb();
  const { pref_sub_sect, pref_location, pref_age_diff_min, pref_age_diff_max } = data;
  db.prepare(`
    UPDATE profiles SET
      pref_sub_sect = ?, pref_location = ?,
      pref_age_diff_min = ?, pref_age_diff_max = ?,
      registration_step = MAX(registration_step, 7),
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(
    pref_sub_sect || null,
    pref_location || null,
    pref_age_diff_min != null ? parseInt(pref_age_diff_min, 10) : null,
    pref_age_diff_max != null ? parseInt(pref_age_diff_max, 10) : null,
    userId
  );
  return getProfileByUserId(userId);
}

// ─── Step 6: Finalize ────────────────────────────────────────────────────────
function finalizeRegistration(userId) {
  const db = getDb();
  // Mark registration complete — status stays Pending_ID (awaiting admin review)
  db.prepare(`
    UPDATE profiles SET registration_step = 6, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).run(userId);
  return getProfileByUserId(userId);
}

// ─── Own Profile ─────────────────────────────────────────────────────────────
function getMyProfile(userId) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const astro = profile ? db.prepare('SELECT * FROM astro_data WHERE profile_id=?').get(profile.profile_id) : null;
  const family = profile ? db.prepare('SELECT * FROM family_info WHERE profile_id=?').get(profile.profile_id) : null;
  const photos = profile ? db.prepare('SELECT * FROM profile_photos WHERE profile_id=?').all(profile.profile_id) : [];

  return {
    user: safeUser(user),
    profile,
    astro,
    family, // Own profile shows full family — it's their own data
    photos,
  };
}

// ─── Upload Photo ─────────────────────────────────────────────────────────────
function savePhoto(userId, filename) {
  const db = getDb();
  const profile = getProfileByUserId(userId);

  // Check photo limit
  const count = db.prepare('SELECT COUNT(*) as c FROM profile_photos WHERE profile_id=?').get(profile.profile_id).c;
  if (count >= 5) {
    const err = new Error('Maximum 5 profile photos allowed.');
    err.statusCode = 400;
    throw err;
  }

  const isPrimary = count === 0 ? 1 : 0;
  const { lastInsertRowid: photoId } = db.prepare(`
    INSERT INTO profile_photos (profile_id, filename, is_primary) VALUES (?,?,?)
  `).run(profile.profile_id, filename, isPrimary);

  return db.prepare('SELECT * FROM profile_photos WHERE photo_id=?').get(photoId);
}

// ─── Delete Photo ─────────────────────────────────────────────────────────────
function deletePhoto(userId, photoId) {
  const db = getDb();
  const profile = getProfileByUserId(userId);
  const photo = db.prepare('SELECT * FROM profile_photos WHERE photo_id=? AND profile_id=?').get(photoId, profile.profile_id);
  if (!photo) {
    const err = new Error('Photo not found.');
    err.statusCode = 404;
    throw err;
  }
  db.prepare('DELETE FROM profile_photos WHERE photo_id=?').run(photoId);
  // If deleted was primary, promote next photo
  if (photo.is_primary) {
    const next = db.prepare('SELECT photo_id FROM profile_photos WHERE profile_id=? LIMIT 1').get(profile.profile_id);
    if (next) db.prepare('UPDATE profile_photos SET is_primary=1 WHERE photo_id=?').run(next.photo_id);
  }
  return { filename: photo.filename };
}

// ─── Save Document ────────────────────────────────────────────────────────────
function saveDocument(userId, doc_type, filename) {
  const db = getDb();
  // Remove old doc of same type before inserting new one
  db.prepare('DELETE FROM documents WHERE user_id=? AND doc_type=?').run(userId, doc_type);
  const { lastInsertRowid: docId } = db.prepare(`
    INSERT INTO documents (user_id, doc_type, filename) VALUES (?,?,?)
  `).run(userId, doc_type, filename);
  return db.prepare('SELECT doc_id, user_id, doc_type, uploaded_at FROM documents WHERE doc_id=?').get(docId);
}

module.exports = {
  saveStep1, saveStep2, saveStep3, saveStep4, saveStep5, saveStep7,
  finalizeRegistration, getMyProfile, savePhoto, deletePhoto, saveDocument,
};
