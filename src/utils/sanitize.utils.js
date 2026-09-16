'use strict';

/**
 * Profile serialization profiles.
 * Controls exactly which fields are exposed to which caller type.
 * Business rule: privacy enforcement happens HERE, not in React.
 */

const PRIVATE_PHONE_FIELDS = [
  // New elder reference phone fields (never shown in public candidate profiles)
  'elder_ref_1_phone',
  'elder_ref_2_phone',
  'elder_ref_3_phone',
  // Legacy fields (kept for backward compatibility — not written by new registrations)
  'paternal_uncle_phone',
  'maternal_uncle_phone',
  'purohit_reference_phone',
];

/**
 * Serialize a profile for public-facing candidate profile views.
 * - Strips all private phone numbers (always)
 * - Respects hide_income flag
 */
function publicProfile(profile, familyInfo = null) {
  if (!profile) return null;

  const safe = { ...profile };

  // Never expose income if user chose to hide it
  if (safe.hide_income) {
    safe.annual_income = null;
  }
  delete safe.hide_income; // Don't leak the flag itself

  const safeFamily = familyInfo ? sanitizeFamily(familyInfo) : null;
  return { ...safe, family: safeFamily };
}

/**
 * Serialize for admin — full unmasked data.
 */
function adminProfile(profile, familyInfo = null, astro = null, photos = [], docs = []) {
  if (!profile) return null;
  return { ...profile, family: familyInfo || null, astro: astro || null, photos: photos || [], docs: docs || [] };
}

/**
 * Strip private phone fields from family info.
 */
function sanitizeFamily(family) {
  if (!family) return null;
  const safe = { ...family };
  for (const field of PRIVATE_PHONE_FIELDS) {
    delete safe[field];
  }
  return safe;
}

/**
 * Strip password_hash from user row before any external exposure.
 */
function safeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

module.exports = { publicProfile, adminProfile, sanitizeFamily, safeUser };
