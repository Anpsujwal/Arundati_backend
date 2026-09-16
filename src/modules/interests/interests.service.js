'use strict';

const { getDb } = require('../../config/database');

function sendInterest(senderUserId, receiverProfileId) {
  const db = getDb();
  const senderProfile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(senderUserId);
  if (!senderProfile) { const e = new Error('Your profile not found.'); e.statusCode=404; throw e; }
  if (senderProfile.profile_id === receiverProfileId) {
    const e = new Error('Cannot send interest to yourself.'); e.statusCode=400; throw e;
  }
  const receiver = db.prepare(`
    SELECT p.*, u.account_status FROM profiles p JOIN users u ON u.user_id=p.user_id WHERE p.profile_id=?
  `).get(receiverProfileId);
  if (!receiver || receiver.account_status !== 'Approved') {
    const e = new Error('Profile not available.'); e.statusCode=404; throw e;
  }
  try {
    db.prepare(`
      INSERT INTO interests (sender_profile_id, receiver_profile_id) VALUES (?,?)
    `).run(senderProfile.profile_id, receiverProfileId);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      const e = new Error('You have already expressed interest in this profile.'); e.statusCode=409; throw e;
    }
    throw err;
  }
  return { status: 'Pending' };
}

function respondInterest(userId, interestId, action) {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
  const interest = db.prepare('SELECT * FROM interests WHERE interest_id=? AND receiver_profile_id=?').get(interestId, profile.profile_id);
  if (!interest) { const e = new Error('Interest not found.'); e.statusCode=404; throw e; }
  if (!['Accepted','Declined'].includes(action)) { const e = new Error('Invalid action.'); e.statusCode=400; throw e; }
  db.prepare('UPDATE interests SET status=?, updated_at=CURRENT_TIMESTAMP WHERE interest_id=?').run(action, interestId);
  return { interest_id: interestId, status: action };
}

function getSentInterests(userId) {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
  if (!profile) return [];
  return db.prepare(`
    SELECT i.*, p.first_name, p.surname, p.gotra, p.city,
           (SELECT filename FROM profile_photos WHERE profile_id=p.profile_id AND is_primary=1 LIMIT 1) as photo
    FROM interests i JOIN profiles p ON p.profile_id=i.receiver_profile_id
    WHERE i.sender_profile_id=? ORDER BY i.created_at DESC
  `).all(profile.profile_id);
}

function getReceivedInterests(userId) {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
  if (!profile) return [];
  return db.prepare(`
    SELECT i.*, p.first_name, p.surname, p.gotra, p.city,
           (SELECT filename FROM profile_photos WHERE profile_id=p.profile_id AND is_primary=1 LIMIT 1) as photo
    FROM interests i JOIN profiles p ON p.profile_id=i.sender_profile_id
    WHERE i.receiver_profile_id=? ORDER BY i.created_at DESC
  `).all(profile.profile_id);
}

module.exports = { sendInterest, respondInterest, getSentInterests, getReceivedInterests };
