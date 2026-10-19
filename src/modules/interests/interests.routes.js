'use strict';

const express = require('express');
const router = express.Router();
const service = require('./interests.service');
const { authenticate, requireApproved } = require('../../middleware/auth.middleware');
const { success, created } = require('../../utils/response.utils');

router.post('/send', authenticate, requireApproved, async (req, res, next) => {
  try {
    const result = await service.sendInterest(req.user.user_id, parseInt(req.body.receiver_profile_id, 10));
    return created(res, result, 'Interest sent successfully.');
  } catch (e) { next(e); }
});

router.post('/respond', authenticate, requireApproved, async (req, res, next) => {
  try {
    const result = await service.respondInterest(req.user.user_id, parseInt(req.body.interest_id, 10), req.body.action);
    return success(res, result, 'Response recorded.');
  } catch (e) { next(e); }
});

router.get('/sent', authenticate, requireApproved, async (req, res, next) => {
  try {
    const data = await service.getSentInterests(req.user.user_id);
    return success(res, data);
  } catch (e) { next(e); }
});

router.get('/received', authenticate, requireApproved, async (req, res, next) => {
  try {
    const data = await service.getReceivedInterests(req.user.user_id);
    return success(res, data);
  } catch (e) { next(e); }
});

module.exports = router;
