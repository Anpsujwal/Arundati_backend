'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./profile.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { photoUpload, documentUpload, handleUploadError } = require('../../middleware/upload.middleware');

router.get('/me', authenticate, controller.getMe);

// Wizard steps
router.post('/step/1', authenticate, controller.step1);
router.post('/step/2', authenticate, controller.step2);
router.post('/step/3', authenticate, controller.step3);
router.post('/step/4', authenticate, controller.step4);
router.post('/step/5', authenticate, controller.step5);
router.post('/step/6', authenticate, controller.step6);
router.post('/step/7', authenticate, controller.step7);

// Photo management
router.post('/photo',      authenticate, photoUpload.single('photo'), handleUploadError, controller.uploadPhoto);
router.delete('/photo/:id', authenticate, controller.deletePhoto);

// Document upload
router.post('/document', authenticate, documentUpload.single('document'), handleUploadError, controller.uploadDocument);

module.exports = router;
