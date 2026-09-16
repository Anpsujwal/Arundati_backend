'use strict';

/**
 * Standard API response envelope.
 * All API responses use these helpers to ensure consistency.
 */

function success(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function created(res, data = null, message = 'Created successfully') {
  return success(res, data, message, 201);
}

function error(res, message = 'An error occurred', statusCode = 500, errors = null) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}

function notFound(res, message = 'Resource not found') {
  return error(res, message, 404);
}

function unauthorized(res, message = 'Authentication required') {
  return error(res, message, 401);
}

function forbidden(res, message = 'Access denied') {
  return error(res, message, 403);
}

function badRequest(res, message = 'Bad request', errors = null) {
  return error(res, message, 400, errors);
}

module.exports = { success, created, error, notFound, unauthorized, forbidden, badRequest };
