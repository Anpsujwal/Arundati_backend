'use strict';

const multer = require('multer');
const path = require('path');
// const { v4: uuidv4 } = require('uuid');
const { randomUUID } = require('crypto');
const env = require('../config/env');

const UPLOAD_BASE = path.resolve(__dirname, '../../uploads');

// Allowed MIME types per upload type
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const PDF_TYPES = ['application/pdf'];

function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(UPLOAD_BASE, subfolder));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });
}

function filterByType(allowedTypes) {
  return (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`), false);
    }
  };
}

// Profile photo upload (max 5 MB)
const photoUpload = multer({
  storage: makeStorage('photos'),
  limits: { fileSize: env.MAX_PHOTO_SIZE_MB * 1024 * 1024 },
  fileFilter: filterByType(PHOTO_TYPES),
});

// Government ID document upload (max 10 MB)
const documentUpload = multer({
  storage: makeStorage('documents'),
  limits: { fileSize: env.MAX_DOC_SIZE_MB * 1024 * 1024 },
  fileFilter: filterByType(DOC_TYPES),
});

// Kundli PDF upload (max 10 MB)
const kundliUpload = multer({
  storage: makeStorage('kundli'),
  limits: { fileSize: env.MAX_DOC_SIZE_MB * 1024 * 1024 },
  fileFilter: filterByType(PDF_TYPES),
});

// Multer error handler — call as middleware after upload
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File size exceeds the allowed limit.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
}

module.exports = { photoUpload, documentUpload, kundliUpload, handleUploadError };
