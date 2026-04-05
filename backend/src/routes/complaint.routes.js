'use strict';

/**
 * complaint.routes.js
 *
 * All routes require authenticate + checkTenant.
 *
 * POST   /api/complaints           → createComplaint     (images optional; multipart or JSON)
 * GET    /api/complaints           → getComplaints
 * GET    /api/complaints/:id       → getComplaint
 * PATCH  /api/complaints/:id/status → updateComplaintStatus  (society_admin)
 * DELETE /api/complaints/:id       → deleteComplaint
 */

const express = require('express');

const {
  createComplaint,
  getComplaints,
  getComplaint,
  updateComplaintStatus,
  deleteComplaint,
} = require('../controllers/complaint.controller');

const { authenticate, authorize } = require('../middleware/auth');
const { checkTenant }             = require('../middleware/tenant');
const { complaintUpload }         = require('../config/cloudinary');

const router = express.Router();

/**
 * Photos are optional: only run Cloudinary multer for multipart requests so
 * JSON-only submits work without files or Cloudinary.
 */
function optionalComplaintImages(req, res, next) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    return complaintUpload.array('images', 3)(req, res, next);
  }
  return next();
}

// Apply authenticate + checkTenant to every complaint route
router.use(authenticate, checkTenant);

// POST /api/complaints
router.post('/', optionalComplaintImages, createComplaint);

// GET /api/complaints
router.get('/', getComplaints);

// GET /api/complaints/:id
router.get('/:id', getComplaint);

// PATCH /api/complaints/:id/status  (society_admin only)
router.patch('/:id/status', authorize('society_admin'), updateComplaintStatus);

// DELETE /api/complaints/:id
router.delete('/:id', deleteComplaint);

module.exports = router;
