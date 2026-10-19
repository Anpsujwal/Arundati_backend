'use strict';

const matchesService = require('./matches.service');
const gradesService  = require('./grades.service');
const { success, created } = require('../../utils/response.utils');

async function getFeed(req, res, next) {
  try {
    const page  = parseInt(req.query.page,  10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const result = await matchesService.getMatchFeed(req.user.user_id, { page, limit });
    return success(res, result);
  } catch (err) { next(err); }
}

async function getProfile(req, res, next) {
  try {
    const candidateId = parseInt(req.params.id, 10);
    const result = await matchesService.getCandidateProfile(req.user.user_id, candidateId);
    return success(res, result);
  } catch (err) { next(err); }
}

async function getCompatibility(req, res, next) {
  try {
    const candidateProfileId = parseInt(req.params.id, 10);
    const result = await matchesService.getCompatibilityDetail(req.user.user_id, candidateProfileId);
    return success(res, result);
  } catch (err) { next(err); }
}

async function setGrade(req, res, next) {
  try {
    const profileId = parseInt(req.body.profile_id, 10);
    const { grade } = req.body;
    const result = await gradesService.gradeProfile(req.user.user_id, profileId, grade);
    return created(res, result, 'Grade saved.');
  } catch (err) { next(err); }
}

async function getGrades(req, res, next) {
  try {
    const result = await gradesService.getUserGrades(req.user.user_id);
    return success(res, result);
  } catch (err) { next(err); }
}

module.exports = { getFeed, getProfile, getCompatibility, setGrade, getGrades };
