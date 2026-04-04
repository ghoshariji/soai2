'use strict';

/**
 * group.routes.js
 *
 * All routes require authenticate + checkTenant.
 *
 * POST   /api/groups                          → createGroup          (society_admin)
 * GET    /api/groups                          → getGroups
 * GET    /api/groups/:id                      → getGroup
 * PUT    /api/groups/:id                      → updateGroup          (society_admin)
 * DELETE /api/groups/:id                      → deleteGroup          (society_admin)
 * POST   /api/groups/:id/members              → addMember            (society_admin)
 * DELETE /api/groups/:id/members/:userId      → removeMember         (society_admin)
 * POST   /api/groups/:id/join                 → joinGroup
 * DELETE /api/groups/:id/leave                → leaveGroup
 * PATCH  /api/groups/:id/members/:userId/mute → muteUser             (society_admin)
 */

const express = require('express');

const {
  createGroup,
  getGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  joinGroup,
  leaveGroup,
  muteUser,
} = require('../controllers/group.controller');

const { authenticate, authorize } = require('../middleware/auth');
const { checkTenant }             = require('../middleware/tenant');

const router = express.Router();

// Apply authenticate + checkTenant to every group route
router.use(authenticate, checkTenant);

// POST /api/groups  (society_admin)
router.post('/', authorize('society_admin'), createGroup);

// GET /api/groups
router.get('/', getGroups);

// GET /api/groups/:id
router.get('/:id', getGroup);

// PUT /api/groups/:id  (society_admin)
router.put('/:id', authorize('society_admin'), updateGroup);

// DELETE /api/groups/:id  (society_admin)
router.delete('/:id', authorize('society_admin'), deleteGroup);

// POST /api/groups/:id/members  (society_admin)
router.post('/:id/members', authorize('society_admin'), addMember);

// DELETE /api/groups/:id/members/:userId  (society_admin)
router.delete('/:id/members/:userId', authorize('society_admin'), removeMember);

// POST /api/groups/:id/join
router.post('/:id/join', joinGroup);

// DELETE /api/groups/:id/leave
router.delete('/:id/leave', leaveGroup);

// PATCH /api/groups/:id/members/:userId/mute  (society_admin)
router.patch('/:id/members/:userId/mute', authorize('society_admin'), muteUser);

module.exports = router;
