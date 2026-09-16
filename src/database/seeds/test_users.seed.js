'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../../config/database');

// Test users covering all account statuses and gotra restriction scenarios
// See implementation_plan.md §8 for expected matchmaking outcomes
const TEST_USERS = [
  {
    email: 'arjun@test.local',
    password: 'Test@1234',
    role: 'user',
    account_status: 'Approved',
    profile_managed_by: 'Self',
    profile: {
      first_name: 'Arjun',
      surname: 'Sharma',
      gender: 'Male',
      date_of_birth: '1994-05-12',
      marital_status: 'Unmarried',
      sub_sect: 'Smartha',
      gotra: 'Bharadwaja',
      pravara: 'Angirasa, Barhaspatya, Bharadwaja',
      veda: 'Rigveda',
      shakha: 'Ashvalayana',
      native_place: 'Hyderabad',
      city: 'Hyderabad',
      education: 'B.Tech Computer Science',
      profession: 'Software Engineer',
      employer: 'Tech Corp',
      annual_income: '10–20 LPA',
      hide_income: 0,
      height_cm: 175,
      dietary_habit: 'Sattvic',
    },
  },
  {
    email: 'priya@test.local',
    password: 'Test@1234',
    role: 'user',
    account_status: 'Approved',
    profile_managed_by: 'Self',
    profile: {
      first_name: 'Priya',
      surname: 'Iyer',
      gender: 'Female',
      date_of_birth: '1996-08-22',
      marital_status: 'Unmarried',
      sub_sect: 'Smartha',
      gotra: 'Kausika',
      pravara: 'Viswamitra, Ashtaka, Madhuchandas',
      veda: 'Samaveda',
      native_place: 'Chennai',
      city: 'Bangalore',
      education: 'M.Sc Mathematics',
      profession: 'Data Scientist',
      annual_income: '10–20 LPA',
      hide_income: 0,
      height_cm: 162,
      dietary_habit: 'Strict Vegetarian',
    },
  },
  {
    email: 'kavya@test.local',
    password: 'Test@1234',
    role: 'user',
    account_status: 'Approved',
    profile_managed_by: 'Parent',
    profile: {
      first_name: 'Kavya',
      surname: 'Sharma',
      gender: 'Female',
      date_of_birth: '1997-01-15',
      marital_status: 'Unmarried',
      sub_sect: 'Smartha',
      gotra: 'Bharadwaja', // Same as Arjun — must NOT appear in his feed
      veda: 'Rigveda',
      native_place: 'Pune',
      city: 'Pune',
      education: 'MBA Finance',
      profession: 'Chartered Accountant',
      annual_income: '10–20 LPA',
      hide_income: 1,
      height_cm: 158,
      dietary_habit: 'Strict Vegetarian',
    },
  },
  {
    email: 'ravi@test.local',
    password: 'Test@1234',
    role: 'user',
    account_status: 'Pending_ID',
    profile_managed_by: 'Self',
    profile: {
      first_name: 'Ravi',
      surname: 'Bhat',
      gender: 'Male',
      date_of_birth: '1993-11-03',
      marital_status: 'Unmarried',
      sub_sect: 'Madhwa',
      gotra: 'Atri',
      native_place: 'Mysore',
      city: 'Mysore',
      education: 'B.Com',
      profession: 'Business',
      height_cm: 170,
      dietary_habit: 'Sattvic',
    },
  },
  {
    email: 'meera@test.local',
    password: 'Test@1234',
    role: 'user',
    account_status: 'Rejected',
    profile_managed_by: 'Self',
    profile: {
      first_name: 'Meera',
      surname: 'Joshi',
      gender: 'Female',
      date_of_birth: '1995-03-18',
      marital_status: 'Unmarried',
      sub_sect: 'Smartha',
      gotra: 'Vatsa',
      native_place: 'Nagpur',
      city: 'Nagpur',
      education: 'B.A. Sanskrit',
      profession: 'Teacher',
      height_cm: 160,
      dietary_habit: 'Strict Vegetarian',
    },
  },
];

async function seedTestUsers() {
  const db = getDb();
  for (const u of TEST_USERS) {
    const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get(u.email);
    if (existing) {
      console.log(`[seed] User ${u.email} already exists, skipping.`);
      continue;
    }
    const hash = await bcrypt.hash(u.password, 12);
    const { lastInsertRowid: userId } = db.prepare(`
      INSERT INTO users (email, password_hash, role, account_status, profile_managed_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(u.email, hash, u.role, u.account_status, u.profile_managed_by);

    const p = u.profile;
    const { lastInsertRowid: profileId } = db.prepare(`
      INSERT INTO profiles (
        user_id, first_name, surname, gender, date_of_birth, marital_status,
        sub_sect, gotra, pravara, veda, shakha, native_place, city,
        education, profession, employer, annual_income, hide_income, height_cm, dietary_habit,
        registration_step
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,6)
    `).run(
      userId, p.first_name, p.surname, p.gender, p.date_of_birth, p.marital_status,
      p.sub_sect, p.gotra, p.pravara || null, p.veda || null, p.shakha || null,
      p.native_place, p.city, p.education, p.profession,
      p.employer || null, p.annual_income || null, p.hide_income || 0, p.height_cm,
      p.dietary_habit
    );
    console.log(`[seed] Created user ${u.email} (profile_id=${profileId})`);
  }
}

module.exports = { seedTestUsers };
