'use strict';

const env = require('../config/env');

/**
 * Centralised error handler.
 * Must be registered LAST in Express middleware chain.
 * Never exposes stack traces or internal details in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isDev = env.NODE_ENV === 'development';

  // Log full error server-side always
  console.error('[ERROR]', err.message);
  if (isDev) console.error(err.stack);

  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode < 500
    ? err.message
    : 'An internal server error occurred. Please try again later.';

  return res.status(statusCode).json({
    success: false,
    message,
    // Only expose stack in development
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
