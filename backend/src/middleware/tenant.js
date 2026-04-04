'use strict';

/**
 * tenant.js – Multi-Tenant Resolution & Subscription Feature Middleware
 *
 * Exports:
 *   checkTenant                      – resolve society + subscription, attach to req
 *   checkSubscriptionFeature(feature) – feature-flag gate factory
 */

const mongoose    = require('mongoose');
const Society     = require('../models/Society');
const Subscription = require('../models/Subscription');
const { APIError } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// checkTenant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express middleware – validate the current user's society context and ensure
 * its subscription is active and unexpired.
 *
 * Prerequisites: `authenticate` must run before this middleware so that
 * `req.user` (and specifically `req.user.societyId`) is populated.
 *
 * Behaviour:
 *   • super_admin – bypasses all checks (operates across all tenants).
 *   • All other roles – society must exist, not be deleted, be status=active,
 *     not be in maintenance mode, have an active subscription, and that
 *     subscription must not have passed its expiryDate.
 *
 * Side-effects on success:
 *   req.society      {object}  Lean Society document
 *   req.subscription {object}  Lean Subscription document
 *
 * On failure: calls next(APIError) with an appropriate 4xx status code so the
 * global error handler can format and return the response.
 *
 * Subscription auto-expiry:
 *   When an active subscription record is found but expiryDate has passed the
 *   status field is updated to 'expired' asynchronously (fire-and-forget) so
 *   that the database stays consistent without blocking the response path.
 */
const checkTenant = async (req, res, next) => {
  try {
    // ── Guard: authenticate must run first ────────────────────────────────
    if (!req.user) {
      return next(
        new APIError(
          'Authentication required before tenant verification.',
          401
        )
      );
    }

    // ── Super-admin bypass ────────────────────────────────────────────────
    // Super admins manage the platform itself and are not scoped to a single
    // society, so all tenant checks are irrelevant.
    if (req.user.role === 'super_admin') {
      return next();
    }

    const { societyId } = req.user;

    // ── Every non-super-admin must belong to a society ────────────────────
    if (!societyId) {
      return next(
        new APIError(
          'Your account is not associated with any society. ' +
          'Please contact support.',
          403
        )
      );
    }

    // Validate ObjectId format before hitting the database
    if (!mongoose.Types.ObjectId.isValid(societyId)) {
      return next(
        new APIError('Society identifier in your token is malformed.', 400)
      );
    }

    // ── 1. Fetch and validate the society ─────────────────────────────────
    const society = await Society.findOne({
      _id:       societyId,
      isDeleted: false,
    }).lean();

    if (!society) {
      return next(
        new APIError(
          'Your society could not be found. It may have been removed. ' +
          'Please contact support.',
          403
        )
      );
    }

    if (society.status !== 'active') {
      return next(
        new APIError(
          'Your society account is currently inactive. ' +
          'Please contact your society administrator.',
          403
        )
      );
    }

    // Maintenance mode – block regular users but surface a clear message.
    if (society.settings?.maintenanceMode === true) {
      return next(
        new APIError(
          'Your society is temporarily in maintenance mode. ' +
          'Please try again later.',
          503
        )
      );
    }

    // ── 2. Fetch the most recent active subscription ───────────────────────
    const subscription = await Subscription.findOne({
      societyId,
      status: 'active',
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!subscription) {
      return next(
        new APIError(
          'No active subscription found for your society. ' +
          'Please renew your subscription to continue using the platform.',
          403
        )
      );
    }

    // ── 3. Wall-clock expiry check ─────────────────────────────────────────
    // The status field may lag behind the actual expiry date if background
    // jobs haven't run yet, so we always compare against the current time.
    const now = new Date();
    if (subscription.expiryDate < now) {
      logger.warn(
        `[checkTenant] Subscription expired for society "${societyId}". ` +
        `Plan: ${subscription.plan}. ` +
        `Expired at: ${subscription.expiryDate.toISOString()}`
      );

      // Update the record to 'expired' in the background; don't block here.
      Subscription.findByIdAndUpdate(
        subscription._id,
        { $set: { status: 'expired' } },
        { new: false }
      )
        .exec()
        .catch((updateErr) =>
          logger.error(
            `[checkTenant] Failed to update expired subscription ${subscription._id}:`,
            updateErr
          )
        );

      return next(
        new APIError(
          'Your society subscription has expired. ' +
          'Please contact your administrator to renew.',
          403
        )
      );
    }

    // ── 4. Attach resolved context to the request object ──────────────────
    req.society      = society;
    req.subscription = subscription;

    return next();
  } catch (err) {
    if (err instanceof APIError || err.name === 'APIError') {
      return next(err);
    }
    logger.error('[checkTenant] Unexpected error during tenant verification:', err);
    return next(
      new APIError('Tenant verification failed. Please try again.', 500)
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// checkSubscriptionFeature(feature)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory middleware – gate a route behind a specific subscription feature flag.
 *
 * Prerequisites: `checkTenant` must run before this middleware so that
 * `req.subscription` is populated.
 *
 * super_admin bypasses the check (they are not bound to any plan).
 *
 * Known feature keys (from the Subscription model):
 *   chatEnabled, feedEnabled, announcementsEnabled, complaintsEnabled,
 *   bulkUploadEnabled
 *
 * @param {string} feature  Key within subscription.features to test
 * @returns {import('express').RequestHandler}
 *
 * @throws {Error} At route-registration time if `feature` is not a non-empty string.
 *
 * @example
 *   router.post(
 *     '/bulk-upload',
 *     authenticate,
 *     checkTenant,
 *     checkSubscriptionFeature('bulkUploadEnabled'),
 *     bulkUploadHandler
 *   );
 */
const checkSubscriptionFeature = (feature) => {
  // Fail fast at startup when called incorrectly
  if (!feature || typeof feature !== 'string' || feature.trim() === '') {
    throw new Error(
      '[checkSubscriptionFeature] A non-empty feature name string is required.'
    );
  }

  const featureName = feature.trim();

  return (req, res, next) => {
    // Super admins are not subject to feature gating
    if (req.user?.role === 'super_admin') {
      return next();
    }

    // Guard: checkTenant must have run before this middleware
    if (!req.subscription) {
      logger.error(
        '[checkSubscriptionFeature] req.subscription is not set. ' +
        'Ensure checkTenant runs before checkSubscriptionFeature in the middleware chain.'
      );
      return next(
        new APIError(
          'Subscription context is missing. Server configuration error.',
          500
        )
      );
    }

    const featureEnabled = req.subscription.features?.[featureName];

    if (!featureEnabled) {
      logger.warn(
        `[checkSubscriptionFeature] Feature "${featureName}" is not enabled ` +
        `for society ${req.user?.societyId} ` +
        `(plan: "${req.subscription.plan}").`
      );
      return next(
        new APIError(
          `The feature "${featureName}" is not included in your current ` +
          `subscription plan (${req.subscription.plan}). ` +
          `Please upgrade your plan to access this feature.`,
          403
        )
      );
    }

    return next();
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { checkTenant, checkSubscriptionFeature };
