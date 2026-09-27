'use strict';

const { getDb } = require('../../config/database');
const { adminProfile } = require('../../utils/sanitize.utils');
const { hasBirthData, triggerKundaliGeneration, getKundaliAdmin } = require('../kundali/kundali.service');

function getStats() {
  const db = getDb();
  const total     = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user'").get().c;
  const pending   = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Pending_ID'").get().c;
  const approved  = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Approved'").get().c;
  const rejected  = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Rejected'").get().c;
  const suspended = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Suspended'").get().c;

  // Kundali stats (only for approved users)
  const kundaliGenerated = db.prepare("SELECT COUNT(*) as c FROM kundalis WHERE kundali_status='GENERATED'").get().c;
  const kundaliFailed    = db.prepare("SELECT COUNT(*) as c FROM kundalis WHERE kundali_status='FAILED'").get().c;
  const kundaliPending   = db.prepare("SELECT COUNT(*) as c FROM kundalis WHERE kundali_status IN ('GENERATING','NOT_GENERATED','INCOMPLETE_BIRTH_DATA')").get().c;

  return {
    total, pending, approved, rejected, suspended,
    kundali: { generated: kundaliGenerated, failed: kundaliFailed, pending: kundaliPending },
  };
}

function getRecentSubmissions(limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT u.user_id, u.email, u.account_status, u.created_at,
           p.profile_id, p.first_name, p.surname, p.gender, p.gotra, p.registration_step
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.user_id
    WHERE u.role = 'user'
    ORDER BY u.created_at DESC
    LIMIT ?
  `).all(limit);
}

function getPendingProfiles() {
  const db = getDb();
  return db.prepare(`
    SELECT u.user_id, u.email, u.account_status, u.created_at,
           p.profile_id, p.first_name, p.surname, p.gender, p.gotra, p.registration_step,
           p.city, p.sub_sect,
           (SELECT doc_id FROM documents WHERE user_id=u.user_id AND doc_type='gov_id' LIMIT 1) as has_gov_id
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.user_id
    WHERE u.account_status = 'Pending_ID' AND u.role = 'user'
    ORDER BY u.created_at ASC
  `).all();
}

function getAllUsers({ status, page = 1, limit = 20 } = {}) {
  const db = getDb();
  const offset = (page - 1) * limit;
  let where = "WHERE u.role = 'user'";
  const params = [];
  if (status) { where += ' AND u.account_status = ?'; params.push(status); }
  params.push(limit, offset);

  const users = db.prepare(`
    SELECT u.user_id, u.email, u.account_status, u.created_at,
           p.profile_id, p.first_name, p.surname, p.gender, p.gotra, p.city,
           k.kundali_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.user_id
    LEFT JOIN kundalis k ON k.user_id = u.user_id
    ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?
  `).all(...params);

  const countParams = status ? [status] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM users u ${where.replace(' LIMIT ? OFFSET ?', '')}`).get(...countParams)?.c || 0;

  return { users, pagination: { page, limit, total } };
}

function getAdminProfile(profileId) {
  const db = getDb();
  const profile = db.prepare(
    'SELECT p.*, u.email, u.account_status, u.created_at as user_created, u.user_id FROM profiles p JOIN users u ON u.user_id=p.user_id WHERE p.profile_id=?'
  ).get(profileId);
  if (!profile) {
    const err = new Error('Profile not found.'); err.statusCode = 404; throw err;
  }
  const family  = db.prepare('SELECT * FROM family_info WHERE profile_id=?').get(profileId);
  const astro   = db.prepare('SELECT * FROM astro_data WHERE profile_id=?').get(profileId);
  const photos  = db.prepare('SELECT * FROM profile_photos WHERE profile_id=?').all(profileId);
  const docs    = db.prepare('SELECT doc_id, doc_type, uploaded_at FROM documents WHERE user_id=?').all(profile.user_id);
  const kundali = getKundaliAdmin(profile.user_id);

  return { ...adminProfile(profile, family, astro, photos, docs), kundali };
}

/**
 * Permanently delete a user and ALL their associated data.
 *
 * Deletes (in dependency order):
 *   kundali_matches → kundalis → documents → profile_photos
 *   → interests → astro_data → family_info → profiles → users
 */
function deleteUser(userId) {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!user) {
    const err = new Error('User not found.'); err.statusCode = 404; throw err;
  }
  if (user.role === 'admin') {
    const err = new Error('Cannot delete an admin account.'); err.statusCode = 403; throw err;
  }

  // Run everything in a single atomic transaction
  const deleteTx = db.transaction(() => {
    // kundali_matches references users(user_id) ON DELETE CASCADE → auto-cleaned
    // kundalis       references users(user_id) ON DELETE CASCADE → auto-cleaned
    // interests      references profiles(profile_id) ON DELETE CASCADE → auto-cleaned
    //                (but profile must be deleted before user, so handle manually below)

    // 1. Documents (Gov ID, etc.) — no CASCADE from users, manual delete
    db.prepare('DELETE FROM documents WHERE user_id = ?').run(userId);

    const profile = db.prepare('SELECT profile_id FROM profiles WHERE user_id = ?').get(userId);
    if (profile) {
      // 2. Profile photos — no CASCADE from profiles, manual delete
      db.prepare('DELETE FROM profile_photos WHERE profile_id = ?').run(profile.profile_id);

      // 3. Interests — cascades from profiles ON DELETE CASCADE, but profile
      //    is deleted next so do it explicitly to be safe
      db.prepare('DELETE FROM interests WHERE sender_profile_id = ? OR receiver_profile_id = ?')
        .run(profile.profile_id, profile.profile_id);

      // 4. Astro data
      db.prepare('DELETE FROM astro_data WHERE profile_id = ?').run(profile.profile_id);

      // 5. Family info
      db.prepare('DELETE FROM family_info WHERE profile_id = ?').run(profile.profile_id);

      // 6. Profile row
      db.prepare('DELETE FROM profiles WHERE profile_id = ?').run(profile.profile_id);
    }

    // 7. User row — CASCADE auto-removes: kundalis + kundali_matches
    db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
  });

  deleteTx();

  console.log(`[admin] User ${userId} permanently deleted.`);
  return { user_id: userId, deleted: true };
}

/**
 * Verify (approve / reject / suspend) a user profile.
 *
 * RULES:
 *   - Approval is BLOCKED if the user has no complete birth data.
 *     Admin must ensure Step 3 (Birth Information) is filled before approving.
 *   - On Approval: Kundali generation is triggered asynchronously.
 *     The HTTP response returns immediately (admin is NOT blocked).
 */
function verifyProfile(adminUserId, { user_id, action, reason }) {
  const db = getDb();

  const validActions = ['Approved', 'Rejected', 'Suspended'];
  if (!validActions.includes(action)) {
    const err = new Error('Invalid action.'); err.statusCode = 400; throw err;
  }

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(user_id);
  if (!user) {
    const err = new Error('User not found.'); err.statusCode = 404; throw err;
  }

  // ── Block approval if birth data is missing ────────────────────────────────
  if (action === 'Approved') {
    const birthComplete = hasBirthData(user_id);
    if (!birthComplete) {
      const err = new Error(
        'Cannot approve: this user has not completed their Birth Information (Step 3). ' +
        'Date of birth, birth time, birth place, latitude, longitude, and timezone are all required before approval.'
      );
      err.statusCode = 422;
      throw err;
    }
  }

  // ── Update account status ──────────────────────────────────────────────────
  db.prepare('UPDATE users SET account_status=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(action, user_id);

  if (reason) {
    db.prepare("UPDATE documents SET admin_notes=? WHERE user_id=? AND doc_type='gov_id'").run(reason, user_id);
  }

  console.log(`[admin] User ${user_id} status changed to ${action} by admin ${adminUserId}`);

  // ── Trigger Kundali generation on approval ─────────────────────────────────
  if (action === 'Approved') {
    // Non-blocking — admin HTTP response is not delayed
    triggerKundaliGeneration(user_id);
    console.log(`[admin] Kundali generation triggered for user ${user_id}`);
  }

  return { user_id, action, kundali_triggered: action === 'Approved' };
}

module.exports = {
  getStats, getRecentSubmissions, getPendingProfiles, getAllUsers,
  getAdminProfile, verifyProfile, deleteUser,
};
