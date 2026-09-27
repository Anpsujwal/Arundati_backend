'use strict';

const adminService = require('./admin.service');
const { success } = require('../../utils/response.utils');

function getStats(req, res, next) {
  try { return success(res, adminService.getStats()); } catch (e) { next(e); }
}

function getRecent(req, res, next) {
  try { return success(res, adminService.getRecentSubmissions()); } catch (e) { next(e); }
}

function getPending(req, res, next) {
  try { return success(res, adminService.getPendingProfiles()); } catch (e) { next(e); }
}

function getAllUsers(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    return success(res, adminService.getAllUsers({ status, page: +page, limit: +limit }));
  } catch (e) { next(e); }
}

function getProfile(req, res, next) {
  try {
    return success(res, adminService.getAdminProfile(parseInt(req.params.id, 10)));
  } catch (e) { next(e); }
}

function verify(req, res, next) {
  try {
    const result = adminService.verifyProfile(req.user.user_id, req.body);
    return success(res, result, `Profile ${req.body.action} successfully.`);
  } catch (e) { next(e); }
}

function deleteUser(req, res, next) {
  try {
    const result = adminService.deleteUser(parseInt(req.params.id, 10));
    return success(res, result, 'User permanently deleted.');
  } catch (e) { next(e); }
}

module.exports = { getStats, getRecent, getPending, getAllUsers, getProfile, verify, deleteUser };
