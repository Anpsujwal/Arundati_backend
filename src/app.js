'use strict';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { errorHandler } = require('./middleware/error.middleware');
const { GOTRAS } = require('./database/seeds/gotras.seed');

// Route modules
const authRoutes      = require('./modules/auth/auth.routes');
const profileRoutes   = require('./modules/profile/profile.routes');
const matchesRoutes   = require('./modules/matches/matches.routes');
const adminRoutes     = require('./modules/admin/admin.routes');
const interestsRoutes = require('./modules/interests/interests.routes');
const filesRoutes     = require('./modules/files/files.routes');
const kundaliRoutes   = require('./modules/kundali/kundali.routes');

const app = express();

// ─── CORS ───────────────────────────────────────────────────────────────────
const rawOrigins = (env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-to-server, mobile)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');
    if (
      rawOrigins.includes('*') ||
      rawOrigins.includes(cleanOrigin) ||
      cleanOrigin.endsWith('.vercel.app') ||
      /^http:\/\/localhost(:\d+)?$/.test(cleanOrigin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(cleanOrigin)
    ) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

app.use(cors(corsOptions));

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'Arundhati API is running.', timestamp: new Date().toISOString() });
});

// ─── Reference Data ──────────────────────────────────────────────────────────
app.get('/api/v1/ref/gotras', (req, res) => {
  res.json({ success: true, data: GOTRAS });
});

app.get('/api/v1/ref/subsects', (req, res) => {
  res.json({
    success: true,
    data: ['Smartha', 'Shaivite', 'Vaishnava', 'Madhwa', 'Niyogi', 'Kanyakubj', 'Saraswat', 'Other'],
  });
});

app.get('/api/v1/ref/incomes', (req, res) => {
  res.json({
    success: true,
    data: ['Below 3 LPA', '3–5 LPA', '5–10 LPA', '10–20 LPA', '20–40 LPA', '40+ LPA', 'Prefer not to say'],
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/v1/auth',      authRoutes);
app.use('/api/v1/profile',   profileRoutes);
app.use('/api/v1/matches',   matchesRoutes);
app.use('/api/v1/admin',     adminRoutes);
app.use('/api/v1/interests', interestsRoutes);
app.use('/api/v1/files',     filesRoutes);
app.use('/api/v1/kundali',   kundaliRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API route not found.' });
});

// ─── Centralised Error Handler (must be last) ────────────────────────────────
app.use(errorHandler);

module.exports = app;
