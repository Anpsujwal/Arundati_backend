'use strict';

const adminService = require('./admin.service');
const { success } = require('../../utils/response.utils');

async function getStats(req, res, next) {
  try {
    const result = await adminService.getStats();
    return success(res, result);
  } catch (e) { next(e); }
}

async function getRecent(req, res, next) {
  try {
    const result = await adminService.getRecentSubmissions();
    return success(res, result);
  } catch (e) { next(e); }
}

async function getPending(req, res, next) {
  try {
    const result = await adminService.getPendingProfiles();
    return success(res, result);
  } catch (e) { next(e); }
}

async function getAllUsers(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    const result = await adminService.getAllUsers({ status, page: +page, limit: +limit });
    return success(res, result);
  } catch (e) { next(e); }
}

async function getProfile(req, res, next) {
  try {
    const result = await adminService.getAdminProfile(parseInt(req.params.id, 10));
    return success(res, result);
  } catch (e) { next(e); }
}

async function verify(req, res, next) {
  try {
    const result = await adminService.verifyProfile(req.user.user_id, req.body);
    return success(res, result, `Profile ${req.body.action} successfully.`);
  } catch (e) { next(e); }
}

async function deleteUser(req, res, next) {
  try {
    const result = await adminService.deleteUser(parseInt(req.params.id, 10));
    return success(res, result, 'User permanently deleted.');
  } catch (e) { next(e); }
}

module.exports = { getStats, getRecent, getPending, getAllUsers, getProfile, verify, deleteUser };
