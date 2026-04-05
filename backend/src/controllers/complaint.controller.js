'use strict';

/**
 * complaint.controller.js
 * ───────────────────────
 * Resident complaint lifecycle for the multi-tenant Society Management SaaS.
 *
 * Routes (mounted under /api/complaints by the router):
 *   POST   /                      → createComplaint
 *   GET    /                      → getComplaints
 *   GET    /:id                   → getComplaint
 *   PATCH  /:id/status            → updateComplaintStatus   (society_admin)
 *   DELETE /:id                   → deleteComplaint
 *
 * Access model:
 *   - 'user'         : create, read own, delete own open complaints.
 *   - 'society_admin': read all, update status, delete any, add adminComments.
 *   - 'super_admin'  : inherits all society_admin privileges.
 */

const mongoose = require('mongoose');

const Complaint    = require('../models/Complaint');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const { cloudinary } = require('../config/cloudinary');
const logger         = require('../utils/logger');
const {
  asyncHandler,
  APIError,
  ApiResponse,
  paginate,
  paginateMeta,
} = require('../utils/helpers');
const { sendComplaintStatusChangeEmail } = require('../services/email.service');

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map multer-storage-cloudinary files → Complaint.images schema shape.
 *
 * @param {Express.Multer.File[]} files
 * @returns {{ url: string, publicId: string }[]}
 */
const buildImageArray = (files = []) =>
  files.map((f) => ({
    url:      f.path,
    publicId: f.filename,
  }));

/**
 * Delete Cloudinary assets for a complaint, ignoring individual failures.
 *
 * @param {{ url: string, publicId: string }[]} images
 */
const deleteCloudinaryImages = async (images = []) => {
  if (!images.length) return;
  await Promise.allSettled(
    images
      .filter((img) => img && img.publicId)
      .map((img) => cloudinary.uploader.destroy(img.publicId))
  );
};

/**
 * Send a targeted notification to a single user.  Fails silently.
 *
 * @param {object} opts
 */
const sendNotification = async ({ recipientId, societyId, type, title, body, data = {} }) => {
  if (!recipientId) return;
  try {
    await Notification.create({ recipientId, societyId, type, title, body, data });
  } catch (err) {
    logger.warn('[complaint] sendNotification failed:', err.message);
  }
};

/**
 * Notify all society_admin users in a society about a new complaint.
 * Uses insertMany for efficiency.
 *
 * @param {object} opts
 * @param {string} opts.societyId
 * @param {string} opts.raisedBy    - User ID of the complainant
 * @param {string} opts.complaintId
 * @param {string} opts.title       - Complaint title
 */
const notifyAdmins = async ({ societyId, raisedBy, complaintId, title }) => {
  try {
    const admins = await User.find({
      societyId,
      role:      'society_admin',
      isDeleted: false,
      status:    'active',
      _id:       { $ne: raisedBy },
    })
      .select('_id')
      .lean();

    if (!admins.length) return;

    const docs = admins.map((admin) => ({
      recipientId: admin._id,
      societyId,
      type:  'complaint_update',
      title: 'New Complaint Raised',
      body:  `A new complaint has been filed: "${title}".`,
      data:  { complaintId: complaintId.toString() },
    }));

    await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    logger.warn('[complaint] notifyAdmins failed:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// createComplaint
// POST /complaints
// Body: { title, description, category?, priority? }
// Files: images[] (multer)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Create a new complaint on behalf of the authenticated resident.
 *
 * - societyId and raisedBy are taken from the verified JWT (req.user).
 * - Uploaded images are stored via multer-storage-cloudinary (req.files).
 * - After creation, society admins are notified asynchronously.
 */
const createComplaint = asyncHandler(async (req, res) => {
  const { id: raisedBy, societyId } = req.user;

  if (!societyId) {
    throw APIError.forbidden('You must belong to a society to raise a complaint.');
  }

  const { title, description, category, priority } = req.body;

  if (!title || !String(title).trim()) {
    throw APIError.badRequest('Complaint title is required.');
  }
  if (!description || !String(description).trim()) {
    throw APIError.badRequest('Complaint description is required.');
  }

  const VALID_CATEGORIES = ['maintenance', 'security', 'cleanliness', 'noise', 'billing', 'other'];
  const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

  if (category && !VALID_CATEGORIES.includes(category)) {
    throw APIError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}.`);
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    throw APIError.badRequest(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}.`);
  }

  const images = buildImageArray(Array.isArray(req.files) ? req.files : []);

  const complaint = await Complaint.create({
    societyId: new mongoose.Types.ObjectId(societyId),
    raisedBy:  new mongoose.Types.ObjectId(raisedBy),
    title:       String(title).trim(),
    description: String(description).trim(),
    images,
    category:    category  || 'other',
    priority:    priority  || 'medium',
  });

  // Notify society admins asynchronously
  notifyAdmins({
    societyId,
    raisedBy,
    complaintId: complaint._id,
    title:       complaint.title,
  }).catch(() => {});

  logger.info(
    `[complaint] User ${raisedBy} raised complaint ${complaint._id} in society ${societyId}.`
  );

  const payload = complaint.toObject ? complaint.toObject() : complaint;
  return ApiResponse.created('Complaint submitted successfully.', payload).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getComplaints
// GET /complaints?page=1&limit=10&status=open&category=maintenance&priority=high
// ─────────────────────────────────────────────────────────────────────────────
/**
 * List complaints with pagination.
 *
 * - society_admin / super_admin: sees ALL complaints in their society with
 *   optional filtering by status, category, and priority.
 * - Regular user: sees ONLY their own complaints (no filter override).
 *
 * Author details (name, flatNumber, profilePhoto) are populated.
 */
const getComplaints = asyncHandler(async (req, res) => {
  const { id: userId, role, societyId } = req.user;

  if (!societyId) throw APIError.forbidden('Society context required.');

  const isAdmin = role === 'society_admin' || role === 'super_admin';

  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  // Build filter – admins may query any complaint in the society
  const filter = { societyId, isDeleted: false };

  if (!isAdmin) {
    // Regular users can only see their own complaints
    filter.raisedBy = userId;
  } else {
    // Admins can filter by status, category, priority
    const { status, category, priority } = req.query;

    const VALID_STATUSES    = ['open', 'in_progress', 'resolved', 'closed'];
    const VALID_CATEGORIES  = ['maintenance', 'security', 'cleanliness', 'noise', 'billing', 'other'];
    const VALID_PRIORITIES  = ['low', 'medium', 'high', 'urgent'];

    if (status   && VALID_STATUSES.includes(status))    filter.status   = status;
    if (category && VALID_CATEGORIES.includes(category)) filter.category = category;
    if (priority && VALID_PRIORITIES.includes(priority)) filter.priority = priority;
  }

  const [complaints, total] = await Promise.all([
    Complaint.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path:   'raisedBy',
        select: 'name flatNumber profilePhoto',
      })
      .lean(),
    Complaint.countDocuments(filter),
  ]);

  return ApiResponse.ok(
    'Complaints fetched successfully.',
    complaints,
    paginateMeta(total, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getComplaint
// GET /complaints/:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return a single complaint.
 * - The complaint owner may always read their own complaint.
 * - Admins may read any complaint in their society.
 */
const getComplaint = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { id: userId, role, societyId } = req.user;

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid complaint ID.');

  const complaint = await Complaint.findOne({ _id: id, societyId, isDeleted: false })
    .populate({ path: 'raisedBy',   select: 'name flatNumber profilePhoto email' })
    .populate({ path: 'assignedTo', select: 'name flatNumber profilePhoto' })
    .lean();

  if (!complaint) throw APIError.notFound('Complaint not found.');

  const isOwner = complaint.raisedBy?._id?.toString() === userId;
  const isAdmin = role === 'society_admin' || role === 'super_admin';

  if (!isOwner && !isAdmin) {
    throw APIError.forbidden('You do not have permission to view this complaint.');
  }

  return ApiResponse.ok('Complaint fetched successfully.', complaint).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// updateComplaintStatus
// PATCH /complaints/:id/status
// Body: { status, comment?, assignedTo? }
// Access: society_admin / super_admin only
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Update a complaint's status (and optionally add an admin comment or assign
 * the complaint to a staff member).
 *
 * On status change:
 *   1. Updates the status field.
 *   2. Appends the optional comment to adminComments[].
 *   3. Sets resolvedAt when the new status is 'resolved' or 'closed'.
 *   4. Sends a status-update e-mail to the complainant (async, non-blocking).
 *   5. Sends an in-app notification to the complainant.
 */
const updateComplaintStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { id: adminId, role, societyId } = req.user;

  const isAdmin = role === 'society_admin' || role === 'super_admin';
  if (!isAdmin) {
    throw APIError.forbidden('Only admins can update complaint status.');
  }

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid complaint ID.');

  const complaint = await Complaint.findOne({ _id: id, societyId, isDeleted: false });
  if (!complaint) throw APIError.notFound('Complaint not found.');

  const { status, comment, assignedTo } = req.body;

  const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
  if (!status || !VALID_STATUSES.includes(status)) {
    throw APIError.badRequest(
      `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.`
    );
  }

  // Validate assignedTo if provided
  if (assignedTo !== undefined) {
    if (!mongoose.isValidObjectId(assignedTo)) {
      throw APIError.badRequest('Invalid assignedTo user ID.');
    }
    const assignee = await User.findOne({
      _id: assignedTo, societyId, isDeleted: false,
    }).lean();
    if (!assignee) {
      throw APIError.notFound('Assigned user not found in this society.');
    }
    complaint.assignedTo = assignee._id;
  }

  const previousStatus = complaint.status;
  complaint.status     = status;

  // Set resolvedAt timestamp when closing out a complaint
  if ((status === 'resolved' || status === 'closed') && !complaint.resolvedAt) {
    complaint.resolvedAt = new Date();
  }

  // Append admin comment if provided
  const trimmedComment = comment ? String(comment).trim() : '';
  if (trimmedComment) {
    complaint.adminComments.push({
      authorId:  adminId,
      comment:   trimmedComment,
      createdAt: new Date(),
    });
  }

  await complaint.save();

  // ── Non-blocking side-effects ─────────────────────────────────────────────
  if (previousStatus !== status) {
    const raisedByUser = await User.findById(complaint.raisedBy)
      .select('name email')
      .lean();

    // In-app notification
    sendNotification({
      recipientId: complaint.raisedBy,
      societyId,
      type:  'complaint_update',
      title: 'Your complaint status has been updated',
      body:  `Complaint "${complaint.title}" is now ${status.replace(/_/g, ' ')}.`,
      data:  { complaintId: id, newStatus: status },
    }).catch(() => {});

    // Status e-mail
    if (raisedByUser) {
      sendComplaintStatusChangeEmail({
        email:          raisedByUser.email,
        name:           raisedByUser.name,
        complaintTitle: complaint.title,
        newStatus:      status,
        adminComment:   trimmedComment || undefined,
      }).catch(() => {});
    }
  }

  logger.info(
    `[complaint] Admin ${adminId} updated complaint ${id} status to "${status}".`
  );

  return ApiResponse.ok('Complaint status updated successfully.', complaint).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteComplaint
// DELETE /complaints/:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Soft-delete a complaint.
 * - An admin may delete any complaint in their society at any time.
 * - A regular user may only delete their own complaint while its status is 'open'.
 * - Cloudinary images are removed asynchronously after the DB soft-delete.
 */
const deleteComplaint = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { id: userId, role, societyId } = req.user;

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid complaint ID.');

  const complaint = await Complaint.findOne({ _id: id, societyId, isDeleted: false });
  if (!complaint) throw APIError.notFound('Complaint not found.');

  const isOwner = complaint.raisedBy.toString() === userId;
  const isAdmin = role === 'society_admin' || role === 'super_admin';

  if (!isOwner && !isAdmin) {
    throw APIError.forbidden('You do not have permission to delete this complaint.');
  }

  // Regular users can only delete while the complaint is still open
  if (isOwner && !isAdmin && complaint.status !== 'open') {
    throw APIError.forbidden(
      'You can only delete a complaint while it is in "open" status.'
    );
  }

  complaint.isDeleted = true;
  await complaint.save();

  // Clean up Cloudinary assets asynchronously
  if (complaint.images && complaint.images.length > 0) {
    deleteCloudinaryImages(complaint.images).catch((err) =>
      logger.warn(`[deleteComplaint] Cloudinary cleanup failed for complaint ${id}:`, err)
    );
  }

  logger.info(`[complaint] Complaint ${id} soft-deleted by user ${userId}.`);

  return ApiResponse.ok('Complaint deleted successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  createComplaint,
  getComplaints,
  getComplaint,
  updateComplaintStatus,
  deleteComplaint,
};
