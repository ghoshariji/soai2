'use strict';

/**
 * user.routes.js
 *
 * POST   /api/users                     → createUser           (society_admin)
 * GET    /api/users                     → getUsers             (society_admin | super_admin)
 * GET    /api/users/me                  → getMyProfile         (any authenticated)
 * PUT    /api/users/me                  → updateMyProfile      (any authenticated, profileUpload)
 * GET    /api/users/:id                 → getUser              (society_admin | super_admin)
 * PUT    /api/users/:id                 → updateUser           (society_admin)
 * DELETE /api/users/:id                 → deleteUser           (society_admin)
 * PATCH  /api/users/:id/toggle-status   → toggleUserStatus     (society_admin)
 *
 * NOTE: /me routes are declared before /:id so Express matches them first.
 */

const express = require('express');

const {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  updateMyProfile,
} = require('../controllers/user.controller');

const { authenticate, authorize } = require('../middleware/auth');
const { checkTenant }             = require('../middleware/tenant');
const { profileUpload }           = require('../config/cloudinary');

const router = express.Router();

// POST /api/users
router.post(
  '/',
  authenticate,
  authorize('society_admin'),
  checkTenant,
  createUser,
);

// GET /api/users
router.get(
  '/',
  authenticate,
  authorize('society_admin', 'super_admin'),
  checkTenant,
  getUsers,
);

// GET /api/users/me  – must come before /:id
router.get('/me', authenticate, (req, res, next) => {
  req.params.id = req.user.id;
  next();
}, getUser);

// PUT /api/users/me  – must come before /:id
router.put(
  '/me',
  authenticate,
  profileUpload.single('profilePhoto'),
  updateMyProfile,
);

// GET /api/users/:id
router.get(
  '/:id',
  authenticate,
  authorize('society_admin', 'super_admin'),
  checkTenant,
  getUser,
);

// PUT /api/users/:id
router.put(
  '/:id',
  authenticate,
  authorize('society_admin'),
  checkTenant,
  updateUser,
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  authenticate,
  authorize('society_admin'),
  checkTenant,
  deleteUser,
);

// PATCH /api/users/:id/toggle-status
router.patch(
  '/:id/toggle-status',
  authenticate,
  authorize('society_admin'),
  checkTenant,
  toggleUserStatus,
);

module.exports = router;
