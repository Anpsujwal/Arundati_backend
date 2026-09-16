'use strict';

require('dotenv').config();

const app = require('./src/app');
const env = require('./src/config/env');
const { getDb } = require('./src/config/database');

// Run all migrations then seeds, then start
async function bootstrap() {
  console.log('[bootstrap] Running database migrations...');
  const migrations = [
    require('./src/database/migrations/001_users'),
    require('./src/database/migrations/002_profiles'),
    require('./src/database/migrations/003_astro'),
    require('./src/database/migrations/004_family'),
    require('./src/database/migrations/005_photos'),
    require('./src/database/migrations/006_documents'),
    require('./src/database/migrations/007_interests'),
    require('./src/database/migrations/008_schema_v2'),
  ];
  for (const m of migrations) m.up();
  console.log('[bootstrap] Migrations complete.');

  console.log('[bootstrap] Running seeds...');
  const { seedAdmin } = require('./src/database/seeds/admin.seed');
  const { seedTestUsers } = require('./src/database/seeds/test_users.seed');
  await seedAdmin();
  if (env.NODE_ENV === 'development') {
    await seedTestUsers();
  }
  console.log('[bootstrap] Seeds complete.');

  app.listen(env.PORT, () => {
    console.log(`\n🪔  Arundhati API running on http://localhost:${env.PORT}`);
    console.log(`    Environment : ${env.NODE_ENV}`);
    console.log(`    Database    : ${env.DB_PATH}\n`);
  });
}

bootstrap().catch((err) => {
  console.error('[bootstrap] Fatal error:', err);
  process.exit(1);
});
