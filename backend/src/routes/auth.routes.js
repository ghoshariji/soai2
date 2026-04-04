'use strict';

/**
 * auth.routes.js
 *
 * POST   /api/auth/login            → login            (authLimiter)
 * POST   /api/auth/refresh-token    → refreshToken
 * POST   /api/auth/logout           → logout           (authenticate)
 * GET    /api/auth/me               → getMe            (authenticate)
 * PUT    /api/auth/change-password  → changePassword   (authenticate)
 */

const express = require('express');

const {
  login,
  refreshToken,
  logout,
  getMe,
  changePassword,
} = require('../controllers/auth.controller');

const { authenticate }  = require('../middleware/auth');
const { authLimiter }   = require('../middleware/rateLimiter');

const router = express.Router();

// POST /api/auth/login
router.post('/login', authLimiter, login);

// POST /api/auth/refresh-token
router.post('/refresh-token', refreshToken);

// POST /api/auth/logout
router.post('/logout', authenticate, logout);

// GET /api/auth/me
router.get('/me', authenticate, getMe);

// PUT /api/auth/change-password
router.put('/change-password', authenticate, changePassword);

module.exports = router;
