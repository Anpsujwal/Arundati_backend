'use strict';

const { verifyToken } = require('../utils/jwt.utils');
const { unauthorized, forbidden } = require('../utils/response.utils');
const db = require('../config/database');

/**
 * Auth middleware.
 * Accepts JWT from:
 *   1. httpOnly cookie: `token`
 *   2. Authorization: Bearer <token> header (for future Flutter/API clients)
 */
async function authenticate(req, res, next) {
  let token;

  // 1. Check cookie first
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 2. Fallback to Authorization header
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return unauthorized(res, 'Authentication required. Please log in.');
  }

  try {
    const decoded = verifyToken(token);

    // Verify user still exists and is not suspended
    const user = await db.queryOne(
      'SELECT user_id, email, role, account_status FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (!user) {
      return unauthorized(res, 'User no longer exists.');
    }

    if (user.account_status === 'Suspended') {
      return unauthorized(res, 'Your account has been suspended. Please contact support.');
    }

    req.user = user;
    next();
  } catch (err) {
    return unauthorized(res, 'Invalid or expired session. Please log in again.');
  }
}

/**
 * Middleware to require Approved account status.
 * Use AFTER authenticate.
 */
function requireApproved(req, res, next) {
  if (req.user.account_status !== 'Approved') {
    return forbidden(res, 'Your profile must be verified and approved to access this feature.');
  }
  next();
}

module.exports = { authenticate, requireApproved };
