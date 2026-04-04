'use strict';

/**
 * subscription.controller.js
 *
 * Manages society subscriptions.
 *
 * Roles:
 *   getSubscription        – society_admin (own society) | super_admin (any :societyId)
 *   updateSubscription     – super_admin only
 *   getSubscriptionStatus  – society_admin (own society) | super_admin (any :societyId)
 *   getAllSubscriptions     – super_admin only
 *
 * All helpers imported from ../utils/helpers.
 */

const Joi          = require('joi');
const mongoose     = require('mongoose');
const Subscription = require('../models/Subscription');
const Society      = require('../models/Society');
const {
  asyncHandler,
  APIError,
  ApiResponse,
  paginate,
  paginateMeta,
} = require('../utils/helpers');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Plan → feature matrix
// Defines the default feature set that is auto-applied when a plan changes.
// Custom plans can be further overridden by the request body's features field.
// ─────────────────────────────────────────────────────────────────────────────
const PLAN_FEATURES = {
  basic: {
    maxUsers:              100,
    maxGroups:             5,
    chatEnabled:           false,
    feedEnabled:           true,
    announcementsEnabled:  true,
    complaintsEnabled:     true,
    bulkUploadEnabled:     false,
  },
  premium: {
    maxUsers:              500,
    maxGroups:             50,
    chatEnabled:           true,
    feedEnabled:           true,
    announcementsEnabled:  true,
    complaintsEnabled:     true,
    bulkUploadEnabled:     true,
  },
  custom: {
    // 'custom' starts from the premium baseline; caller must supply overrides
    maxUsers:              1000,
    maxGroups:             200,
    chatEnabled:           true,
    feedEnabled:           true,
    announcementsEnabled:  true,
    complaintsEnabled:     true,
    bulkUploadEnabled:     true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Joi validation schema for updateSubscription
// ─────────────────────────────────────────────────────────────────────────────
const updateSubscriptionSchema = Joi.object({
  plan: Joi.string()
    .valid('basic', 'premium', 'custom')
    .messages({ 'any.only': 'Plan must be one of: basic, premium, custom' }),

  expiryDate: Joi.date()
    .iso()
    .greater('now')
    .messages({
      'date.greater': 'Expiry date must be in the future',
      'date.format':  'Expiry date must be a valid ISO 8601 date string',
    }),

  price: Joi.number()
    .min(0)
    .precision(2)
    .messages({ 'number.min': 'Price must be zero or a positive number' }),

  currency: Joi.string()
    .trim()
    .uppercase()
    .length(3)
    .default('INR')
    .messages({ 'string.length': 'Currency must be a 3-letter ISO code (e.g. INR, USD)' }),

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow('', null)
    .messages({ 'string.max': 'Notes must not exceed 1000 characters' }),

  // Optional feature overrides – only relevant for 'custom' plans (or to fine-tune any plan)
  features: Joi.object({
    maxUsers:             Joi.number().integer().min(1),
    maxGroups:            Joi.number().integer().min(0),
    chatEnabled:          Joi.boolean(),
    feedEnabled:          Joi.boolean(),
    announcementsEnabled: Joi.boolean(),
    complaintsEnabled:    Joi.boolean(),
    bulkUploadEnabled:    Joi.boolean(),
  }).optional(),
}).min(1).messages({ 'object.min': 'At least one field must be provided to update the subscription.' });

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the societyId to query:
 *   - super_admin can pass :societyId in the URL params; falls back to body.
 *   - society_admin always uses their own req.user.societyId.
 */
const resolveSocietyId = (req) => {
  if (req.user.role === 'super_admin') {
    const id = req.params.societyId || req.query.societyId;
    if (!id) throw APIError.badRequest('societyId is required for super_admin.');
    if (!mongoose.Types.ObjectId.isValid(id)) throw APIError.badRequest('Invalid societyId format.');
    return id;
  }
  const id = req.user.societyId;
  if (!id) throw APIError.forbidden('No society is associated with your account.');
  return id;
};

/**
 * Compute a real-time status string from the stored subscription document.
 * The stored `status` may lag behind the actual expiry date, so we derive it
 * from expiryDate at query time and optionally persist corrections.
 */
const deriveStatus = (subscription) => {
  const now = Date.now();
  const expiry = new Date(subscription.expiryDate).getTime();
  if (expiry <= now) return 'expired';
  return subscription.status === 'cancelled' ? 'cancelled' : 'active';
};

/**
 * Compute days remaining until expiry (negative when already expired).
 */
const daysRemaining = (expiryDate) => {
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ─────────────────────────────────────────────────────────────────────────────
// getSubscription
// GET /api/subscriptions/my          (society_admin)
// GET /api/subscriptions/:societyId  (super_admin)
// ─────────────────────────────────────────────────────────────────────────────
const getSubscription = asyncHandler(async (req, res) => {
  const societyId = resolveSocietyId(req);

  const subscription = await Subscription.findOne({ societyId })
    .populate({ path: 'societyId', select: 'name city address status logo' })
    .sort({ createdAt: -1 }) // most recent if multiple exist
    .lean();

  if (!subscription) {
    throw APIError.notFound('No subscription found for this society.');
  }

  // Augment with computed real-time status
  subscription.computedStatus = deriveStatus(subscription);
  subscription.daysRemaining  = daysRemaining(subscription.expiryDate);

  return ApiResponse.ok('Subscription fetched successfully.', subscription).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// updateSubscription
// PATCH /api/subscriptions/:societyId   (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
const updateSubscription = asyncHandler(async (req, res) => {
  // Authorization: only super_admin may call this endpoint.
  // The route-level authorize('super_admin') middleware should enforce this,
  // but we double-check here for defence-in-depth.
  if (req.user.role !== 'super_admin') {
    throw APIError.forbidden('Only super_admin can update subscriptions.');
  }

  const { societyId } = req.params;
  if (!societyId || !mongoose.Types.ObjectId.isValid(societyId)) {
    throw APIError.badRequest('A valid societyId path parameter is required.');
  }

  // 1. Validate request body
  const { error, value } = updateSubscriptionSchema.validate(req.body, {
    abortEarly:   false,
    stripUnknown: true,
    convert:      true,
  });
  if (error) {
    throw APIError.unprocessable(
      'Validation failed',
      error.details.map((d) => ({ field: d.context?.key || d.path.join('.'), message: d.message }))
    );
  }

  // 2. Ensure the society exists
  const society = await Society.findOne({ _id: societyId, isDeleted: false }).lean();
  if (!society) throw APIError.notFound('Society not found.');

  // 3. Load or create subscription document
  let subscription = await Subscription.findOne({ societyId });
  if (!subscription) {
    // Bootstrap a new subscription record
    subscription = new Subscription({ societyId });
  }

  // 4. If plan changes, auto-apply default features for that plan first
  const planChanged = value.plan && value.plan !== subscription.plan;
  if (planChanged) {
    const planDefaults = PLAN_FEATURES[value.plan] || {};
    subscription.plan     = value.plan;
    subscription.features = { ...planDefaults };
    logger.info(
      `[updateSubscription] Plan changed to "${value.plan}" for society ${societyId}. ` +
      `Auto-applied default features.`
    );
  }

  // 5. Apply caller-supplied feature overrides on top of plan defaults
  if (value.features && typeof value.features === 'object') {
    subscription.features = { ...subscription.features.toObject?.() ?? subscription.features, ...value.features };
  }

  // 6. Apply scalar fields
  if (value.expiryDate !== undefined) subscription.expiryDate = value.expiryDate;
  if (value.price      !== undefined) subscription.price      = value.price;
  if (value.currency   !== undefined) subscription.currency   = value.currency;
  if (value.notes      !== undefined) subscription.notes      = value.notes;

  // 7. Recalculate subscription status from the new expiryDate
  const expiry = new Date(subscription.expiryDate).getTime();
  subscription.status = expiry > Date.now() ? 'active' : 'expired';

  // 8. Reset reminder flag when the subscription is renewed / extended
  if (value.expiryDate) {
    subscription.reminderSent   = false;
    subscription.reminderSentAt = undefined;
  }

  await subscription.save();

  const result = await Subscription.findById(subscription._id)
    .populate({ path: 'societyId', select: 'name city address status' })
    .lean();

  result.computedStatus = deriveStatus(result);
  result.daysRemaining  = daysRemaining(result.expiryDate);

  return ApiResponse.ok('Subscription updated successfully.', result).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getSubscriptionStatus
// GET /api/subscriptions/status/my          (society_admin)
// GET /api/subscriptions/status/:societyId  (super_admin)
//
// Lightweight endpoint – returns computed status, days remaining, and the full
// features object so the frontend can gate feature access in real time.
// ─────────────────────────────────────────────────────────────────────────────
const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const societyId = resolveSocietyId(req);

  const subscription = await Subscription.findOne({ societyId })
    .sort({ createdAt: -1 })
    .lean();

  if (!subscription) {
    // Return a safe default rather than a 404 so the frontend can still render
    return ApiResponse.ok('No active subscription found.', {
      isActive:       false,
      isExpired:      true,
      daysRemaining:  0,
      plan:           null,
      features:       {},
      computedStatus: 'expired',
    }).send(res);
  }

  const remaining       = daysRemaining(subscription.expiryDate);
  const computedStatus  = deriveStatus(subscription);
  const isExpired       = computedStatus === 'expired';
  const isActive        = computedStatus === 'active';
  const isExpiringSoon  = isActive && remaining <= 7;

  return ApiResponse.ok('Subscription status fetched successfully.', {
    isActive,
    isExpired,
    isExpiringSoon,
    daysRemaining:  remaining,
    plan:           subscription.plan,
    expiryDate:     subscription.expiryDate,
    computedStatus,
    features:       subscription.features,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllSubscriptions
// GET /api/subscriptions?page&limit&plan&status&search
// super_admin only – paginated list of all subscriptions with society info.
// ─────────────────────────────────────────────────────────────────────────────
const getAllSubscriptions = asyncHandler(async (req, res) => {
  if (req.user.role !== 'super_admin') {
    throw APIError.forbidden('Only super_admin can view all subscriptions.');
  }

  const { page: rawPage, limit: rawLimit, plan, status, search } = req.query;
  const { page, limit, skip } = paginate(rawPage, rawLimit);

  // ── Build aggregation pipeline ─────────────────────────────────────────────
  // We use aggregation so we can:
  //   a) $lookup society info in one query
  //   b) compute a real-time `computedStatus` field
  //   c) filter on society name via search
  //   d) filter on computed status (which may differ from stored status)

  const matchStage = {};

  if (plan && ['basic', 'premium', 'custom'].includes(plan)) {
    matchStage.plan = plan;
  }

  // Status filter: apply post-lookup so we can use computed status
  // We'll filter on the stored status first as a fast pre-filter, then recompute
  if (status && ['active', 'expired', 'cancelled'].includes(status)) {
    matchStage.status = status;
  }

  const pipeline = [
    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from:         'societies',
        localField:   'societyId',
        foreignField: '_id',
        as:           'society',
      },
    },
    { $unwind: { path: '$society', preserveNullAndEmpty: false } },
    // Filter out deleted societies
    { $match: { 'society.isDeleted': { $ne: true } } },
  ];

  // Optional search by society name or city
  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex   = new RegExp(escaped, 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'society.name': { $regex: regex } },
          { 'society.city': { $regex: regex } },
        ],
      },
    });
  }

  // Add computed fields
  pipeline.push({
    $addFields: {
      daysRemaining: {
        $ceil: {
          $divide: [
            { $subtract: ['$expiryDate', new Date()] },
            1000 * 60 * 60 * 24,
          ],
        },
      },
      computedStatus: {
        $cond: {
          if:   { $lte: ['$expiryDate', new Date()] },
          then: 'expired',
          else: {
            $cond: {
              if:   { $eq: ['$status', 'cancelled'] },
              then: 'cancelled',
              else: 'active',
            },
          },
        },
      },
    },
  });

  // Post-computed-status filter (when caller explicitly filters by computed status)
  if (status && ['active', 'expired', 'cancelled'].includes(status)) {
    pipeline.push({ $match: { computedStatus: status } });
  }

  // Count before pagination
  const countPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline  = [
    ...pipeline,
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        plan:          1,
        startDate:     1,
        expiryDate:    1,
        status:        1,
        computedStatus: 1,
        daysRemaining: 1,
        features:      1,
        price:         1,
        currency:      1,
        notes:         1,
        reminderSent:  1,
        reminderSentAt: 1,
        createdAt:     1,
        updatedAt:     1,
        society: {
          _id:     1,
          name:    1,
          city:    1,
          address: 1,
          status:  1,
          logo:    1,
        },
      },
    },
  ];

  const [countResult, subscriptions] = await Promise.all([
    Subscription.aggregate(countPipeline),
    Subscription.aggregate(dataPipeline),
  ]);

  const totalDocs = countResult[0]?.total ?? 0;

  return ApiResponse.ok(
    'Subscriptions fetched successfully.',
    subscriptions,
    paginateMeta(totalDocs, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getSubscription,
  updateSubscription,
  getSubscriptionStatus,
  getAllSubscriptions,
};
