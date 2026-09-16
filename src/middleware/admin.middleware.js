'use strict';

const { forbidden } = require('../utils/response.utils');

/**
 * Admin authorization middleware.
 * Must be used AFTER authenticate().
 * Never rely on frontend route hiding for admin access control.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return forbidden(res, 'Admin access required.');
  }
  next();
}

module.exports = { requireAdmin };
