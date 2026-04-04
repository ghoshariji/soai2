'use strict';

/**
 * society.routes.js
 *
 * All routes require authenticate + authorize('super_admin').
 *
 * POST   /api/societies            → createSociety
 * GET    /api/societies            → getSocieties
 * GET    /api/societies/:id        → getSociety
 * PUT    /api/societies/:id        → updateSociety
 * DELETE /api/societies/:id        → deleteSociety
 * PATCH  /api/societies/:id/toggle-status → toggleSocietyStatus
 */

const express = require('express');

const {
  createSociety,
  getSocieties,
  getSociety,
  updateSociety,
  deleteSociety,
  toggleSocietyStatus,
} = require('../controllers/society.controller');

const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Apply authenticate + authorize('super_admin') to every route in this file
router.use(authenticate, authorize('super_admin'));

// POST /api/societies
router.post('/', createSociety);

// GET /api/societies
router.get('/', getSocieties);

// GET /api/societies/:id
router.get('/:id', getSociety);

// PUT /api/societies/:id
router.put('/:id', updateSociety);

// DELETE /api/societies/:id
router.delete('/:id', deleteSociety);

// PATCH /api/societies/:id/toggle-status
router.patch('/:id/toggle-status', toggleSocietyStatus);

module.exports = router;
