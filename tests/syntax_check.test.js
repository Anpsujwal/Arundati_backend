'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Backend syntax and module loading test', async () => {
  // Test requiring core modules
  assert.doesNotThrow(() => require('../src/app'));
  assert.doesNotThrow(() => require('../src/config/env'));
  assert.doesNotThrow(() => require('../src/config/database'));
  assert.doesNotThrow(() => require('../src/utils/jwt.utils'));
  assert.doesNotThrow(() => require('../src/utils/hash.utils'));
  assert.doesNotThrow(() => require('../src/utils/response.utils'));
  assert.doesNotThrow(() => require('../src/utils/sanitize.utils'));
  assert.doesNotThrow(() => require('../src/middleware/auth.middleware'));
  assert.doesNotThrow(() => require('../src/middleware/admin.middleware'));
  assert.doesNotThrow(() => require('../src/middleware/error.middleware'));
  assert.doesNotThrow(() => require('../src/middleware/upload.middleware'));
  assert.doesNotThrow(() => require('../src/modules/auth/auth.service'));
  assert.doesNotThrow(() => require('../src/modules/auth/auth.controller'));
  assert.doesNotThrow(() => require('../src/modules/profile/profile.service'));
  assert.doesNotThrow(() => require('../src/modules/profile/profile.controller'));
  assert.doesNotThrow(() => require('../src/modules/interests/interests.service'));
  assert.doesNotThrow(() => require('../src/modules/matches/grades.service'));
  assert.doesNotThrow(() => require('../src/modules/matches/matchPipeline.service'));
  assert.doesNotThrow(() => require('../src/modules/matches/matches.service'));
  assert.doesNotThrow(() => require('../src/modules/matches/matches.controller'));
  assert.doesNotThrow(() => require('../src/modules/kundali/kundali.service'));
  assert.doesNotThrow(() => require('../src/modules/kundali/kundali.controller'));
  assert.doesNotThrow(() => require('../src/modules/admin/admin.service'));
  assert.doesNotThrow(() => require('../src/modules/admin/admin.controller'));
  assert.doesNotThrow(() => require('../src/database/seeds/admin.seed'));
  assert.doesNotThrow(() => require('../src/database/seeds/gotras.seed'));
  assert.doesNotThrow(() => require('../api/index'));
});
