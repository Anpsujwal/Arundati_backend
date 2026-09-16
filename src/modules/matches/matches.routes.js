'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./matches.controller');
const { authenticate, requireApproved } = require('../../middleware/auth.middleware');

// Both routes require authenticated + approved status
router.get('/feed',        authenticate, requireApproved, controller.getFeed);
router.get('/profile/:id', authenticate, requireApproved, controller.getProfile);

module.exports = router;
