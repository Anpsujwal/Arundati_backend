'use strict';

const kundaliService = require('./kundali.service');
const { success } = require('../../utils/response.utils');

/** GET /api/v1/kundali/me — current user's own Kundali (public fields) */
async function getMyKundali(req, res, next) {
  try {
    const data = await kundaliService.getKundaliForUser(req.user.user_id);
    return success(res, data);
  } catch (err) { next(err); }
}

/** GET /api/v1/kundali/me/chart — normalized chart JSON for the frontend chart renderer */
async function getMyChartData(req, res, next) {
  try {
    const data = await kundaliService.getChartData(req.user.user_id);
    return success(res, data);
  } catch (err) { next(err); }
}

/** POST /api/v1/admin/users/:userId/kundali/retry — admin retry */
async function retryKundali(req, res, next) {
  try {
    const userId = parseInt(req.params.userId, 10);
    const result = await kundaliService.retryKundaliGeneration(userId);
    return success(res, result);
  } catch (err) { next(err); }
}

/** GET /api/v1/admin/users/:userId/kundali — admin view kundali status */
async function getKundaliAdmin(req, res, next) {
  try {
    const userId = parseInt(req.params.userId, 10);
    const data = await kundaliService.getKundaliAdmin(userId);
    return success(res, data);
  } catch (err) { next(err); }
}

module.exports = { getMyKundali, getMyChartData, retryKundali, getKundaliAdmin };
