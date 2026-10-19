'use strict';

const db = require('../../config/database');
const { adminProfile } = require('../../utils/sanitize.utils');
const { hasBirthData, triggerKundaliGeneration, getKundaliAdmin } = require('../kundali/kundali.service');

async function getStats() {
  const userStats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE role = 'user') AS total,
      COUNT(*) FILTER (WHERE account_status = 'Pending_ID' AND role = 'user') AS pending,
      COUNT(*) FILTER (WHERE account_status = 'Approved' AND role = 'user') AS approved,
      COUNT(*) FILTER (WHERE account_status = 'Rejected' AND role = 'user') AS rejected,
      COUNT(*) FILTER (WHERE account_status = 'Suspended' AND role = 'user') AS suspended
    FROM users
  `);

  const kundaliStats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE kundali_status = 'GENERATED') AS generated,
      COUNT(*) FILTER (WHERE kundali_status = 'FAILED') AS failed,
      COUNT(*) FILTER (WHERE kundali_status IN ('GENERATING', 'NOT_GENERATED', 'INCOMPLETE_BIRTH_DATA')) AS pending
    FROM kundalis
  `);

  return {
    total:     parseInt(userStats?.total || 0, 10),
    pending:   parseInt(userStats?.pending || 0, 10),
    approved:  parseInt(userStats?.approved || 0, 10),
    rejected:  parseInt(userStats?.rejected || 0, 10),
    suspended: parseInt(userStats?.suspended || 0, 10),
    kundali: {
      generated: parseInt(kundaliStats?.generated || 0, 10),
      failed:    parseInt(kundaliStats?.failed || 0, 10),
      pending:   parseInt(kundaliStats?.pending || 0, 10),
    },
  };
}

async function getRecentSubmissions(limit = 10) {
  return db.queryRows(`
    SELECT u.user_id, u.email, u.account_status, u.created_at,
           p.profile_id, p.first_name, p.surname, p.gender, p.gotra, p.registration_step
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.user_id
    WHERE u.role = 'user'
    ORDER BY u.created_at DESC
    LIMIT $1
  `, [limit]);
}

async function getPendingProfiles() {
  return db.queryRows(`
    SELECT u.user_id, u.email, u.account_status, u.created_at,
           p.profile_id, p.first_name, p.surname, p.gender, p.gotra, p.registration_step,
           p.city, p.sub_sect,
           (SELECT doc_id FROM documents WHERE user_id = u.user_id AND doc_type = 'gov_id' LIMIT 1) as has_gov_id
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.user_id
    WHERE u.account_status = 'Pending_ID' AND u.role = 'user'
    ORDER BY u.created_at ASC
  `);
}

async function getAllUsers({ status, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  let where = "WHERE u.role = 'user'";
  const params = [];
  if (status) {
    where += ' AND u.account_status = $1';
    params.push(status);
  }

  const limitParamIdx = params.length + 1;
  const offsetParamIdx = params.length + 2;

  const users = await db.queryRows(`
    SELECT u.user_id, u.email, u.account_status, u.created_at,
           p.profile_id, p.first_name, p.surname, p.gender, p.gotra, p.city,
           k.kundali_status
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.user_id
    LEFT JOIN kundalis k ON k.user_id = u.user_id
    ${where} ORDER BY u.created_at DESC LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `, [...params, limit, offset]);

  const countRow = await db.queryOne(`SELECT COUNT(*) as c FROM users u ${where}`, params);
  const total = parseInt(countRow?.c || 0, 10);

  return { users, pagination: { page, limit, total } };
}

async function getAdminProfile(profileId) {
  const profile = await db.queryOne(`
    SELECT p.*, u.email, u.account_status, u.created_at as user_created, u.user_id
    FROM profiles p
    JOIN users u ON u.user_id = p.user_id
    WHERE p.profile_id = $1
  `, [profileId]);

  if (!profile) {
    const err = new Error('Profile not found.'); err.statusCode = 404; throw err;
  }

  const family  = await db.queryOne('SELECT * FROM family_info WHERE profile_id = $1', [profileId]);
  const astro   = await db.queryOne('SELECT * FROM astro_data WHERE profile_id = $1', [profileId]);
  const photos  = await db.queryRows('SELECT * FROM profile_photos WHERE profile_id = $1', [profileId]);
  const docs    = await db.queryRows('SELECT doc_id, doc_type, uploaded_at FROM documents WHERE user_id = $1', [profile.user_id]);
  const kundali = await getKundaliAdmin(profile.user_id);

  return { ...adminProfile(profile, family, astro, photos, docs), kundali };
}

/**
 * Permanently delete a user and ALL their associated data.
 */
async function deleteUser(userId) {
  const user = await db.queryOne('SELECT * FROM users WHERE user_id = $1', [userId]);
  if (!user) {
    const err = new Error('User not found.'); err.statusCode = 404; throw err;
  }
  if (user.role === 'admin') {
    const err = new Error('Cannot delete an admin account.'); err.statusCode = 403; throw err;
  }

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

      // 6. Profile row
      await client.query('DELETE FROM profiles WHERE profile_id = $1', [profile.profile_id]);
    }

    // 7. User row — foreign keys CASCADE will auto-remove kundalis + kundali_matches
    await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
  });

  console.log(`[admin] User ${userId} permanently deleted.`);
  return { user_id: userId, deleted: true };
}

/**
 * Verify (approve / reject / suspend) a user profile.
 */
async function verifyProfile(adminUserId, { user_id, action, reason }) {
  const validActions = ['Approved', 'Rejected', 'Suspended'];
  if (!validActions.includes(action)) {
    const err = new Error('Invalid action.'); err.statusCode = 400; throw err;
  }

  const user = await db.queryOne('SELECT * FROM users WHERE user_id = $1', [user_id]);
  if (!user) {
    const err = new Error('User not found.'); err.statusCode = 404; throw err;
  }

  // Block approval if birth data is missing
  if (action === 'Approved') {
    const birthComplete = await hasBirthData(user_id);
    if (!birthComplete) {
      const err = new Error(
        'Cannot approve: this user has not completed their Birth Information (Step 3). ' +
        'Date of birth, birth time, birth place, latitude, longitude, and timezone are all required before approval.'
      );
      err.statusCode = 422;
      throw err;
    }
  }

  await db.query('UPDATE users SET account_status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [
    action,
    user_id,
  ]);

  if (reason) {
    await db.query("UPDATE documents SET admin_notes = $1 WHERE user_id = $2 AND doc_type = 'gov_id'", [
      reason,
      user_id,
    ]);
  }

  console.log(`[admin] User ${user_id} status changed to ${action} by admin ${adminUserId}`);

  if (action === 'Approved') {
    await triggerKundaliGeneration(user_id);
    console.log(`[admin] Kundali generation triggered for user ${user_id}`);
  }

  return { user_id, action, kundali_triggered: action === 'Approved' };
}

module.exports = {
  getStats,
  getRecentSubmissions,
  getPendingProfiles,
  getAllUsers,
  getAdminProfile,
  verifyProfile,
  deleteUser,
};
