'use strict';

const { Pool } = require('pg');
const env = require('./env');

let pool = null;

function sanitizeDbUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch (_) {
    return '***';
  }
}

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is required to connect to PostgreSQL (Neon).\n' +
        'Please set DATABASE_URL in your environment or Vercel project settings.'
      );
    }

    const isSsl =
      process.env.NODE_ENV === 'production' ||
      connectionString.includes('sslmode=') ||
      connectionString.includes('neon.tech') ||
      connectionString.includes('ssl=true');

    pool = new Pool({
      connectionString,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      max: env.DB_POOL_MAX || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]:', err.message);
    });

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[database] PostgreSQL connection pool initialized (${sanitizeDbUrl(connectionString)})`);
    }
  }

  return pool;
}

async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

async function queryOne(text, params) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

async function queryRows(text, params) {
  const res = await query(text, params);
  return res.rows;
}

async function getClient() {
  const p = getPool();
  return p.connect();
}

/**
 * Execute a unit of work inside an isolated database transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and releases the client.
 */
async function transaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error('[database] Transaction rollback error:', rbErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  query,
  queryOne,
  queryRows,
  getClient,
  transaction,
  closePool,
};
