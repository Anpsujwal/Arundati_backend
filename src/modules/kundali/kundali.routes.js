'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./kundali.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireAdmin } = require('../../middleware/admin.middleware');

// User endpoint — authenticated users only
router.get('/me',       authenticate, controller.getMyKundali);
router.get('/me/chart', authenticate, controller.getMyChartData);

// Admin endpoints
const adminGuard = [authenticate, requireAdmin];
router.get('/admin/users/:userId',       ...adminGuard, controller.getKundaliAdmin);
router.post('/admin/users/:userId/retry', ...adminGuard, controller.retryKundali);

module.exports = router;
