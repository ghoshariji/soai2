'use strict';

/**
 * announcement.routes.js
 *
 * All routes require authenticate + checkTenant.
 *
 * POST   /api/announcements            → createAnnouncement  (society_admin, announcementUpload.single('image'))
 * GET    /api/announcements            → getAnnouncements
 * GET    /api/announcements/:id        → getAnnouncement
 * PUT    /api/announcements/:id        → updateAnnouncement  (society_admin, announcementUpload.single('image'))
 * DELETE /api/announcements/:id        → deleteAnnouncement  (society_admin)
 * POST   /api/announcements/:id/read   → markAsRead
 */

const express = require('express');

const {
  createAnnouncement,
  getAnnouncements,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAsRead,
} = require('../controllers/announcement.controller');

const { authenticate, authorize }  = require('../middleware/auth');
const { checkTenant }              = require('../middleware/tenant');
const { announcementUpload }       = require('../config/cloudinary');

const router = express.Router();

// Apply authenticate + checkTenant to every announcement route
router.use(authenticate, checkTenant);

// POST /api/announcements  (society_admin)
router.post(
  '/',
  authorize('society_admin'),
  announcementUpload.single('image'),
  createAnnouncement,
);

// GET /api/announcements
router.get('/', getAnnouncements);

// GET /api/announcements/:id
router.get('/:id', getAnnouncement);

// PUT /api/announcements/:id  (society_admin)
router.put(
  '/:id',
  authorize('society_admin'),
  announcementUpload.single('image'),
  updateAnnouncement,
);

// DELETE /api/announcements/:id  (society_admin)
router.delete('/:id', authorize('society_admin'), deleteAnnouncement);

// POST /api/announcements/:id/read
router.post('/:id/read', markAsRead);

module.exports = router;
