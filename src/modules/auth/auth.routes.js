'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { registerValidation, loginValidation, validate } = require('./auth.validation');

router.post('/register', registerValidation, validate, controller.register);
router.post('/login',    loginValidation,    validate, controller.login);
router.post('/logout',   authenticate,               controller.logout);
router.get('/me',        authenticate,               controller.me);

module.exports = router;
