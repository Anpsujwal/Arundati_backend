'use strict';

require('dotenv').config();

const env = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_CHANGE_IN_PRODUCTION',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  DB_PATH: process.env.DB_PATH || './data/arundhati.db',
  MAX_PHOTO_SIZE_MB: parseInt(process.env.MAX_PHOTO_SIZE_MB, 10) || 5,
  MAX_DOC_SIZE_MB: parseInt(process.env.MAX_DOC_SIZE_MB, 10) || 10,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

module.exports = env;
