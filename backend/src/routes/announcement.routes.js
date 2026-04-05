'use strict';

/**
 * announcement.routes.js
 *
 * All routes require authenticate + checkTenant.
 *
 * POST   /api/announcements            → createAnnouncement  (society_admin; image optional, multipart or JSON)
 * GET    /api/announcements            → getAnnouncements
 * GET    /api/announcements/:id        → getAnnouncement
 * PUT    /api/announcements/:id        → updateAnnouncement  (society_admin; image optional)
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

/**
 * Image is optional: only run multer for multipart requests so JSON bodies
 * (title, description, priority) work without a file and without Cloudinary.
 */
function optionalAnnouncementImage(req, res, next) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    return announcementUpload.single('image')(req, res, next);
  }
  return next();
}

// Apply authenticate + checkTenant to every announcement route
router.use(authenticate, checkTenant);

// POST /api/announcements  (society_admin)
router.post(
  '/',
  authorize('society_admin'),
  optionalAnnouncementImage,
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
  optionalAnnouncementImage,
  updateAnnouncement,
);

// DELETE /api/announcements/:id  (society_admin)
router.delete('/:id', authorize('society_admin'), deleteAnnouncement);

// POST /api/announcements/:id/read
router.post('/:id/read', markAsRead);

module.exports = router;
