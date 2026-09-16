'use strict';

const authService = require('./auth.service');
const { success, created, error } = require('../../utils/response.utils');
const env = require('../../config/env');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

async function register(req, res, next) {
  try {
    const { email, password, profile_managed_by } = req.body;
    const result = await authService.register({ email, password, profile_managed_by });
    res.cookie('token', result.token, COOKIE_OPTIONS);
    return created(res, { user: result.user, token: result.token }, 'Registration successful.');
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    res.cookie('token', result.token, COOKIE_OPTIONS);
    return success(res, { user: result.user, token: result.token }, 'Login successful.');
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie('token');
  return success(res, null, 'Logged out successfully.');
}

function me(req, res, next) {
  try {
    const result = authService.getMe(req.user.user_id);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, me };
