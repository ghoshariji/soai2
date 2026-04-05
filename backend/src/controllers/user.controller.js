'use strict';

/**
 * user.controller.js
 *
 * Society Admin manages users scoped to their own societyId.
 * updateMyProfile is available to any authenticated role.
 *
 * Imports  asyncHandler, APIError, ApiResponse, paginate, paginateMeta,
 *          buildSearchQuery, generatePassword  from ../utils/helpers
 */

const Joi = require('joi');

const User         = require('../models/User');
const { cloudinary } = require('../config/cloudinary');
const {
  asyncHandler,
  APIError,
  ApiResponse,
  paginate,
  paginateMeta,
  buildSearchQuery,
  generatePassword,
} = require('../utils/helpers');
const logger = require('../utils/logger');
const { sendResidentWelcomeEmail } = require('../services/email.service');

// ─────────────────────────────────────────────────────────────────────────────
// Joi schemas
// ─────────────────────────────────────────────────────────────────────────────
const createUserSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(80).required(),
  email:      Joi.string().trim().email().lowercase().required(),
  phone:      Joi.string().trim().pattern(/^\+?[0-9\s\-().]{7,20}$/).optional().allow('', null),
  flatNumber: Joi.string().trim().max(20).optional().allow('', null),
  role:       Joi.string().valid('user', 'society_admin').default('user'),
});

const updateUserSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(80),
  phone:      Joi.string().trim().pattern(/^\+?[0-9\s\-().]{7,20}$/).allow('', null),
  flatNumber: Joi.string().trim().max(20).allow('', null),
  role:       Joi.string().valid('user', 'society_admin'),
  status:     Joi.string().valid('active', 'inactive', 'blocked'),
}).min(1);

const updateMyProfileSchema = Joi.object({
  name:  Joi.string().trim().min(2).max(80),
  phone: Joi.string().trim().pattern(/^\+?[0-9\s\-().]{7,20}$/).allow('', null),
}).min(1);

const bulkUserRowSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(80).required(),
  email:      Joi.string().trim().email().lowercase().required(),
  phone:      Joi.string().trim().pattern(/^\+?[0-9\s\-().]{7,20}$/).optional().allow('', null),
  flatNumber: Joi.string().trim().max(20).optional().allow('', null),
  role:       Joi.string().valid('user', 'society_admin').default('user'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper – strip password and internal fields from a Mongoose doc
// ─────────────────────────────────────────────────────────────────────────────
const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.refreshToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

// ─────────────────────────────────────────────────────────────────────────────
// createUser
// POST /api/users
// Society admin creates a new resident in their society.
// ─────────────────────────────────────────────────────────────────────────────
const createUser = asyncHandler(async (req, res) => {
  // 1. Validate input
  const { error, value } = createUserSchema.validate(req.body, { abortEarly: false });
  if (error) {
    throw APIError.badRequest(
      'Validation failed',
      error.details.map((d) => ({ field: d.context.key, message: d.message }))
    );
  }

  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  // 2. Guard against duplicate email within the same society
  const existing = await User.findOne({
    email:     value.email,
    societyId,
    isDeleted: false,
  });
  if (existing) throw APIError.conflict(`A user with email "${value.email}" already exists in this society.`);

  // 3. Generate credentials
  const plainPassword = generatePassword();

  // 4. Persist
  const user = await User.create({
    ...value,
    password: plainPassword,
    societyId,
  });

  sendResidentWelcomeEmail(
    {
      name:        user.name,
      email:       user.email,
      flatNumber:  user.flatNumber,
    },
    plainPassword,
    req.user.societyName || 'your society',
  );

  return ApiResponse.created('User created successfully.', sanitizeUser(user)).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getUsers
// GET /api/users?page&limit&search&status
// Paginated list of users in the caller's society.
// ─────────────────────────────────────────────────────────────────────────────
const getUsers = asyncHandler(async (req, res) => {
  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  const { page: rawPage, limit: rawLimit, search, status } = req.query;
  const { page, limit, skip } = paginate(rawPage, rawLimit);

  // Base filter – tenant-scoped, exclude soft-deleted
  const filter = { societyId, isDeleted: false };

  // Optional status filter
  if (status && ['active', 'inactive', 'blocked'].includes(status)) {
    filter.status = status;
  }

  // Free-text search across name, email, flatNumber
  if (search) {
    const searchClause = buildSearchQuery(search, ['name', 'email', 'flatNumber']);
    if (searchClause.$or) Object.assign(filter, searchClause);
  }

  const [users, totalDocs] = await Promise.all([
    User.find(filter)
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return ApiResponse.ok(
    'Users fetched successfully.',
    users,
    paginateMeta(totalDocs, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getUser
// GET /api/users/:id
// ─────────────────────────────────────────────────────────────────────────────
const getUser = asyncHandler(async (req, res) => {
  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  const user = await User.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  }).select('-password -refreshToken -passwordResetToken -passwordResetExpires');

  if (!user) throw APIError.notFound('User not found.');

  return ApiResponse.ok('User fetched successfully.', user).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// updateUser
// PATCH /api/users/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateUser = asyncHandler(async (req, res) => {
  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  // Validate payload
  const { error, value } = updateUserSchema.validate(req.body, { abortEarly: false });
  if (error) {
    throw APIError.badRequest(
      'Validation failed',
      error.details.map((d) => ({ field: d.context.key, message: d.message }))
    );
  }

  const user = await User.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!user) throw APIError.notFound('User not found.');

  // Prevent a society_admin from escalating a user to super_admin
  if (value.role === 'super_admin') throw APIError.forbidden('Cannot assign super_admin role.');

  Object.assign(user, value);
  await user.save();

  return ApiResponse.ok('User updated successfully.', sanitizeUser(user)).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteUser
// DELETE /api/users/:id  (soft delete)
// ─────────────────────────────────────────────────────────────────────────────
const deleteUser = asyncHandler(async (req, res) => {
  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  // Prevent self-deletion
  if (req.params.id === req.user.id) {
    throw APIError.badRequest('You cannot delete your own account.');
  }

  const user = await User.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!user) throw APIError.notFound('User not found.');

  user.isDeleted = true;
  user.status    = 'inactive';
  await user.save();

  return ApiResponse.ok('User deleted successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleUserStatus
// PATCH /api/users/:id/toggle-status
// Cycles: active → blocked, inactive → active, blocked → active
// ─────────────────────────────────────────────────────────────────────────────
const toggleUserStatus = asyncHandler(async (req, res) => {
  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  if (req.params.id === req.user.id) {
    throw APIError.badRequest('You cannot toggle your own status.');
  }

  const user = await User.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!user) throw APIError.notFound('User not found.');

  // Allow caller to supply a target status; otherwise toggle
  const { status: targetStatus } = req.body;
  if (targetStatus) {
    if (!['active', 'inactive', 'blocked'].includes(targetStatus)) {
      throw APIError.badRequest('status must be active, inactive, or blocked.');
    }
    user.status = targetStatus;
  } else {
    // Simple toggle: active ↔ blocked, inactive → active
    const next = { active: 'blocked', blocked: 'active', inactive: 'active' };
    user.status = next[user.status] || 'active';
  }

  await user.save();

  return ApiResponse.ok(`User status updated to "${user.status}".`, sanitizeUser(user)).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// bulkCreateUsers
// POST /api/users/bulk
// Receives a parsed array of user rows (from an Excel upload middleware).
// Expected req.body.users = [ { name, email, phone?, flatNumber?, role? }, … ]
// ─────────────────────────────────────────────────────────────────────────────
const bulkCreateUsers = asyncHandler(async (req, res) => {
  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  const rows = req.body.users;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw APIError.badRequest('Request body must contain a non-empty "users" array.');
  }

  if (rows.length > 500) {
    throw APIError.badRequest('Bulk upload is limited to 500 rows per request.');
  }

  // 1. Validate every row and collect results
  const validRows  = [];  // { value, rowIndex }
  const failedRows = [];  // { row, email, reason }

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1; // 1-based for human readability
    const { error, value } = bulkUserRowSchema.validate(rows[i], { abortEarly: true, convert: true });
    if (error) {
      failedRows.push({ row: rowNumber, email: rows[i]?.email || '', reason: error.details[0].message });
      continue;
    }
    validRows.push({ value, rowIndex: rowNumber });
  }

  if (validRows.length === 0) {
    return ApiResponse.ok('No valid rows to import.', { success: 0, failed: failedRows }).send(res);
  }

  // 2. Find all emails that already exist in this society (single query)
  const incomingEmails = validRows.map((r) => r.value.email);
  const existingUsers  = await User.find({
    email:     { $in: incomingEmails },
    societyId,
    isDeleted: false,
  }).select('email').lean();

  const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  // 3. Separate new from duplicate
  const toInsert       = [];
  const passwordMap    = new Map(); // email → plaintext password (for welcome emails)
  const seenInBatch    = new Set(); // catch intra-batch duplicates

  for (const { value, rowIndex } of validRows) {
    const emailLower = value.email.toLowerCase();

    if (existingEmailSet.has(emailLower)) {
      failedRows.push({ row: rowIndex, email: value.email, reason: 'Email already exists in this society.' });
      continue;
    }

    if (seenInBatch.has(emailLower)) {
      failedRows.push({ row: rowIndex, email: value.email, reason: 'Duplicate email within the uploaded batch.' });
      continue;
    }

    seenInBatch.add(emailLower);
    const plainPassword = generatePassword();
    passwordMap.set(emailLower, plainPassword);

    toInsert.push({
      ...value,
      email:     emailLower,
      password:  plainPassword, // pre-hashed by the User pre-save hook
      societyId,
    });
  }

  // 4. Bulk insert – insertMany with ordered:false so partial failures don't abort
  let insertedDocs = [];
  if (toInsert.length > 0) {
    try {
      // User.insertMany triggers pre-save hooks for password hashing
      insertedDocs = await User.insertMany(toInsert, { ordered: false });
    } catch (err) {
      // BulkWriteError: some docs may have succeeded; check writeErrors
      if (err.name === 'BulkWriteError' || err.name === 'MongoBulkWriteError') {
        insertedDocs = err.insertedDocs || [];
        const writeErrors = err.writeErrors || [];
        for (const we of writeErrors) {
          const failedDoc = toInsert[we.index];
          failedRows.push({
            row:    we.index + 1,
            email:  failedDoc?.email || '',
            reason: we.errmsg || 'Database write error.',
          });
        }
      } else {
        throw err; // unexpected – let global handler deal with it
      }
    }
  }

  // 5. Send welcome emails asynchronously (do not await – best-effort)
  for (const doc of insertedDocs) {
    const plain = passwordMap.get(doc.email.toLowerCase());
    if (plain) {
      sendResidentWelcomeEmail(
        {
          name:       doc.name,
          email:      doc.email,
          flatNumber: doc.flatNumber,
        },
        plain,
        req.user.societyName || 'your society',
      );
    }
  }

  return ApiResponse.ok(
    `Bulk import complete. ${insertedDocs.length} user(s) created.`,
    { success: insertedDocs.length, failed: failedRows }
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// updateMyProfile
// PATCH /api/users/me
// Available to ALL authenticated roles.
// Supports optional Cloudinary profile photo upload via multer field "photo".
// ─────────────────────────────────────────────────────────────────────────────
const updateMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Text fields validation (photo handled separately)
  const textBody = { ...req.body };
  // Remove photo-related keys that may have leaked into body
  delete textBody.profilePhoto;
  delete textBody.profilePhotoPublicId;

  let hasTextUpdate = Object.keys(textBody).length > 0;
  let hasPhotoUpdate = !!req.file; // multer attaches req.file

  if (!hasTextUpdate && !hasPhotoUpdate) {
    throw APIError.badRequest('Provide at least one field to update (name, phone, or photo).');
  }

  // Validate text fields when present
  let validated = {};
  if (hasTextUpdate) {
    const { error, value } = updateMyProfileSchema.validate(textBody, { abortEarly: false, allowUnknown: false });
    if (error) {
      // If a photo was uploaded but validation fails, remove it from Cloudinary
      if (req.file && req.file.public_id) {
        cloudinary.uploader.destroy(req.file.public_id).catch(() => {});
      }
      throw APIError.badRequest(
        'Validation failed',
        error.details.map((d) => ({ field: d.context.key, message: d.message }))
      );
    }
    validated = value;
  }

  const user = await User.findById(userId);
  if (!user || user.isDeleted) throw APIError.notFound('User account not found.');

  // Apply text updates
  if (validated.name)  user.name  = validated.name;
  if (Object.prototype.hasOwnProperty.call(validated, 'phone')) {
    user.phone = validated.phone || '';
  }

  // Apply photo update: remove old asset from Cloudinary first
  if (req.file) {
    // multer-storage-cloudinary attaches path (URL) and filename (public_id)
    const newUrl      = req.file.path;
    const newPublicId = req.file.filename;

    // Delete previous photo if one was stored
    if (user.profilePhotoPublicId) {
      cloudinary.uploader.destroy(user.profilePhotoPublicId).catch((e) =>
        logger.warn(`Could not delete old profile photo (${user.profilePhotoPublicId}): ${e.message}`)
      );
    }

    user.profilePhoto        = newUrl;
    user.profilePhotoPublicId = newPublicId;
  }

  await user.save();

  return ApiResponse.ok('Profile updated successfully.', sanitizeUser(user)).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  bulkCreateUsers,
  updateMyProfile,
};
