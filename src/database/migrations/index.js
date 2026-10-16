'use strict';

const migrations = [
  require('./001_users'),
  require('./002_profiles'),
  require('./003_astro'),
  require('./004_family'),
  require('./005_photos'),
  require('./006_documents'),
  require('./007_interests'),
  require('./008_schema_v2'),
  require('./009_kundali'),
  require('./010_kundali_matches'),
  require('./011_profile_grades'),
];

module.exports = { migrations };
