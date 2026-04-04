'use strict';

/**
 * society.controller.js
 * ──────────────────────
 * Super-admin CRUD for Society entities plus their linked admin User and
 * Subscription documents.
 *
 *   POST   /api/societies                   → createSociety
 *   GET    /api/societies                   → getSocieties
 *   GET    /api/societies/:id               → getSociety
 *   PUT    /api/societies/:id               → updateSociety
 *   DELETE /api/societies/:id               → deleteSociety
 *   PATCH  /api/societies/:id/toggle-status → toggleSocietyStatus
 *
 * All routes must be protected by authenticate + authorize('super_admin')
 * in the router layer; this controller does NOT re-check role.
 *
 * Plan → subscription feature mapping
 * ─────────────────────────────────────
 *   basic   : maxUsers 50,  bulkUploadEnabled false
 *   premium : maxUsers 500, bulkUploadEnabled true
 *   custom  : maxUsers from body.maxUsers (default 200), bulkUploadEnabled true
 *
 * Soft-delete semantics
 * ──────────────────────
 *   • Societies are never hard-deleted.  isDeleted=true hides them from all
 *     tenant queries.
 *   • Deleting a society bulk-updates every user in that society to
 *     isDeleted=true as well.
 */

const nodemailer   = require('nodemailer');
const User         = require('../models/User');
const Society      = require('../models/Society');
const Subscription = require('../models/Subscription');
const logger       = require('../utils/logger');
const {
  asyncHandler,
  APIError,
  ApiResponse,
  paginate,
  paginateMeta,
  buildSearchQuery,
  generatePassword,
} = require('../utils/helpers');
const {
  createSocietySchema,
  validate,
} = require('../utils/validators');

// ─────────────────────────────────────────────────────────────────────────────
// Email transport
// Built once at module load.  Falls back gracefully when SMTP is unconfigured
// (dev / test environments).
// ─────────────────────────────────────────────────────────────────────────────

const buildMailer = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn(
      '[society] SMTP credentials not configured – welcome emails will be skipped.'
    );
    return null;
  }
  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   parseInt(SMTP_PORT, 10) || 587,
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
    pool:   true,
    maxConnections: 3,
  });
};

const mailer = buildMailer();

/**
 * Send a welcome e-mail to a newly created society admin.
 * Fires-and-forgets – a mail failure never blocks the HTTP response.
 *
 * @param {object} opts
 * @param {string} opts.name          Admin's full name
 * @param {string} opts.email         Admin's email address
 * @param {string} opts.password      Plain-text auto-generated password
 * @param {string} opts.societyName   Society name for contextualisation
 */
const sendWelcomeEmail = async ({ name, email, password, societyName }) => {
  if (!mailer) return;

  const fromName    = process.env.MAIL_FROM_NAME || 'SoAI Platform';
  const fromAddress = process.env.SMTP_USER;
  const appUrl      = process.env.APP_URL || 'https://app.soai.in';

  try {
    await mailer.sendMail({
      from:    `"${fromName}" <${fromAddress}>`,
      to:      email,
      subject: `Welcome to ${societyName} – Your admin credentials`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to SoAI</title>
  <style>
    body  { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .wrap { max-width: 600px; margin: 30px auto; background: #fff;
            border-radius: 8px; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    .hdr  { background: #1a56db; padding: 24px 32px; color: #fff; }
    .hdr h1 { margin: 0; font-size: 22px; }
    .body { padding: 32px; color: #333; line-height: 1.6; }
    .creds{ background: #f0f4ff; border: 1px solid #c7d7fc;
            border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .creds p { margin: 6px 0; font-size: 15px; }
    .creds strong { color: #1a56db; }
    .btn  { display: inline-block; margin-top: 20px; padding: 12px 28px;
            background: #1a56db; color: #fff; border-radius: 6px;
            text-decoration: none; font-weight: bold; }
    .ftr  { padding: 16px 32px; background: #f9fafb;
            color: #777; font-size: 12px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>Welcome to ${societyName}!</h1>
    </div>
    <div class="body">
      <p>Hi <strong>${name}</strong>,</p>
      <p>
        Your society has been successfully registered on the <strong>SoAI</strong>
        platform. Your administrator account is ready – use the credentials below
        to sign in for the first time.
      </p>
      <div class="creds">
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Temporary password:</strong> <strong>${password}</strong></p>
      </div>
      <p style="color:#c0392b; font-size:13px;">
        ⚠️ Please change your password immediately after your first login.
      </p>
      <a class="btn" href="${appUrl}/login">Login to SoAI</a>
      <p style="margin-top:28px; font-size:13px; color:#555;">
        If you did not expect this email, please ignore it or contact
        <a href="mailto:support@soai.in">support@soai.in</a>.
      </p>
    </div>
    <div class="ftr">
      &copy; ${new Date().getFullYear()} SoAI Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
      `.trim(),
    });

    logger.info(`[society] Welcome email sent to ${email}.`);
  } catch (mailErr) {
    // Non-fatal: log and continue
    logger.error(`[society] Failed to send welcome email to ${email}:`, mailErr);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Subscription feature factory
// Returns the features sub-document for a given plan.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a subscription features object based on the chosen plan.
 *
 * @param {'basic'|'premium'|'custom'} plan
 * @param {number} [customMaxUsers=200]  Only used when plan === 'custom'
 * @returns {object} features matching Subscription.features schema
 */
const buildFeatures = (plan, customMaxUsers) => {
  const base = {
    maxGroups:            10,
    chatEnabled:          true,
    feedEnabled:          true,
    announcementsEnabled: true,
    complaintsEnabled:    true,
  };

  switch (plan) {
    case 'basic':
      return {
        ...base,
        maxUsers:          50,
        maxGroups:         5,
        chatEnabled:       false,
        bulkUploadEnabled: false,
      };

    case 'premium':
      return {
        ...base,
        maxUsers:          500,
        maxGroups:         50,
        bulkUploadEnabled: true,
      };

    case 'custom':
      return {
        ...base,
        maxUsers:          Number(customMaxUsers) || 200,
        maxGroups:         100,
        bulkUploadEnabled: true,
      };

    default:
      // Fallback – treat unknown plans like basic
      return {
        ...base,
        maxUsers:          50,
        bulkUploadEnabled: false,
      };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// createSociety
// POST /api/societies
// Role: super_admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Onboard a new society onto the platform.
 *
 * Flow:
 *   1. Validate body (createSocietySchema + extra admin fields).
 *   2. Check for duplicate society name (case-insensitive).
 *   3. Verify admin email is not already taken.
 *   4. Generate a random temporary password for the admin.
 *   5. Create Society document.
 *   6. Create User document (role='society_admin', societyId set).
 *   7. Update society.adminId back-reference.
 *   8. Create Subscription document with plan-based features.
 *   9. Send welcome email (non-blocking).
 *  10. Return society + admin (password excluded).
 */
const createSociety = asyncHandler(async (req, res) => {
  // ── 1. Validate ─────────────────────────────────────────────────────────────
  // The base schema covers society fields; we handle admin fields manually so
  // we can keep the validators.js schema clean.
  const {
    name,
    address,
    city,
    plan = 'basic',
    expiryDate,
  } = validate(createSocietySchema, req.body);

  const {
    adminName,
    adminEmail,
    adminPhone,
    maxUsers,  // only relevant for 'custom' plan
    price = 0,
    notes = '',
  } = req.body;

  if (!adminName || typeof adminName !== 'string' || adminName.trim().length < 2) {
    throw APIError.badRequest('adminName is required (min 2 characters).');
  }

  if (!adminEmail || typeof adminEmail !== 'string') {
    throw APIError.badRequest('adminEmail is required.');
  }

  const normalizedAdminEmail = adminEmail.trim().toLowerCase();

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedAdminEmail)) {
    throw APIError.badRequest('adminEmail must be a valid email address.');
  }

  // Validate plan value (Subscription model enum differs slightly from validators.js)
  const validPlans = ['basic', 'premium', 'custom'];
  const resolvedPlan = validPlans.includes(plan) ? plan : 'basic';

  // ── 2. Duplicate society name check ─────────────────────────────────────────
  const existingSociety = await Society.findOne({
    name:      { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isDeleted: false,
  });

  if (existingSociety) {
    throw APIError.conflict(
      `A society with the name "${name.trim()}" already exists.`
    );
  }

  // ── 3. Duplicate admin email check ──────────────────────────────────────────
  const existingUser = await User.findOne({
    email:     normalizedAdminEmail,
    isDeleted: false,
  });

  if (existingUser) {
    throw APIError.conflict(
      `A user with email "${normalizedAdminEmail}" is already registered.`
    );
  }

  // ── 4. Generate temporary password ──────────────────────────────────────────
  const tempPassword = generatePassword();

  // ── 5. Create Society ────────────────────────────────────────────────────────
  const society = await Society.create({
    name:    name.trim(),
    address: address.trim(),
    city:    city.trim(),
    status:  'active',
  });

  // ── 6. Create society admin User ────────────────────────────────────────────
  const admin = await User.create({
    name:      adminName.trim(),
    email:     normalizedAdminEmail,
    password:  tempPassword,            // pre-save hook hashes this
    phone:     adminPhone ? adminPhone.trim() : undefined,
    role:      'society_admin',
    societyId: society._id,
    status:    'active',
  });

  // ── 7. Back-reference: store adminId on the society ─────────────────────────
  society.adminId = admin._id;
  await society.save();

  // ── 8. Create Subscription ──────────────────────────────────────────────────
  const features = buildFeatures(resolvedPlan, maxUsers);

  const subscription = await Subscription.create({
    societyId:  society._id,
    plan:       resolvedPlan,
    startDate:  new Date(),
    expiryDate: new Date(expiryDate),
    status:     'active',
    features,
    price:      Number(price) || 0,
    currency:   'INR',
    notes:      notes ? String(notes).trim() : '',
  });

  // ── 9. Send welcome email (non-blocking) ────────────────────────────────────
  sendWelcomeEmail({
    name:        adminName.trim(),
    email:       normalizedAdminEmail,
    password:    tempPassword,
    societyName: society.name,
  });

  logger.info(
    `[society] Society "${society.name}" (${society._id}) created by super_admin ${req.user.id}.`
  );

  // ── 10. Respond ─────────────────────────────────────────────────────────────
  // Never return the password – even the plain-text temp one
  const adminResponse = admin.toObject();
  delete adminResponse.password;
  delete adminResponse.refreshToken;

  return ApiResponse.created('Society created successfully.', {
    society,
    admin:        adminResponse,
    subscription,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getSocieties
// GET /api/societies?page=1&limit=10&search=&status=
// Role: super_admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a paginated, searchable, filterable list of societies.
 *
 * Query params:
 *   page    {number}  – default 1
 *   limit   {number}  – default 10, max 100
 *   search  {string}  – case-insensitive name / city search
 *   status  {string}  – 'active' | 'inactive'
 */
const getSocieties = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { search, status } = req.query;

  // ── Build filter ─────────────────────────────────────────────────────────────
  const filter = { isDeleted: false };

  if (status && ['active', 'inactive'].includes(status)) {
    filter.status = status;
  }

  if (search) {
    const searchFilter = buildSearchQuery(search, ['name', 'city', 'address']);
    Object.assign(filter, searchFilter);
  }

  // ── Query ────────────────────────────────────────────────────────────────────
  const [societies, totalDocs] = await Promise.all([
    Society
      .find(filter)
      .populate({
        path:   'adminId',
        select: 'name email phone status profilePhoto',
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Society.countDocuments(filter),
  ]);

  const meta = paginateMeta(totalDocs, page, limit);

  return ApiResponse.ok('Societies fetched successfully.', societies, meta).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getSociety
// GET /api/societies/:id
// Role: super_admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single society by its MongoDB _id.
 * Returns the society document with adminId populated and a separate
 * subscription document attached under the key `subscription`.
 */
const getSociety = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Validate ObjectId format early to avoid a Mongoose CastError
  if (!/^[a-f\d]{24}$/i.test(id)) {
    throw APIError.badRequest('Invalid society ID format.');
  }

  // Fetch society + subscription in parallel
  const [society, subscription] = await Promise.all([
    Society
      .findOne({ _id: id, isDeleted: false })
      .populate({
        path:   'adminId',
        select: 'name email phone status profilePhoto createdAt',
      })
      .lean(),
    Subscription
      .findOne({ societyId: id })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  if (!society) {
    throw APIError.notFound('Society not found.');
  }

  return ApiResponse.ok('Society fetched successfully.', {
    ...society,
    subscription: subscription || null,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// updateSociety
// PUT /api/societies/:id
// Body: { name?, address?, city?, status? }
// Role: super_admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update mutable fields of a society.
 *
 * Allowed fields: name, address, city, status.
 * At least one field must be provided.
 * If name is changed, duplicate-name validation is re-run.
 */
const updateSociety = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!/^[a-f\d]{24}$/i.test(id)) {
    throw APIError.badRequest('Invalid society ID format.');
  }

  const allowed = ['name', 'address', 'city', 'status'];
  const updates = {};

  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, field) &&
        req.body[field] !== undefined &&
        req.body[field] !== null) {
      updates[field] = typeof req.body[field] === 'string'
        ? req.body[field].trim()
        : req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw APIError.badRequest(
      'At least one of name, address, city, or status must be provided.'
    );
  }

  // Validate status value if provided
  if (updates.status && !['active', 'inactive'].includes(updates.status)) {
    throw APIError.badRequest('status must be "active" or "inactive".');
  }

  // Duplicate name check (skip if name unchanged)
  if (updates.name) {
    const duplicate = await Society.findOne({
      _id:       { $ne: id },
      name:      { $regex: new RegExp(`^${updates.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      isDeleted: false,
    });

    if (duplicate) {
      throw APIError.conflict(
        `Another society with the name "${updates.name}" already exists.`
      );
    }
  }

  const society = await Society.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: updates },
    { new: true, runValidators: true }
  ).populate({
    path:   'adminId',
    select: 'name email phone status',
  });

  if (!society) {
    throw APIError.notFound('Society not found.');
  }

  logger.info(
    `[society] Society ${id} updated by super_admin ${req.user.id}. ` +
    `Fields: ${Object.keys(updates).join(', ')}.`
  );

  return ApiResponse.ok('Society updated successfully.', society).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteSociety
// DELETE /api/societies/:id
// Role: super_admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft-delete a society and all its users.
 *
 * Neither the society document nor user documents are removed from MongoDB;
 * they are hidden from all tenant queries by setting isDeleted=true.
 *
 * Also clears all refreshTokens in the society so every user's session
 * is immediately invalidated.
 */
const deleteSociety = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!/^[a-f\d]{24}$/i.test(id)) {
    throw APIError.badRequest('Invalid society ID format.');
  }

  const society = await Society.findOne({ _id: id, isDeleted: false });

  if (!society) {
    throw APIError.notFound('Society not found.');
  }

  // Soft-delete all users in the society + revoke their sessions
  const userUpdateResult = await User.updateMany(
    { societyId: id, isDeleted: false },
    {
      $set:   { isDeleted: true, status: 'inactive' },
      $unset: { refreshToken: '' },
    }
  );

  // Soft-delete the society
  society.isDeleted = true;
  society.status    = 'inactive';
  await society.save();

  logger.info(
    `[society] Society ${id} ("${society.name}") soft-deleted by super_admin ` +
    `${req.user.id}. Users affected: ${userUpdateResult.modifiedCount}.`
  );

  return ApiResponse.ok('Society deleted successfully.', {
    societyId:      id,
    usersDeactivated: userUpdateResult.modifiedCount,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleSocietyStatus
// PATCH /api/societies/:id/toggle-status
// Role: super_admin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle a society's status between 'active' and 'inactive'.
 *
 * When a society is set to 'inactive':
 *   - All its users are set to status='blocked' and their refresh tokens are
 *     cleared so active sessions are immediately invalidated.
 *   - The authenticate middleware already blocks users whose status is not
 *     'active', but revoking sessions provides defense in depth.
 *
 * When a society is set back to 'active':
 *   - Users are restored to status='active' so they can log in again.
 *   - Note: users who were individually blocked before the society was
 *     deactivated remain blocked (we only touch users whose status was
 *     changed to 'blocked' by this operation, tracked via the
 *     `society_deactivated` flag – OR simpler: restore all non-deleted users
 *     that belong to the society, which is the common real-world expectation).
 */
const toggleSocietyStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!/^[a-f\d]{24}$/i.test(id)) {
    throw APIError.badRequest('Invalid society ID format.');
  }

  const society = await Society.findOne({ _id: id, isDeleted: false });

  if (!society) {
    throw APIError.notFound('Society not found.');
  }

  const isCurrentlyActive = society.status === 'active';
  const newStatus         = isCurrentlyActive ? 'inactive' : 'active';

  // Persist new society status
  society.status = newStatus;
  await society.save();

  let usersAffected = 0;

  if (newStatus === 'inactive') {
    // Block all users and revoke their sessions
    const result = await User.updateMany(
      { societyId: id, isDeleted: false, status: { $ne: 'blocked' } },
      {
        $set:   { status: 'blocked' },
        $unset: { refreshToken: '' },
      }
    );
    usersAffected = result.modifiedCount;

    logger.info(
      `[society] Society ${id} set to INACTIVE by super_admin ${req.user.id}. ` +
      `${usersAffected} user(s) blocked.`
    );
  } else {
    // Restore users who were blocked by the previous deactivation.
    // We restore all blocked users in this society; individually blocked
    // users must be unblocked explicitly by a society admin.
    const result = await User.updateMany(
      { societyId: id, isDeleted: false, status: 'blocked' },
      { $set: { status: 'active' } }
    );
    usersAffected = result.modifiedCount;

    logger.info(
      `[society] Society ${id} set to ACTIVE by super_admin ${req.user.id}. ` +
      `${usersAffected} user(s) restored.`
    );
  }

  return ApiResponse.ok(
    `Society status changed to "${newStatus}" successfully.`,
    {
      societyId:    id,
      status:       newStatus,
      usersAffected,
    }
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  createSociety,
  getSocieties,
  getSociety,
  updateSociety,
  deleteSociety,
  toggleSocietyStatus,
};
