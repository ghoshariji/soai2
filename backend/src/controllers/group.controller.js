'use strict';

/**
 * group.controller.js
 *
 * Manages Group resources scoped to a society (multi-tenant).
 *
 * Routes (expected):
 *   POST   /api/groups                       createGroup      (society_admin)
 *   GET    /api/groups                       getGroups        (any authenticated)
 *   GET    /api/groups/:id                   getGroup         (any authenticated)
 *   PATCH  /api/groups/:id                   updateGroup      (group admin/moderator or society_admin)
 *   DELETE /api/groups/:id                   deleteGroup      (society_admin)
 *   POST   /api/groups/:id/members           addMember        (society_admin)
 *   DELETE /api/groups/:id/members/:userId   removeMember     (society_admin)
 *   POST   /api/groups/:id/join              joinGroup        (any authenticated)
 *   POST   /api/groups/:id/leave             leaveGroup       (any authenticated)
 *   PATCH  /api/groups/:id/mute/:userId      muteUser         (society_admin or group admin)
 */

const mongoose    = require('mongoose');
const Group        = require('../models/Group');
const Message      = require('../models/Message');
const User         = require('../models/User');
const Subscription = require('../models/Subscription');
const {
  asyncHandler,
  APIError,
  ApiResponse,
  paginate,
  paginateMeta,
} = require('../utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the member sub-document for a given userId string, or null.
 * @param {import('../models/Group').default} group
 * @param {string} userIdStr
 */
const findMember = (group, userIdStr) =>
  group.members.find((m) => m.userId.toString() === userIdStr) || null;

/**
 * Ensure the caller's societyId is set; throw 403 otherwise.
 * @param {object} reqUser  req.user as set by authenticate middleware
 */
const requireSocietyId = (reqUser) => {
  if (!reqUser.societyId) {
    throw APIError.forbidden('No society associated with your account.');
  }
  return reqUser.societyId;
};

/**
 * Fetch the active subscription for a society and return its features object.
 * Throws 402 when no active subscription is found.
 */
const getActiveSubscriptionFeatures = async (societyId) => {
  const sub = await Subscription.findOne({
    societyId,
    status: 'active',
    expiryDate: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!sub) {
    throw new APIError(402, 'No active subscription found for this society.');
  }

  return sub.features;
};

// ─────────────────────────────────────────────────────────────────────────────
// createGroup
// POST /api/groups
// Role: society_admin
// ─────────────────────────────────────────────────────────────────────────────
const createGroup = asyncHandler(async (req, res) => {
  const societyId  = requireSocietyId(req.user);
  const createdBy  = req.user.id;

  // 1. Validate required fields
  const { name, description, image } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw APIError.badRequest('Group name is required and must be at least 2 characters.');
  }
  if (name.trim().length > 100) {
    throw APIError.badRequest('Group name must not exceed 100 characters.');
  }
  if (description && typeof description === 'string' && description.length > 500) {
    throw APIError.badRequest('Description must not exceed 500 characters.');
  }

  // 2. Subscription check – maxGroups
  const features = await getActiveSubscriptionFeatures(societyId);
  const maxGroups = features.maxGroups ?? 10;

  const existingCount = await Group.countDocuments({ societyId, isDeleted: false });
  if (existingCount >= maxGroups) {
    throw new APIError(
      403,
      `Your subscription allows a maximum of ${maxGroups} group(s). ` +
        'Please upgrade to create more groups.'
    );
  }

  // 3. Create group with creator as admin member
  const group = await Group.create({
    societyId,
    createdBy,
    name: name.trim(),
    description: description ? description.trim() : '',
    image: image || '',
    members: [
      {
        userId:   createdBy,
        role:     'admin',
        joinedAt: new Date(),
      },
    ],
  });

  return ApiResponse.created('Group created successfully.', group).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getGroups
// GET /api/groups?page&limit
// Returns all non-deleted groups in the caller's society.
// Indicates whether the current user is a member of each group.
// ─────────────────────────────────────────────────────────────────────────────
const getGroups = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const userId    = req.user.id;

  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  const filter = { societyId, isDeleted: false };

  const [groups, totalDocs] = await Promise.all([
    Group.find(filter)
      .select('name description image createdBy members lastMessage createdAt updatedAt')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(),
    Group.countDocuments(filter),
  ]);

  // Annotate each group with memberCount and isMember flag
  const annotated = groups.map((g) => ({
    ...g,
    memberCount: g.members.length,
    isMember: g.members.some((m) => m.userId.toString() === userId),
    // Don't expose the full members array in the list view
    members: undefined,
  }));

  return ApiResponse.ok(
    'Groups fetched successfully.',
    annotated,
    paginateMeta(totalDocs, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getGroup
// GET /api/groups/:id
// Returns a single group with members populated (name, profilePhoto, flatNumber).
// ─────────────────────────────────────────────────────────────────────────────
const getGroup = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  })
    .populate({
      path:   'members.userId',
      select: 'name profilePhoto flatNumber status',
    })
    .populate({
      path:   'createdBy',
      select: 'name profilePhoto',
    })
    .lean();

  if (!group) throw APIError.notFound('Group not found.');

  // Filter out members whose user account was deleted / not found
  group.members = group.members.filter((m) => m.userId !== null);

  return ApiResponse.ok('Group fetched successfully.', group).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// updateGroup
// PATCH /api/groups/:id
// Allowed: group admin, group moderator, or society_admin
// ─────────────────────────────────────────────────────────────────────────────
const updateGroup = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const userId    = req.user.id;
  const isSocietyAdmin = req.user.role === 'society_admin';

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  // Permission check
  if (!isSocietyAdmin) {
    const member = findMember(group, userId);
    if (!member) {
      throw APIError.forbidden('You are not a member of this group.');
    }
    if (!['admin', 'moderator'].includes(member.role)) {
      throw APIError.forbidden('Only group admins or moderators can update the group.');
    }
  }

  const { name, description, image } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2) {
      throw APIError.badRequest('Group name must be at least 2 characters.');
    }
    if (name.trim().length > 100) {
      throw APIError.badRequest('Group name must not exceed 100 characters.');
    }
    group.name = name.trim();
  }

  if (description !== undefined) {
    if (typeof description === 'string' && description.length > 500) {
      throw APIError.badRequest('Description must not exceed 500 characters.');
    }
    group.description = description ? description.trim() : '';
  }

  if (image !== undefined) {
    group.image = image || '';
  }

  await group.save();

  return ApiResponse.ok('Group updated successfully.', group).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteGroup
// DELETE /api/groups/:id
// Role: society_admin only. Soft-deletes the group and all its messages.
// ─────────────────────────────────────────────────────────────────────────────
const deleteGroup = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  // Soft-delete all messages belonging to this group
  await Message.updateMany(
    { groupId: group._id, societyId },
    { $set: { isDeleted: true } }
  );

  group.isDeleted = true;
  await group.save();

  return ApiResponse.ok('Group deleted successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// addMember
// POST /api/groups/:id/members
// Body: { userIds: [string] }  (or a single userId string)
// Role: society_admin
// ─────────────────────────────────────────────────────────────────────────────
const addMember = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  // Accept a single userId string or an array
  let rawIds = req.body.userIds ?? req.body.userId;
  if (!rawIds) throw APIError.badRequest('userIds (array) or userId (string) is required.');
  if (!Array.isArray(rawIds)) rawIds = [rawIds];
  if (rawIds.length === 0)    throw APIError.badRequest('At least one userId must be provided.');
  if (rawIds.length > 50)     throw APIError.badRequest('Cannot add more than 50 members at once.');

  // Validate ObjectId format
  const invalid = rawIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid.length > 0) {
    throw APIError.badRequest(`Invalid user ID(s): ${invalid.join(', ')}`);
  }

  // Verify all users exist in this society and are active
  const users = await User.find({
    _id:       { $in: rawIds },
    societyId,
    isDeleted: false,
    status:    'active',
  })
    .select('_id')
    .lean();

  if (users.length !== rawIds.length) {
    throw APIError.badRequest(
      'One or more users were not found in this society or are not active.'
    );
  }

  const existingMemberIds = new Set(group.members.map((m) => m.userId.toString()));
  const added   = [];
  const skipped = [];

  for (const uid of rawIds) {
    if (existingMemberIds.has(uid.toString())) {
      skipped.push(uid);
    } else {
      group.members.push({ userId: uid, role: 'member', joinedAt: new Date() });
      added.push(uid);
    }
  }

  if (added.length > 0) await group.save();

  return ApiResponse.ok(
    `${added.length} member(s) added.`,
    { added, skipped }
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// removeMember
// DELETE /api/groups/:id/members/:userId
// Role: society_admin
// ─────────────────────────────────────────────────────────────────────────────
const removeMember = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  const targetId = req.params.userId;
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw APIError.badRequest('Invalid userId parameter.');
  }

  const memberIndex = group.members.findIndex(
    (m) => m.userId.toString() === targetId
  );
  if (memberIndex === -1) {
    throw APIError.notFound('User is not a member of this group.');
  }

  group.members.splice(memberIndex, 1);
  await group.save();

  return ApiResponse.ok('Member removed successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// joinGroup
// POST /api/groups/:id/join
// User self-joins if the society settings allow group creation / joining.
// ─────────────────────────────────────────────────────────────────────────────
const joinGroup = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const userId    = req.user.id;

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  const alreadyMember = findMember(group, userId);
  if (alreadyMember) {
    return ApiResponse.ok('You are already a member of this group.').send(res);
  }

  group.members.push({ userId, role: 'member', joinedAt: new Date() });
  await group.save();

  return ApiResponse.ok('Successfully joined the group.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// leaveGroup
// POST /api/groups/:id/leave
// ─────────────────────────────────────────────────────────────────────────────
const leaveGroup = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const userId    = req.user.id;

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  const memberIndex = group.members.findIndex(
    (m) => m.userId.toString() === userId
  );
  if (memberIndex === -1) {
    throw APIError.badRequest('You are not a member of this group.');
  }

  // Prevent the sole admin from leaving without transferring ownership
  const leavingMember = group.members[memberIndex];
  if (leavingMember.role === 'admin') {
    const otherAdmins = group.members.filter(
      (m) => m.role === 'admin' && m.userId.toString() !== userId
    );
    if (otherAdmins.length === 0) {
      throw APIError.badRequest(
        'You are the sole admin of this group. ' +
          'Transfer admin rights to another member before leaving.'
      );
    }
  }

  group.members.splice(memberIndex, 1);
  await group.save();

  return ApiResponse.ok('You have left the group.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// muteUser
// PATCH /api/groups/:id/mute/:userId
// Body: { isMuted: boolean, mutedUntil?: ISO date string }
// Role: society_admin or group admin
// ─────────────────────────────────────────────────────────────────────────────
const muteUser = asyncHandler(async (req, res) => {
  const societyId     = requireSocietyId(req.user);
  const callerId      = req.user.id;
  const isSocietyAdmin = req.user.role === 'society_admin';

  const group = await Group.findOne({
    _id:       req.params.id,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  // Permission: society_admin or a group-level admin
  if (!isSocietyAdmin) {
    const callerMember = findMember(group, callerId);
    if (!callerMember || callerMember.role !== 'admin') {
      throw APIError.forbidden('Only society admins or group admins can mute members.');
    }
  }

  const targetId = req.params.userId;
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw APIError.badRequest('Invalid userId parameter.');
  }

  const targetMember = findMember(group, targetId);
  if (!targetMember) {
    throw APIError.notFound('Target user is not a member of this group.');
  }

  // Cannot mute another admin (unless caller is society_admin)
  if (!isSocietyAdmin && targetMember.role === 'admin') {
    throw APIError.forbidden('Group admins cannot mute other admins.');
  }

  const { isMuted, mutedUntil } = req.body;

  if (typeof isMuted !== 'boolean') {
    throw APIError.badRequest('isMuted (boolean) is required.');
  }

  targetMember.isMuted = isMuted;

  if (isMuted && mutedUntil) {
    const muteDate = new Date(mutedUntil);
    if (isNaN(muteDate.getTime())) {
      throw APIError.badRequest('mutedUntil must be a valid ISO date string.');
    }
    if (muteDate <= new Date()) {
      throw APIError.badRequest('mutedUntil must be a future date.');
    }
    targetMember.mutedUntil = muteDate;
  } else if (!isMuted) {
    // Unmute: clear the expiry
    targetMember.mutedUntil = undefined;
  }

  await group.save();

  const action = isMuted ? 'muted' : 'unmuted';
  return ApiResponse.ok(`User ${action} successfully.`, {
    userId:     targetId,
    isMuted:    targetMember.isMuted,
    mutedUntil: targetMember.mutedUntil ?? null,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
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
};
