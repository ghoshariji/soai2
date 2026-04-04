'use strict';

/**
 * post.controller.js
 * ──────────────────
 * Community-feed posts and comments for a multi-tenant society platform.
 *
 * Routes (mounted under /api/posts by the router):
 *   POST   /                          → createPost
 *   GET    /                          → getPosts
 *   GET    /:id                       → getPost
 *   PATCH  /:id                       → updatePost
 *   DELETE /:id                       → deletePost
 *   POST   /:id/like                  → likePost
 *   GET    /:id/comments              → getComments
 *   POST   /:id/comments              → addComment
 *   DELETE /:id/comments/:commentId   → deleteComment
 */

const mongoose   = require('mongoose');
const Post         = require('../models/Post');
const Comment      = require('../models/Comment');
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

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map multer-storage-cloudinary processed files to the Post.images schema shape.
 * multer-storage-cloudinary sets:
 *   file.path     → the Cloudinary secure_url
 *   file.filename → the Cloudinary public_id
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
 * Delete an array of Cloudinary images in parallel, ignoring individual
 * failures so that a partial clean-up never aborts the primary DB operation.
 *
 * @param {{ url: string, publicId: string }[]} images
 * @returns {Promise<void>}
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
 * Fan-out a notification to every active, non-deleted society member,
 * excluding the actor.  Uses insertMany for efficiency on large societies.
 * Fire-and-forget – caller should .catch(() => {}).
 *
 * @param {object} opts
 * @param {string|mongoose.Types.ObjectId} opts.societyId
 * @param {string|mongoose.Types.ObjectId} opts.excludeUserId
 * @param {string} opts.type     - Notification.type enum value
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data]
 */
const broadcastNotification = async ({
  societyId,
  excludeUserId,
  type,
  title,
  body,
  data = {},
}) => {
  const recipients = await User.find({
    societyId,
    isDeleted: false,
    status:    'active',
    _id:       { $ne: excludeUserId },
  })
    .select('_id')
    .lean();

  if (!recipients.length) return;

  const docs = recipients.map((u) => ({
    recipientId: u._id,
    societyId,
    type,
    title,
    body,
    data,
  }));

  await Notification.insertMany(docs, { ordered: false });
};

/**
 * Send a targeted notification to a single recipient.
 * Skips silently when recipientId is falsy.
 *
 * @param {object} opts
 * @param {string|mongoose.Types.ObjectId} opts.recipientId
 * @param {string|mongoose.Types.ObjectId} opts.societyId
 * @param {string} opts.type
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data]
 */
const sendNotification = async ({
  recipientId,
  societyId,
  type,
  title,
  body,
  data = {},
}) => {
  if (!recipientId) return;
  await Notification.create({ recipientId, societyId, type, title, body, data });
};

// ─────────────────────────────────────────────────────────────────────────────
// createPost
// POST /posts
// Body: { content }  •  Files: images[] (multer – up to 5 images)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Create a new community post for the authenticated user's society.
 *
 * Behaviour:
 *   - Requires either a non-empty content string OR at least one image.
 *   - Stores Cloudinary URLs from req.files if multer has already processed them.
 *   - Fans out a 'post_like' notification to all other society members (async).
 *   - Emits a 'new_post' socket event to the society room via req.io.
 */
const createPost = asyncHandler(async (req, res) => {
  const { content } = req.body;
  const { id: authorId, societyId } = req.user;

  if (!societyId) {
    throw APIError.forbidden('You must belong to a society to create a post.');
  }

  const trimmedContent = content ? String(content).trim() : '';
  const hasImages      = Array.isArray(req.files) && req.files.length > 0;

  if (!trimmedContent && !hasImages) {
    throw APIError.badRequest('A post must have content or at least one image.');
  }

  if (trimmedContent.length > 2000) {
    throw APIError.badRequest('Post content must not exceed 2,000 characters.');
  }

  const images = buildImageArray(req.files);

  const post = await Post.create({
    societyId,
    authorId,
    content: trimmedContent,
    images,
  });

  // ── Non-blocking side-effects ─────────────────────────────────────────────
  // Fetch author name for notification body
  User.findById(authorId).select('name').lean()
    .then((author) => {
      broadcastNotification({
        societyId,
        excludeUserId: authorId,
        type:  'post_like',
        title: 'New Post in Your Society',
        body:  `${author?.name ?? 'A member'} shared a new post.`,
        data:  { postId: post._id.toString() },
      });
    })
    .catch((err) => logger.warn('[createPost] broadcast notification failed:', err));

  // Emit socket event if socket.io is attached to req by middleware
  if (req.io) {
    req.io.to(`society_${societyId}`).emit('new_post', {
      postId:    post._id,
      authorId,
      societyId,
    });
  }

  logger.info(`[post] User ${authorId} created post ${post._id} in society ${societyId}.`);

  return ApiResponse.created('Post created successfully.', post).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getPosts
// GET /posts?page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return a paginated, time-ordered list of posts for the current society.
 * Pinned posts are surfaced first.  Author details are populated.
 */
const getPosts = asyncHandler(async (req, res) => {
  const { societyId } = req.user;
  if (!societyId) throw APIError.forbidden('Society context required.');

  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  const filter = { societyId, isDeleted: false };

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path:   'authorId',
        select: 'name profilePhoto flatNumber',
      })
      .lean(),
    Post.countDocuments(filter),
  ]);

  return ApiResponse.ok(
    'Posts fetched successfully.',
    posts,
    paginateMeta(total, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getPost
// GET /posts/:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return a single post with its author populated and the first 10 comments
 * (oldest first, also with author populated).
 */
const getPost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { societyId } = req.user;

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid post ID.');

  const post = await Post.findOne({ _id: id, societyId, isDeleted: false })
    .populate({ path: 'authorId', select: 'name profilePhoto flatNumber' })
    .lean();

  if (!post) throw APIError.notFound('Post not found.');

  const comments = await Comment.find({ postId: id, isDeleted: false })
    .sort({ createdAt: 1 })
    .limit(10)
    .populate({ path: 'authorId', select: 'name profilePhoto flatNumber' })
    .lean();

  return ApiResponse.ok('Post fetched successfully.', { ...post, comments }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// updatePost
// PATCH /posts/:id
// Body: { content }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Update a post's content.
 * Only the original author or a society_admin / super_admin may update.
 */
const updatePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { id: userId, role, societyId } = req.user;

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid post ID.');

  const post = await Post.findOne({ _id: id, societyId, isDeleted: false });
  if (!post) throw APIError.notFound('Post not found.');

  const isAuthor = post.authorId.toString() === userId;
  const isAdmin  = role === 'society_admin' || role === 'super_admin';

  if (!isAuthor && !isAdmin) {
    throw APIError.forbidden('You are not allowed to update this post.');
  }

  const { content } = req.body;

  if (content === undefined || content === null) {
    throw APIError.badRequest('No updatable fields provided.');
  }

  const trimmed = String(content).trim();
  if (!trimmed && (!post.images || post.images.length === 0)) {
    throw APIError.badRequest('A post must have content or at least one image.');
  }
  if (trimmed.length > 2000) {
    throw APIError.badRequest('Post content must not exceed 2,000 characters.');
  }

  post.content = trimmed;
  await post.save();

  return ApiResponse.ok('Post updated successfully.', post).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// deletePost
// DELETE /posts/:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Soft-delete a post.
 * - Only the original author or an admin may delete.
 * - Associated Cloudinary images are deleted asynchronously.
 * - All comments belonging to the post are also soft-deleted in bulk.
 */
const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { id: userId, role, societyId } = req.user;

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid post ID.');

  const post = await Post.findOne({ _id: id, societyId, isDeleted: false });
  if (!post) throw APIError.notFound('Post not found.');

  const isAuthor = post.authorId.toString() === userId;
  const isAdmin  = role === 'society_admin' || role === 'super_admin';

  if (!isAuthor && !isAdmin) {
    throw APIError.forbidden('You are not allowed to delete this post.');
  }

  // Soft-delete the post first so the user gets an immediate response
  post.isDeleted = true;
  await post.save();

  // Cascade soft-delete to all comments on this post
  await Comment.updateMany({ postId: id }, { $set: { isDeleted: true } });

  // Remove Cloudinary assets (non-blocking)
  if (post.images && post.images.length > 0) {
    deleteCloudinaryImages(post.images).catch((err) =>
      logger.warn(`[deletePost] Cloudinary cleanup failed for post ${id}:`, err)
    );
  }

  logger.info(`[post] Post ${id} soft-deleted by user ${userId}.`);

  return ApiResponse.ok('Post deleted successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// likePost
// POST /posts/:id/like
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Toggle the authenticated user's like on a post.
 * - Adds or removes the userId from Post.likes[].
 * - Keeps Post.likesCount in sync.
 * - Sends a 'post_like' notification to the post author when liking (not unliking).
 *
 * Returns: { liked: boolean, likesCount: number }
 */
const likePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { id: userId, societyId } = req.user;

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid post ID.');

  const post = await Post.findOne({ _id: id, societyId, isDeleted: false });
  if (!post) throw APIError.notFound('Post not found.');

  const userObjectId  = new mongoose.Types.ObjectId(userId);
  const alreadyLiked  = post.likes.some((lid) => lid.equals(userObjectId));

  if (alreadyLiked) {
    post.likes      = post.likes.filter((lid) => !lid.equals(userObjectId));
    post.likesCount = Math.max(0, post.likesCount - 1);
  } else {
    post.likes.push(userObjectId);
    post.likesCount += 1;

    // Notify post author only when a different user likes the post
    const postAuthorId = post.authorId.toString();
    if (postAuthorId !== userId) {
      User.findById(userId).select('name').lean()
        .then((liker) =>
          sendNotification({
            recipientId: postAuthorId,
            societyId,
            type:  'post_like',
            title: 'Someone liked your post',
            body:  `${liker?.name ?? 'Someone'} liked your post.`,
            data:  { postId: id },
          })
        )
        .catch((err) =>
          logger.warn(`[likePost] Failed to send like notification for post ${id}:`, err)
        );
    }
  }

  await post.save();

  return ApiResponse.ok('Post like toggled.', {
    liked:      !alreadyLiked,
    likesCount: post.likesCount,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getComments
// GET /posts/:id/comments?page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return paginated top-level comments (parentId = null) for a post,
 * sorted oldest-first.  Author details are populated.
 */
const getComments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { societyId } = req.user;

  if (!mongoose.isValidObjectId(id)) throw APIError.badRequest('Invalid post ID.');

  const postExists = await Post.exists({ _id: id, societyId, isDeleted: false });
  if (!postExists) throw APIError.notFound('Post not found.');

  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  const filter = { postId: id, isDeleted: false, parentId: null };

  const [comments, total] = await Promise.all([
    Comment.find(filter)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'authorId', select: 'name profilePhoto flatNumber' })
      .lean(),
    Comment.countDocuments(filter),
  ]);

  return ApiResponse.ok(
    'Comments fetched successfully.',
    comments,
    paginateMeta(total, page, limit)
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// addComment
// POST /posts/:id/comments
// Body: { content, parentId? }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Add a comment (or reply) to a post.
 * - Increments Post.commentsCount atomically.
 * - Sends a 'post_comment' notification to the post author.
 * - Returns the newly created comment with its author populated.
 */
const addComment = asyncHandler(async (req, res) => {
  const { id: postId } = req.params;
  const { id: authorId, societyId } = req.user;
  const { content, parentId } = req.body;

  if (!mongoose.isValidObjectId(postId)) throw APIError.badRequest('Invalid post ID.');

  const trimmedContent = content ? String(content).trim() : '';
  if (!trimmedContent) throw APIError.badRequest('Comment content is required.');
  if (trimmedContent.length > 500) {
    throw APIError.badRequest('Comment must not exceed 500 characters.');
  }

  const post = await Post.findOne({ _id: postId, societyId, isDeleted: false });
  if (!post) throw APIError.notFound('Post not found.');

  // Validate optional parentId – must reference a non-deleted comment on this post
  let resolvedParentId = null;
  if (parentId) {
    if (!mongoose.isValidObjectId(parentId)) {
      throw APIError.badRequest('Invalid parentId.');
    }
    const parentComment = await Comment.findOne({
      _id: parentId, postId, isDeleted: false,
    });
    if (!parentComment) throw APIError.notFound('Parent comment not found.');
    resolvedParentId = parentComment._id;
  }

  const comment = await Comment.create({
    societyId,
    postId,
    authorId,
    content: trimmedContent,
    parentId: resolvedParentId,
  });

  // Increment commentsCount atomically
  await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });

  // Notify post author (skip if the commenter IS the author)
  const postAuthorId = post.authorId.toString();
  if (postAuthorId !== authorId) {
    User.findById(authorId).select('name').lean()
      .then((commenter) =>
        sendNotification({
          recipientId: postAuthorId,
          societyId,
          type:  'post_comment',
          title: 'New comment on your post',
          body:  `${commenter?.name ?? 'Someone'} commented on your post.`,
          data:  { postId, commentId: comment._id.toString() },
        })
      )
      .catch((err) =>
        logger.warn(`[addComment] Notification failed for post ${postId}:`, err)
      );
  }

  // Return populated comment so the client can render immediately
  const populated = await comment.populate({
    path:   'authorId',
    select: 'name profilePhoto flatNumber',
  });

  return ApiResponse.created('Comment added successfully.', populated).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteComment
// DELETE /posts/:id/comments/:commentId
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Soft-delete a comment.
 * - Only the comment author or a society_admin / super_admin may delete.
 * - Decrements Post.commentsCount (floors at 0).
 */
const deleteComment = asyncHandler(async (req, res) => {
  const { id: postId, commentId } = req.params;
  const { id: userId, role, societyId } = req.user;

  if (!mongoose.isValidObjectId(postId))    throw APIError.badRequest('Invalid post ID.');
  if (!mongoose.isValidObjectId(commentId)) throw APIError.badRequest('Invalid comment ID.');

  const comment = await Comment.findOne({
    _id:       commentId,
    postId,
    societyId,
    isDeleted: false,
  });

  if (!comment) throw APIError.notFound('Comment not found.');

  const isAuthor = comment.authorId.toString() === userId;
  const isAdmin  = role === 'society_admin' || role === 'super_admin';

  if (!isAuthor && !isAdmin) {
    throw APIError.forbidden('You are not allowed to delete this comment.');
  }

  comment.isDeleted = true;
  await comment.save();

  // Decrement post commentsCount (only when count > 0 to prevent underflow)
  await Post.findOneAndUpdate(
    { _id: postId, commentsCount: { $gt: 0 } },
    { $inc: { commentsCount: -1 } }
  );

  return ApiResponse.ok('Comment deleted successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
  likePost,
  getComments,
  addComment,
  deleteComment,
};
