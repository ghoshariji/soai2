'use strict';

/**
 * chat.controller.js
 *
 * Handles all real-time and persisted messaging for the multi-tenant Society
 * Management platform.  Messages are always scoped to a societyId so that data
 * from one society never leaks to another.
 *
 * Socket events emitted via req.io (attached by the socket.io middleware):
 *   "new_personal_message"  – emitted to receiver's personal room  ("user_<id>")
 *   "new_group_message"     – emitted to the group room             ("group_<id>")
 *   "message_deleted"       – emitted to the relevant room when a message is soft-deleted
 *
 * Exports:
 *   getPersonalMessages   GET    /chat/personal/:userId
 *   sendPersonalMessage   POST   /chat/personal/:userId
 *   getGroupMessages      GET    /chat/groups/:groupId/messages
 *   sendGroupMessage      POST   /chat/groups/:groupId/messages
 *   deleteMessage         DELETE /chat/messages/:id
 *   getConversations      GET    /chat/conversations
 */

const mongoose = require('mongoose');

const Message = require('../models/Message');
const Group   = require('../models/Group');
const User    = require('../models/User');
const {
  asyncHandler,
  APIError,
  ApiResponse,
  paginate,
  paginateMeta,
} = require('../utils/helpers');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the caller has a societyId; throw 403 otherwise.
 * @param {object} reqUser  req.user populated by authenticate middleware
 * @returns {string}        societyId as a string
 */
const requireSocietyId = (reqUser) => {
  if (!reqUser.societyId) {
    throw APIError.forbidden('No society associated with your account.');
  }
  return reqUser.societyId;
};

/**
 * Validate that a param is a valid MongoDB ObjectId; throw 400 otherwise.
 * @param {string} id
 * @param {string} label  Human-readable label for the error message
 */
const validateObjectId = (id, label = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw APIError.badRequest(`Invalid ${label}.`);
  }
};

/**
 * Return the member sub-document for a userId string within a group, or null.
 * @param {import('../models/Group').default} group
 * @param {string} userIdStr
 */
const findGroupMember = (group, userIdStr) =>
  group.members.find((m) => m.userId.toString() === userIdStr) || null;

/**
 * Determine whether a member's mute is currently active.
 * A mute is active when isMuted=true AND either mutedUntil is absent (indefinite)
 * or mutedUntil is still in the future.
 *
 * @param {{ isMuted: boolean, mutedUntil?: Date }} member
 * @returns {boolean}
 */
const isMuteActive = (member) => {
  if (!member.isMuted) return false;
  if (!member.mutedUntil) return true; // indefinite mute
  return member.mutedUntil > new Date();
};

/**
 * Mark messages as read by the current user.
 * Uses $addToSet to avoid duplicates.
 *
 * @param {object} filter   – MongoDB filter to identify unread messages
 * @param {string} userId   – Reader's ObjectId string
 * @returns {Promise<void>}
 */
const markMessagesRead = async (filter, userId) => {
  await Message.updateMany(
    {
      ...filter,
      isDeleted: false,
      'readBy.userId': { $ne: new mongoose.Types.ObjectId(userId) },
    },
    {
      $addToSet: {
        readBy: { userId, readAt: new Date() },
      },
    }
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// getPersonalMessages
// GET /chat/personal/:userId?page&limit
//
// Retrieves the paginated message history between req.user and :userId,
// scoped to the same society.  Messages are returned in ascending createdAt
// order (oldest first) so the client can render a natural chat view.
// Unread messages (sent by the other party) are marked as read.
// ─────────────────────────────────────────────────────────────────────────────
const getPersonalMessages = asyncHandler(async (req, res) => {
  const societyId  = requireSocietyId(req.user);
  const currentId  = req.user.id;
  const { userId: otherId } = req.params;

  validateObjectId(otherId, 'userId');

  // Ensure the other user exists in the same society
  const otherUser = await User.findOne({
    _id:       otherId,
    societyId,
    isDeleted: false,
  })
    .select('name profilePhoto flatNumber isOnline lastSeen')
    .lean();

  if (!otherUser) throw APIError.notFound('User not found in this society.');

  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  const filter = {
    societyId,
    type: 'personal',
    isDeleted: false,
    $or: [
      { senderId: currentId, receiverId: otherId },
      { senderId: otherId,   receiverId: currentId },
    ],
  };

  const [messages, totalDocs] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'senderId',  select: 'name profilePhoto' })
      .populate({ path: 'receiverId', select: 'name profilePhoto' })
      .populate({ path: 'replyTo',   select: 'content senderId mediaUrl mediaType' })
      .lean(),
    Message.countDocuments(filter),
  ]);

  // Mark messages sent by the other user as read (fire-and-forget)
  markMessagesRead(
    { societyId, type: 'personal', senderId: otherId, receiverId: currentId },
    currentId
  ).catch((err) => logger.error('[chat] markMessagesRead failed:', err.message));

  return ApiResponse.ok(
    'Messages fetched successfully.',
    { messages, otherUser },
    paginateMeta(totalDocs, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// sendPersonalMessage
// POST /chat/personal/:userId
// Body: { content, mediaUrl?, mediaType?, replyTo? }
// ─────────────────────────────────────────────────────────────────────────────
const sendPersonalMessage = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const senderId  = req.user.id;
  const { userId: receiverId } = req.params;

  validateObjectId(receiverId, 'userId');

  if (senderId === receiverId) {
    throw APIError.badRequest('You cannot send a message to yourself.');
  }

  const { content, mediaUrl, mediaType, replyTo } = req.body;

  // At least one of content or media must be provided
  if (!content?.trim() && !mediaUrl) {
    throw APIError.badRequest('Message must have content or a media attachment.');
  }

  // Validate mediaType when mediaUrl is provided
  const allowedMediaTypes = ['image', 'video', 'document', 'none'];
  if (mediaUrl && mediaType && !allowedMediaTypes.includes(mediaType)) {
    throw APIError.badRequest(`mediaType must be one of: ${allowedMediaTypes.join(', ')}.`);
  }

  // Ensure receiver exists in the same society and is active
  const receiver = await User.findOne({
    _id:       receiverId,
    societyId,
    isDeleted: false,
    status:    'active',
  })
    .select('_id name')
    .lean();

  if (!receiver) throw APIError.notFound('Receiver not found in this society.');

  // Validate replyTo if provided
  if (replyTo) {
    validateObjectId(replyTo, 'replyTo');
    const parent = await Message.exists({
      _id:       replyTo,
      societyId,
      isDeleted: false,
    });
    if (!parent) throw APIError.notFound('The message you are replying to was not found.');
  }

  // Persist the message
  const message = await Message.create({
    societyId,
    type:      'personal',
    senderId,
    receiverId,
    content:   content ? content.trim() : '',
    mediaUrl:  mediaUrl  || '',
    mediaType: mediaType || 'none',
    replyTo:   replyTo   || null,
    readBy:    [],        // sender doesn't need a readBy entry for their own message
    deliveredTo: [],
  });

  const populated = await Message.findById(message._id)
    .populate({ path: 'senderId',  select: 'name profilePhoto' })
    .populate({ path: 'receiverId', select: 'name profilePhoto' })
    .populate({ path: 'replyTo',   select: 'content senderId mediaUrl mediaType' })
    .lean();

  // Emit via Socket.IO to the receiver's personal room
  if (req.io) {
    req.io
      .to(`user_${receiverId}`)
      .emit('new_personal_message', populated);
  }

  logger.info(`[chat] Personal message ${message._id} sent from ${senderId} to ${receiverId}.`);

  return ApiResponse.created('Message sent successfully.', populated).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getGroupMessages
// GET /chat/groups/:groupId/messages?page&limit
//
// Returns paginated messages for a group in ascending order.
// The caller must be a member of the group.
// Marks all unread messages (sent by others) as read.
// ─────────────────────────────────────────────────────────────────────────────
const getGroupMessages = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const userId    = req.user.id;
  const { groupId } = req.params;

  validateObjectId(groupId, 'groupId');

  // Verify group exists in society
  const group = await Group.findOne({
    _id:       groupId,
    societyId,
    isDeleted: false,
  }).lean();

  if (!group) throw APIError.notFound('Group not found.');

  // Membership check
  const member = group.members.find((m) => m.userId.toString() === userId);
  if (!member) {
    throw APIError.forbidden('You are not a member of this group.');
  }

  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  const filter = { groupId, societyId, type: 'group', isDeleted: false };

  const [messages, totalDocs] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'senderId', select: 'name profilePhoto flatNumber' })
      .populate({ path: 'replyTo',  select: 'content senderId mediaUrl mediaType' })
      .lean(),
    Message.countDocuments(filter),
  ]);

  // Mark messages not yet read by current user (fire-and-forget)
  markMessagesRead(
    { groupId, societyId, type: 'group', senderId: { $ne: new mongoose.Types.ObjectId(userId) } },
    userId
  ).catch((err) => logger.error('[chat] markMessagesRead (group) failed:', err.message));

  return ApiResponse.ok(
    'Group messages fetched successfully.',
    { messages, group: { _id: group._id, name: group.name, image: group.image } },
    paginateMeta(totalDocs, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// sendGroupMessage
// POST /chat/groups/:groupId/messages
// Body: { content, mediaUrl?, mediaType?, replyTo? }
// ─────────────────────────────────────────────────────────────────────────────
const sendGroupMessage = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const senderId  = req.user.id;
  const { groupId } = req.params;

  validateObjectId(groupId, 'groupId');

  // Fetch the live group document (not lean) so we can update lastMessage
  const group = await Group.findOne({
    _id:       groupId,
    societyId,
    isDeleted: false,
  });
  if (!group) throw APIError.notFound('Group not found.');

  // Membership check
  const member = findGroupMember(group, senderId);
  if (!member) {
    throw APIError.forbidden('You are not a member of this group.');
  }

  // Mute check – auto-expire time-limited mutes
  if (isMuteActive(member)) {
    const until = member.mutedUntil
      ? ` until ${member.mutedUntil.toISOString()}`
      : '';
    throw APIError.forbidden(`You are muted in this group${until}.`);
  }

  const { content, mediaUrl, mediaType, replyTo } = req.body;

  if (!content?.trim() && !mediaUrl) {
    throw APIError.badRequest('Message must have content or a media attachment.');
  }

  const allowedMediaTypes = ['image', 'video', 'document', 'none'];
  if (mediaUrl && mediaType && !allowedMediaTypes.includes(mediaType)) {
    throw APIError.badRequest(`mediaType must be one of: ${allowedMediaTypes.join(', ')}.`);
  }

  // Validate replyTo if provided
  if (replyTo) {
    validateObjectId(replyTo, 'replyTo');
    const parent = await Message.exists({
      _id:       replyTo,
      groupId,
      societyId,
      isDeleted: false,
    });
    if (!parent) throw APIError.notFound('The message you are replying to was not found.');
  }

  // Persist message
  const trimmedContent = content ? content.trim() : '';
  const message = await Message.create({
    societyId,
    type:      'group',
    groupId,
    senderId,
    receiverId: null,
    content:   trimmedContent,
    mediaUrl:  mediaUrl  || '',
    mediaType: mediaType || 'none',
    replyTo:   replyTo   || null,
    readBy:    [],
    deliveredTo: [],
  });

  // Update group.lastMessage (non-blocking save in background)
  group.lastMessage = {
    content:  trimmedContent || `[${mediaType || 'media'}]`,
    senderId,
    sentAt:   new Date(),
  };
  group.save().catch((err) =>
    logger.error(`[chat] Failed to update group.lastMessage for ${groupId}:`, err.message)
  );

  const populated = await Message.findById(message._id)
    .populate({ path: 'senderId', select: 'name profilePhoto flatNumber' })
    .populate({ path: 'replyTo',  select: 'content senderId mediaUrl mediaType' })
    .lean();

  // Emit to group room
  if (req.io) {
    req.io
      .to(`group_${groupId}`)
      .emit('new_group_message', populated);
  }

  logger.info(`[chat] Group message ${message._id} sent to group ${groupId} by ${senderId}.`);

  return ApiResponse.created('Message sent successfully.', populated).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteMessage
// DELETE /chat/messages/:id
//
// Soft-deletes a message (isDeleted = true).
// Only the original sender or a society_admin may delete.
// Emits a "message_deleted" socket event to the relevant room.
// ─────────────────────────────────────────────────────────────────────────────
const deleteMessage = asyncHandler(async (req, res) => {
  const societyId = requireSocietyId(req.user);
  const userId    = req.user.id;
  const { id }    = req.params;

  validateObjectId(id, 'message ID');

  const message = await Message.findOne({
    _id:       id,
    societyId,
    isDeleted: false,
  });

  if (!message) throw APIError.notFound('Message not found.');

  const isSender       = message.senderId.toString() === userId;
  const isSocietyAdmin = req.user.role === 'society_admin';

  if (!isSender && !isSocietyAdmin) {
    throw APIError.forbidden('You are not allowed to delete this message.');
  }

  message.isDeleted = true;
  await message.save();

  // Emit deletion event to the appropriate room
  if (req.io) {
    const payload = { messageId: id, deletedBy: userId };

    if (message.type === 'group' && message.groupId) {
      req.io
        .to(`group_${message.groupId}`)
        .emit('message_deleted', payload);
    } else if (message.type === 'personal') {
      // Notify both parties
      req.io.to(`user_${message.senderId}`).emit('message_deleted', payload);
      if (message.receiverId) {
        req.io.to(`user_${message.receiverId}`).emit('message_deleted', payload);
      }
    }
  }

  logger.info(`[chat] Message ${id} soft-deleted by user ${userId}.`);

  return ApiResponse.ok('Message deleted successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getConversations
// GET /chat/conversations
//
// Returns the last message of each personal conversation the current user has
// participated in, along with the other party's profile and the count of
// unread messages in that thread.
// ─────────────────────────────────────────────────────────────────────────────
const getConversations = asyncHandler(async (req, res) => {
  const societyId  = requireSocietyId(req.user);
  const currentId  = req.user.id;
  const currentOid = new mongoose.Types.ObjectId(currentId);

  /*
   * Aggregation strategy:
   *  1. Match all non-deleted personal messages in this society where the
   *     current user is either sender or receiver.
   *  2. Derive a stable "conversation partner" id (the other person).
   *  3. Group by that partner id, keeping the most recent message per thread.
   *  4. Join (lookup) the partner's User document for profile info.
   *  5. Count unread messages per thread (messages where readBy does NOT
   *     include the current user and sender is the other party).
   */
  const pipeline = [
    // ── Stage 1: scope to society personal messages involving current user ──
    {
      $match: {
        societyId:  new mongoose.Types.ObjectId(societyId),
        type:       'personal',
        isDeleted:  false,
        $or: [
          { senderId:   currentOid },
          { receiverId: currentOid },
        ],
      },
    },
    // ── Stage 2: compute the partner id ─────────────────────────────────────
    {
      $addFields: {
        partnerId: {
          $cond: {
            if:   { $eq: ['$senderId', currentOid] },
            then: '$receiverId',
            else: '$senderId',
          },
        },
      },
    },
    // ── Stage 3: sort so the latest message surfaces during $first ───────────
    { $sort: { createdAt: -1 } },
    // ── Stage 4: group by partner, keep the most recent message fields ───────
    {
      $group: {
        _id:            '$partnerId',
        lastMessageId:  { $first: '$_id' },
        lastContent:    { $first: '$content' },
        lastMediaType:  { $first: '$mediaType' },
        lastSenderId:   { $first: '$senderId' },
        lastCreatedAt:  { $first: '$createdAt' },
        // Count messages from the partner that the current user hasn't read
        unreadCount: {
          $sum: {
            $cond: {
              if: {
                $and: [
                  { $ne: ['$senderId', currentOid] },         // sent by partner
                  {
                    $not: {
                      $in: [currentOid, '$readBy.userId'],    // not yet read
                    },
                  },
                ],
              },
              then: 1,
              else: 0,
            },
          },
        },
      },
    },
    // ── Stage 5: sort conversations by most recent message ───────────────────
    { $sort: { lastCreatedAt: -1 } },
    // ── Stage 6: lookup partner profile ─────────────────────────────────────
    {
      $lookup: {
        from:         'users',
        localField:   '_id',
        foreignField: '_id',
        as:           'partnerInfo',
      },
    },
    { $unwind: { path: '$partnerInfo', preserveNullAndEmpty: false } },
    // ── Stage 7: project only the fields the client needs ────────────────────
    {
      $project: {
        _id:           0,
        partnerId:     '$_id',
        lastMessageId: 1,
        lastContent:   1,
        lastMediaType: 1,
        lastSenderId:  1,
        lastCreatedAt: 1,
        unreadCount:   1,
        partner: {
          _id:         '$partnerInfo._id',
          name:        '$partnerInfo.name',
          profilePhoto:'$partnerInfo.profilePhoto',
          flatNumber:  '$partnerInfo.flatNumber',
          isOnline:    '$partnerInfo.isOnline',
          lastSeen:    '$partnerInfo.lastSeen',
          status:      '$partnerInfo.status',
        },
      },
    },
    // ── Stage 8: filter out conversations with deleted / inactive users ──────
    {
      $match: {
        'partner.status': { $ne: 'blocked' },
      },
    },
  ];

  const conversations = await Message.aggregate(pipeline);

  return ApiResponse.ok(
    'Conversations fetched successfully.',
    conversations
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getPersonalMessages,
  sendPersonalMessage,
  getGroupMessages,
  sendGroupMessage,
  deleteMessage,
  getConversations,
};
