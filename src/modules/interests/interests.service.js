'use strict';

const db = require('../../config/database');

async function sendInterest(senderUserId, receiverProfileId) {
  const senderProfile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [senderUserId]);
  if (!senderProfile) {
    const e = new Error('Your profile not found.');
    e.statusCode = 404;
    throw e;
  }
  if (senderProfile.profile_id === receiverProfileId) {
    const e = new Error('Cannot send interest to yourself.');
    e.statusCode = 400;
    throw e;
  }
  const receiver = await db.queryOne(`
    SELECT p.*, u.account_status
    FROM profiles p
    JOIN users u ON u.user_id = p.user_id
    WHERE p.profile_id = $1
  `, [receiverProfileId]);

  if (!receiver || receiver.account_status !== 'Approved') {
    const e = new Error('Profile not available.');
    e.statusCode = 404;
    throw e;
  }

  try {
    await db.query(`
      INSERT INTO interests (sender_profile_id, receiver_profile_id)
      VALUES ($1, $2)
    `, [senderProfile.profile_id, receiverProfileId]);
  } catch (err) {
    if (err.code === '23505' || err.message.includes('unique') || err.message.includes('UNIQUE')) {
      const e = new Error('You have already expressed interest in this profile.');
      e.statusCode = 409;
      throw e;
    }
    throw err;
  }
  return { status: 'Pending' };
}

async function respondInterest(userId, interestId, action) {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!profile) {
    const e = new Error('Profile not found.');
    e.statusCode = 404;
    throw e;
  }
  const interest = await db.queryOne(`
    SELECT * FROM interests WHERE interest_id = $1 AND receiver_profile_id = $2
  `, [interestId, profile.profile_id]);

  if (!interest) {
    const e = new Error('Interest not found.');
    e.statusCode = 404;
    throw e;
  }
  if (!['Accepted', 'Declined'].includes(action)) {
    const e = new Error('Invalid action.');
    e.statusCode = 400;
    throw e;
  }

  await db.query(`
    UPDATE interests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE interest_id = $2
  `, [action, interestId]);

  return { interest_id: interestId, status: action };
}

async function getSentInterests(userId) {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!profile) return [];

  return db.queryRows(`
    SELECT i.*, p.first_name, p.surname, p.gotra, p.city,
           (SELECT filename FROM profile_photos WHERE profile_id=p.profile_id AND is_primary=1 LIMIT 1) as photo
    FROM interests i
    JOIN profiles p ON p.profile_id = i.receiver_profile_id
    WHERE i.sender_profile_id = $1
    ORDER BY i.created_at DESC
  `, [profile.profile_id]);
}

async function getReceivedInterests(userId) {
  const profile = await db.queryOne('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!profile) return [];

  return db.queryRows(`
    SELECT i.*, p.first_name, p.surname, p.gotra, p.city,
           (SELECT filename FROM profile_photos WHERE profile_id=p.profile_id AND is_primary=1 LIMIT 1) as photo
    FROM interests i
    JOIN profiles p ON p.profile_id = i.sender_profile_id
    WHERE i.receiver_profile_id = $1
    ORDER BY i.created_at DESC
  `, [profile.profile_id]);
}

module.exports = { sendInterest, respondInterest, getSentInterests, getReceivedInterests };
