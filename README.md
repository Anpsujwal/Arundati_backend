# 🪔 Arundhati Backend — REST API

> **Arundhati Brahmin Alliance Matrimony Platform** — Node.js + Express REST API backed by SQLite (`better-sqlite3`).

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [File Uploads](#file-uploads)
- [Scripts](#scripts)

---

## Overview

The Arundhati backend is a RESTful API server that powers the matrimony platform. It handles:

- User registration & JWT-based authentication (HTTP-only cookie)
- Profile management (personal, astrological, family details)
- Photo and document uploads
- Match browsing & interest expressions
- Admin moderation (profile verification & approval)

---

## Tech Stack

| Layer         | Technology                      |
|---------------|---------------------------------|
| Runtime       | Node.js (CommonJS)              |
| Framework     | Express 5                       |
| Database      | SQLite via `better-sqlite3`     |
| Auth          | JWT (`jsonwebtoken`) + `bcryptjs` |
| Validation    | `express-validator`             |
| File Uploads  | `multer`                        |
| IDs           | `uuid`                          |
| Dev Server    | `nodemon`                       |

---

## Project Structure

```
backend/
├── server.js              # Entry point — bootstraps migrations, seeds & starts server
├── .env                   # Local environment variables (git-ignored)
├── .env.example           # Template for environment variables
├── data/
│   └── arundhati.db       # SQLite database file (auto-created)
├── uploads/               # Uploaded photos & documents (git-ignored)
└── src/
    ├── app.js             # Express app setup, middleware & route mounting
    ├── config/
    │   ├── env.js         # Validated environment config
    │   └── database.js    # SQLite connection singleton
    ├── database/
    │   ├── migrations/    # Versioned schema migrations (001–008)
    │   └── seeds/         # Admin seed, test-user seed, gotras reference data
    ├── middleware/
    │   ├── auth.middleware.js    # JWT verification middleware
    │   ├── admin.middleware.js   # Admin role guard
    │   ├── upload.middleware.js  # Multer config (photos & docs)
    │   └── error.middleware.js   # Centralised error handler
    ├── modules/
    │   ├── auth/          # Register, Login, Logout, Me
    │   ├── profile/       # CRUD for personal/astro/family/photo/document sub-resources
    │   ├── matches/       # Browsable match listings
    │   ├── interests/     # Send / accept / reject interest
    │   ├── files/         # Serve uploaded files securely
    │   └── admin/         # Dashboard stats, pending list, approve/reject
    └── utils/             # Shared helpers (response builder, validators, etc.)
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9

### Installation

```bash
cd backend
npm install
```

### Configure Environment

```bash
cp .env.example .env
# Edit .env and set your JWT_SECRET (must be >= 64 chars)
```

### Run in Development

```bash
npm run dev
# Starts nodemon — auto-restarts on file changes
# API available at http://localhost:5000
```

### Run in Production

```bash
npm start
```

On every startup the server automatically:
1. Runs all pending database migrations
2. Seeds the admin account (idempotent)
3. Seeds test users (development only)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable            | Default                 | Description                           |
|---------------------|-------------------------|---------------------------------------|
| `PORT`              | `5000`                  | HTTP port the API listens on          |
| `NODE_ENV`          | `development`           | `development` or `production`         |
| `JWT_SECRET`        | *(required)*            | Long random secret (>= 64 chars)      |
| `JWT_EXPIRES_IN`    | `7d`                    | Token expiry duration                 |
| `DB_PATH`           | `./data/arundhati.db`   | Path to the SQLite database file      |
| `MAX_PHOTO_SIZE_MB` | `5`                     | Maximum upload size for photos        |
| `MAX_DOC_SIZE_MB`   | `10`                    | Maximum upload size for documents     |
| `CORS_ORIGIN`       | `http://localhost:5173` | Allowed frontend origin (CORS)        |

---

## Database

- **Engine**: SQLite (file-based, zero-config)
- **Driver**: `better-sqlite3` (synchronous, high-performance)
- **Location**: `./data/arundhati.db` (auto-created on first run)
- **Migrations**: Sequential files `001_users` to `008_schema_v2` run at startup

### Migration Files

| File              | Description                             |
|-------------------|-----------------------------------------|
| `001_users`       | Core users table (auth)                 |
| `002_profiles`    | Personal profile details                |
| `003_astro`       | Astrological information                |
| `004_family`      | Family background                       |
| `005_photos`      | Profile photo uploads                   |
| `006_documents`   | ID / verification document uploads      |
| `007_interests`   | Interest expressions between users      |
| `008_schema_v2`   | Additional fields & schema improvements |

---

## API Reference

All routes are prefixed with `/api/v1`.

### Health & Reference Data

| Method | Route                  | Description                          |
|--------|------------------------|--------------------------------------|
| GET    | `/api/v1/health`       | Health check — returns server status |
| GET    | `/api/v1/ref/gotras`   | List of all Brahmin gotras           |
| GET    | `/api/v1/ref/subsects` | List of Brahmin sub-sects            |
| GET    | `/api/v1/ref/incomes`  | Income bracket options               |

### Auth — `/api/v1/auth`

| Method | Route       | Auth Required | Description                        |
|--------|-------------|---------------|------------------------------------|
| POST   | `/register` | No            | Create a new user account          |
| POST   | `/login`    | No            | Log in and receive JWT cookie      |
| POST   | `/logout`   | Yes           | Clear the auth cookie              |
| GET    | `/me`       | Yes           | Get the current authenticated user |

### Profile — `/api/v1/profile`

| Method | Route              | Auth Required | Description                    |
|--------|--------------------|---------------|--------------------------------|
| GET    | `/`                | Yes           | Get own profile                |
| PUT    | `/personal`        | Yes           | Update personal details        |
| PUT    | `/astro`           | Yes           | Update astrological details    |
| PUT    | `/family`          | Yes           | Update family details          |
| POST   | `/photos`          | Yes           | Upload a profile photo         |
| DELETE | `/photos/:photoId` | Yes           | Delete a profile photo         |
| POST   | `/documents`       | Yes           | Upload a verification document |

### Matches — `/api/v1/matches`

| Method | Route | Auth Required | Description                               |
|--------|-------|---------------|-------------------------------------------|
| GET    | `/`   | Yes           | Browse approved, opposite-gender matches  |

### Interests — `/api/v1/interests`

| Method | Route          | Auth Required | Description                     |
|--------|----------------|---------------|---------------------------------|
| POST   | `/`            | Yes           | Send an interest to a match     |
| GET    | `/sent`        | Yes           | List interests sent by the user |
| GET    | `/received`    | Yes           | List interests received         |
| PUT    | `/:id/respond` | Yes           | Accept or reject an interest    |

### Files — `/api/v1/files`

| Method | Route              | Auth Required | Description                          |
|--------|--------------------|---------------|--------------------------------------|
| GET    | `/photos/:filename`| Yes           | Securely serve an uploaded photo     |
| GET    | `/docs/:filename`  | Yes           | Securely serve an uploaded document  |

### Admin — `/api/v1/admin`

| Method | Route                      | Auth + Admin | Description                          |
|--------|----------------------------|--------------|--------------------------------------|
| GET    | `/dashboard`               | Yes          | Platform statistics                  |
| GET    | `/pending`                 | Yes          | List profiles pending verification   |
| GET    | `/profile/:userId`         | Yes          | Get full profile detail for review   |
| PUT    | `/profile/:userId/approve` | Yes          | Approve a profile                    |
| PUT    | `/profile/:userId/reject`  | Yes          | Reject a profile with a reason       |

---

## Authentication

The API uses **JWT stored in an HTTP-only cookie** (`token`).

1. `POST /api/v1/auth/login` sets the cookie on success.
2. All protected routes read the `token` cookie via `auth.middleware.js`.
3. Admin routes additionally check `user.role === 'admin'` via `admin.middleware.js`.
4. `POST /api/v1/auth/logout` clears the cookie.

> **CORS**: The frontend must be served from the origin specified in `CORS_ORIGIN` and requests must include `credentials: true` so cookies are sent cross-origin.

---

## File Uploads

Handled by `multer` configured in `upload.middleware.js`.

| Type      | Destination          | Size Limit          | Allowed MIME Types                        |
|-----------|----------------------|---------------------|-------------------------------------------|
| Photos    | `uploads/photos/`    | `MAX_PHOTO_SIZE_MB` | `image/jpeg`, `image/png`, `image/webp`   |
| Documents | `uploads/documents/` | `MAX_DOC_SIZE_MB`   | `image/*`, `application/pdf`              |

Files are served securely through `/api/v1/files/*` — direct filesystem access is not exposed.

---

## Scripts

| Command        | Description                          |
|----------------|--------------------------------------|
| `npm run dev`  | Start with nodemon (auto-reload)     |
| `npm start`    | Start in production mode             |
