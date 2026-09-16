'use strict';

const matchesService = require('./matches.service');
const { success } = require('../../utils/response.utils');

function getFeed(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const result = matchesService.getMatchFeed(req.user.user_id, { page, limit });
    return success(res, result);
  } catch (err) { next(err); }
}

function getProfile(req, res, next) {
  try {
    const candidateId = parseInt(req.params.id, 10);
    const result = matchesService.getCandidateProfile(req.user.user_id, candidateId);
    return success(res, result);
  } catch (err) { next(err); }
}

module.exports = { getFeed, getProfile };
