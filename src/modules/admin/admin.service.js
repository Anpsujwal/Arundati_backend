'use strict';

const { getDb } = require('../../config/database');
const { adminProfile } = require('../../utils/sanitize.utils');

function getStats() {
  const db = getDb();
  const total       = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user'").get().c;
  const pending     = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Pending_ID'").get().c;
  const approved    = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Approved'").get().c;
  const rejected    = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Rejected'").get().c;
  const suspended   = db.prepare("SELECT COUNT(*) as c FROM users WHERE account_status='Suspended'").get().c;
  return { total, pending, approved, rejected, suspended };
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
           p.profile_id, p.first_name, p.surname, p.gender, p.gotra, p.city
    FROM users u LEFT JOIN profiles p ON p.user_id = u.user_id
    ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?
  `).all(...params);

  const countParams = status ? [status] : [];
  const total = db.prepare(`SELECT COUNT(*) as c FROM users u ${where.replace(' LIMIT ? OFFSET ?','')}`).get(...countParams)?.c || 0;

  return { users, pagination: { page, limit, total } };
}

function getAdminProfile(profileId) {
  const db = getDb();
  const profile = db.prepare('SELECT p.*, u.email, u.account_status, u.created_at as user_created FROM profiles p JOIN users u ON u.user_id=p.user_id WHERE p.profile_id=?').get(profileId);
  if (!profile) {
    const err = new Error('Profile not found.'); err.statusCode = 404; throw err;
  }
  const family = db.prepare('SELECT * FROM family_info WHERE profile_id=?').get(profileId);
  const astro  = db.prepare('SELECT * FROM astro_data WHERE profile_id=?').get(profileId);
  const photos = db.prepare('SELECT * FROM profile_photos WHERE profile_id=?').all(profileId);
  const docs   = db.prepare('SELECT doc_id, doc_type, uploaded_at FROM documents WHERE user_id=?').all(profile.user_id);
  return adminProfile(profile, family, astro, photos, docs);
}

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
  db.prepare('UPDATE users SET account_status=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(action, user_id);
  if (reason) {
    // Store admin note on latest gov_id document
    db.prepare("UPDATE documents SET admin_notes=? WHERE user_id=? AND doc_type='gov_id'").run(reason, user_id);
  }
  console.log(`[admin] User ${user_id} status changed to ${action} by admin ${adminUserId}`);
  return { user_id, action };
}

module.exports = { getStats, getRecentSubmissions, getPendingProfiles, getAllUsers, getAdminProfile, verifyProfile };
