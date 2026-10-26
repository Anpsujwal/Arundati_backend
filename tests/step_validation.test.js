'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const profileService = require('../src/modules/profile/profile.service');
const db = require('../src/config/database');

test('Step validation blocks saveStep7 when mandatory fields across 7 steps are missing', async () => {
  const originalQueryOne = db.queryOne;
  const originalQueryRows = db.queryRows;

  try {
    // Mock incomplete profile (missing gotra, sub-sect, photo, etc.)
    db.queryOne = async (sql, params) => {
      if (sql.includes('FROM profiles')) {
        return {
          profile_id: 1,
          user_id: 1,
          first_name: 'Arjun',
          surname: 'Sharma',
          gender: 'Male',
          date_of_birth: '1995-05-10',
          marital_status: 'Never Married',
          sub_sect: '', // missing
          gotra: '', // missing
          education: 'B.Tech',
          profession: 'Engineer',
          city: 'Hyderabad',
          height_cm: 175,
          annual_income: '15-25 LPA',
          dietary_habit: 'Strict Vegetarian',
        };
      }
      if (sql.includes('FROM astro_data')) {
        return { profile_id: 1, birth_time: '10:30', birth_place: 'Hyderabad', timezone: 'Asia/Kolkata' };
      }
      if (sql.includes('FROM family_info')) {
        return { profile_id: 1, father_name: 'Venkata', mother_name: 'Lakshmi' };
      }
      return null;
    };
    db.queryRows = async (sql) => {
      if (sql.includes('FROM profile_photos')) return []; // missing photo
      return [];
    };

    const validation = await profileService.validateProfileSteps(1);
    assert.equal(validation.isComplete, false);
    assert.equal(validation.steps.step2.complete, false);
    assert.deepEqual(validation.steps.step2.missing, ['Sub-sect', 'Gotra']);
    assert.equal(validation.steps.step6.complete, false);
    assert.deepEqual(validation.steps.step6.missing, ['At least 1 profile photo']);

    // Attempting to call saveStep7 should throw an error
    await assert.rejects(
      async () => {
        await profileService.saveStep7(1, { pref_sub_sect: 'Smartha' });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.ok(err.message.includes('All 7 steps and mandatory fields must be completed'));
        return true;
      }
    );
  } finally {
    db.queryOne = originalQueryOne;
    db.queryRows = originalQueryRows;
  }
});

test('Step validation passes when all mandatory fields are filled', async () => {
  const originalQueryOne = db.queryOne;
  const originalQueryRows = db.queryRows;
  const originalQuery = db.query;

  try {
    db.queryOne = async (sql) => {
      if (sql.includes('FROM profiles')) {
        return {
          profile_id: 1,
          user_id: 1,
          first_name: 'Arjun',
          surname: 'Sharma',
          gender: 'Male',
          date_of_birth: '1995-05-10',
          marital_status: 'Never Married',
          sub_sect: 'Smartha',
          gotra: 'Kashyapa',
          education: 'B.Tech',
          profession: 'Engineer',
          city: 'Hyderabad',
          height_cm: 175,
          annual_income: '15-25 LPA',
          dietary_habit: 'Strict Vegetarian',
        };
      }
      if (sql.includes('FROM astro_data')) {
        return { profile_id: 1, birth_time: '10:30', birth_place: 'Hyderabad', timezone: 'Asia/Kolkata' };
      }
      if (sql.includes('FROM family_info')) {
        return { profile_id: 1, father_name: 'Venkata', mother_name: 'Lakshmi' };
      }
      return null;
    };
    db.queryRows = async (sql) => {
      if (sql.includes('FROM profile_photos')) return [{ photo_id: 1, filename: 'p1.jpg', is_primary: 1 }];
      return [];
    };
    db.query = async () => ({ rows: [] });

    const validation = await profileService.validateProfileSteps(1);
    assert.equal(validation.isComplete, true);
    assert.equal(validation.steps.step1.complete, true);
    assert.equal(validation.steps.step2.complete, true);
    assert.equal(validation.steps.step3.complete, true);
    assert.equal(validation.steps.step4.complete, true);
    assert.equal(validation.steps.step5.complete, true);
    assert.equal(validation.steps.step6.complete, true);
  } finally {
    db.queryOne = originalQueryOne;
    db.queryRows = originalQueryRows;
    db.query = originalQuery;
  }
});
