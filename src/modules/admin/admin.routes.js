'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./admin.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireAdmin } = require('../../middleware/admin.middleware');

const guard = [authenticate, requireAdmin];

router.get('/stats',          ...guard, controller.getStats);
router.get('/recent',         ...guard, controller.getRecent);
router.get('/pending',        ...guard, controller.getPending);
router.get('/users',          ...guard, controller.getAllUsers);
router.get('/profile/:id',    ...guard, controller.getProfile);
router.post('/verify',        ...guard, controller.verify);
router.delete('/users/:id',   ...guard, controller.deleteUser);

module.exports = router;
