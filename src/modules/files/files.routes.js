'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../../config/database');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireAdmin } = require('../../middleware/admin.middleware');
const { notFound, forbidden } = require('../../utils/response.utils');

const UPLOAD_BASE = path.resolve(__dirname, '../../../uploads');

/**
 * Serve profile photos — requires authentication.
 * Accepts token via cookie, Bearer header, OR ?token= query param
 * (query param is needed for <img src> tags which cannot set auth headers).
 */
router.get('/photo/:filename', (req, res, next) => {
  // Inject token from query param into cookie so the authenticate middleware can find it
  if (req.query.token && !req.cookies?.token) {
    req.cookies = req.cookies || {};
    req.cookies.token = req.query.token;
  }
  next();
}, authenticate, (req, res, next) => {
  try {
    const { filename } = req.params;
    // Basic path traversal protection
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return forbidden(res, 'Invalid file path.');
    }
    const filePath = path.join(UPLOAD_BASE, 'photos', filename);
    if (!fs.existsSync(filePath)) return notFound(res, 'Photo not found.');
    res.sendFile(filePath);
  } catch (e) { next(e); }
});

/**
 * Serve documents — ADMIN ONLY.
 * Government IDs and Kundli PDFs are never publicly accessible.
 * Accepts token via cookie, Bearer header, OR ?token= query param
 * (needed for <img> and <iframe> tags in the admin panel).
 */
router.get('/document/:doc_id', (req, res, next) => {
  if (req.query.token && !req.cookies?.token) {
    req.cookies = req.cookies || {};
    req.cookies.token = req.query.token;
  }
  next();
}, authenticate, requireAdmin, (req, res, next) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE doc_id=?').get(parseInt(req.params.doc_id, 10));
    if (!doc) return notFound(res, 'Document not found.');

    const subfolder = doc.doc_type === 'kundli_pdf' ? 'kundli' : 'documents';
    const filePath = path.join(UPLOAD_BASE, subfolder, doc.filename);
    if (!fs.existsSync(filePath)) return notFound(res, 'Document file not found.');

    // Force download for PDFs, inline for images
    const isPdf = doc.filename.endsWith('.pdf');
    if (isPdf) {
      res.setHeader('Content-Disposition', `inline; filename="document_${doc.doc_id}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
    }
    res.sendFile(filePath);
  } catch (e) { next(e); }
});

module.exports = router;
