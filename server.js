'use strict';

require('dotenv').config();

const app = require('./src/app');
const env = require('./src/config/env');
const { runMigrations } = require('./src/database/migrations');
const { seedAdmin } = require('./src/database/seeds/admin.seed');

async function bootstrap() {
  console.log('[bootstrap] Running PostgreSQL database migrations...');
  await runMigrations();
  console.log('[bootstrap] Migrations complete.');

  console.log('[bootstrap] Running seeds...');
  await seedAdmin();
  console.log('[bootstrap] Seeds complete.');

  app.listen(env.PORT, () => {
    console.log(`\n🪔  Arundhati API running on http://localhost:${env.PORT}`);
    console.log(`    Environment : ${env.NODE_ENV}`);
    console.log(`    Database    : PostgreSQL (Neon)\n`);
  });
}

bootstrap().catch((err) => {
  console.error('[bootstrap] Fatal startup error:', err);
  process.exit(1);
});
