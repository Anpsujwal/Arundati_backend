'use strict';

require('dotenv').config();

const env = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_CHANGE_IN_PRODUCTION',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_nfmbCUPMl13F@ep-weathered-term-b38pbokx-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  MAX_PHOTO_SIZE_MB: parseInt(process.env.MAX_PHOTO_SIZE_MB, 10) || 5,
  MAX_DOC_SIZE_MB: parseInt(process.env.MAX_DOC_SIZE_MB, 10) || 10,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  ASTRO_SERVICE_URL: (process.env.ASTRO_SERVICE_URL || 'https://arundati-kundali-backend-n8q1.onrender.com').replace(/\/+$/, ''),
};

module.exports = env;
