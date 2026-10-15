'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./matches.controller');
const { authenticate, requireApproved } = require('../../middleware/auth.middleware');

const guard = [authenticate, requireApproved];

router.get('/feed',                      ...guard, controller.getFeed);
router.get('/profile/:id',               ...guard, controller.getProfile);
router.get('/profile/:id/compatibility', ...guard, controller.getCompatibility);
router.post('/grade',                    ...guard, controller.setGrade);
router.get('/grades',                    ...guard, controller.getGrades);

module.exports = router;
