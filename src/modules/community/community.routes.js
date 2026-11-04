'use strict';

const { Router } = require('express');
const ctrl = require('./community.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

/**
 * GET /api/v1/community/sects
 * Returns all active Primary Sects (level 1).
 * Public — no auth needed (used during registration).
 */
router.get('/sects', ctrl.getSects);

/**
 * GET /api/v1/community/sub-sects?parentId=<id>
 * Returns Sub-Sects belonging to the specified Primary Sect.
 * Public — no auth needed.
 */
router.get('/sub-sects', ctrl.getSubSects);

/**
 * GET /api/v1/community/search?q=<query>
 * Unified search across Primary Sects and Sub-Sects.
 * Public — no auth needed.
 */
router.get('/search', ctrl.searchCommunity);

/**
 * POST /api/v1/community/validate
 * Validates that a Sub-Sect belongs to the selected Primary Sect.
 * Requires auth (used before saving profile step 2).
 */
router.post('/validate', authenticate, ctrl.validateSelection);

module.exports = router;
