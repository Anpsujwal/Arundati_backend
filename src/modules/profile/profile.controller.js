'use strict';

const profileService = require('./profile.service');
const { success, created, badRequest } = require('../../utils/response.utils');
const fs = require('fs');
const path = require('path');

async function getMe(req, res, next) {
  try {
    const data = await profileService.getMyProfile(req.user.user_id);
    return success(res, data);
  } catch (err) { next(err); }
}

async function step1(req, res, next) {
  try {
    const profile = await profileService.saveStep1(req.user.user_id, req.body);
    return success(res, { profile }, 'Basic information saved.');
  } catch (err) { next(err); }
}

async function step2(req, res, next) {
  try {
    const profile = await profileService.saveStep2(req.user.user_id, req.body);
    return success(res, { profile }, 'Lineage information saved.');
  } catch (err) { next(err); }
}

async function step3(req, res, next) {
  try {
    const result = await profileService.saveStep3(req.user.user_id, req.body);
    return success(res, result, 'Birth information saved.');
  } catch (err) { next(err); }
}

async function step4(req, res, next) {
  try {
    const profile = await profileService.saveStep4(req.user.user_id, req.body);
    return success(res, { profile }, 'Education & profession saved.');
  } catch (err) { next(err); }
}

async function step5(req, res, next) {
  try {
    const profile = await profileService.saveStep5(req.user.user_id, req.body);
    return success(res, { profile }, 'Family information saved.');
  } catch (err) { next(err); }
}

async function step6(req, res, next) {
  try {
    const profile = await profileService.finalizeRegistration(req.user.user_id);
    return success(res, { profile }, 'Profile submitted successfully. Pending ID verification.');
  } catch (err) { next(err); }
}

async function step7(req, res, next) {
  try {
    const profile = await profileService.saveStep7(req.user.user_id, req.body);
    return success(res, { profile }, 'Preferences saved.');
  } catch (err) { next(err); }
}

async function uploadPhoto(req, res, next) {
  try {
    if (!req.file) return badRequest(res, 'No photo file provided.');
    const photo = await profileService.savePhoto(req.user.user_id, req.file.filename);
    return created(res, { photo }, 'Photo uploaded successfully.');
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    next(err);
  }
}

async function deletePhoto(req, res, next) {
  try {
    const { id } = req.params;
    const result = await profileService.deletePhoto(req.user.user_id, parseInt(id, 10));
    const filePath = path.resolve(__dirname, '../../../uploads/photos', result.filename);
    try { fs.unlinkSync(filePath); } catch (_) {}
    return success(res, null, 'Photo deleted.');
  } catch (err) { next(err); }
}

async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return badRequest(res, 'No document file provided.');
    const doc = await profileService.saveDocument(req.user.user_id, req.body.doc_type || 'gov_id', req.file.filename);
    return created(res, { doc }, 'Document uploaded successfully.');
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    next(err);
  }
}

module.exports = {
  getMe,
  step1,
  step2,
  step3,
  step4,
  step5,
  step6,
  step7,
  uploadPhoto,
  deletePhoto,
  uploadDocument,
};
