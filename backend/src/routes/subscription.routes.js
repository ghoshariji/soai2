'use strict';

/**
 * subscription.routes.js
 *
 * GET  /api/subscriptions/my               → getSubscription       (authenticate + checkTenant)
 * GET  /api/subscriptions                  → getAllSubscriptions    (super_admin)
 * PUT  /api/subscriptions/:societyId       → updateSubscription    (super_admin)
 * GET  /api/subscriptions/:societyId/status → getSubscriptionStatus (authenticate)
 *
 * NOTE: /my is declared before /:societyId to prevent Express matching "my" as
 *       a societyId parameter.
 */

const express = require('express');

const {
  getSubscription,
  getAllSubscriptions,
  updateSubscription,
  getSubscriptionStatus,
} = require('../controllers/subscription.controller');

const { authenticate, authorize } = require('../middleware/auth');
const { checkTenant }             = require('../middleware/tenant');

const router = express.Router();

// GET /api/subscriptions/my  – own society subscription (society_admin scoped)
router.get('/my', authenticate, checkTenant, getSubscription);

// GET /api/subscriptions  – all subscriptions (super_admin)
router.get('/', authenticate, authorize('super_admin'), getAllSubscriptions);

// PUT /api/subscriptions/:societyId  – update a society's subscription (super_admin)
router.put('/:societyId', authenticate, authorize('super_admin'), updateSubscription);

// GET /api/subscriptions/:societyId/status
router.get('/:societyId/status', authenticate, getSubscriptionStatus);

module.exports = router;
