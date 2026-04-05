'use strict';

/**
 * post.routes.js
 *
 * All routes require authenticate + checkTenant.
 * Create / update / delete posts and comments are restricted to society_admin + super_admin.
 * Residents may read the feed, like posts, and read comments.
 *
 * POST   /api/posts                          → createPost      (feedUpload.array('images', 5))
 * GET    /api/posts                          → getPosts
 * GET    /api/posts/:id                      → getPost
 * PUT    /api/posts/:id                      → updatePost      (feedUpload.array('images', 5))
 * DELETE /api/posts/:id                      → deletePost
 * POST   /api/posts/:id/like                 → likePost
 * GET    /api/posts/:id/comments             → getComments
 * POST   /api/posts/:id/comments             → addComment
 * DELETE /api/posts/:id/comments/:commentId  → deleteComment
 */

const express = require('express');

const {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
  likePost,
  getComments,
  addComment,
  deleteComment,
} = require('../controllers/post.controller');

const { authenticate, authorize } = require('../middleware/auth');
const { checkTenant, checkSubscriptionFeature } = require('../middleware/tenant');
const { feedUpload }   = require('../config/cloudinary');

const router = express.Router();

router.use(authenticate, checkTenant, checkSubscriptionFeature('feedEnabled'));

// POST /api/posts — society / platform admins only
router.post(
  '/',
  authorize('society_admin', 'super_admin'),
  feedUpload.array('images', 5),
  createPost,
);

// GET /api/posts
router.get('/', getPosts);

// GET /api/posts/:id
router.get('/:id', getPost);

// PATCH /api/posts/:id — JSON body `{ content }` (no multipart)
router.patch('/:id', authorize('society_admin', 'super_admin'), updatePost);

// PUT /api/posts/:id — optional multipart (reserved for future image updates)
router.put(
  '/:id',
  authorize('society_admin', 'super_admin'),
  feedUpload.array('images', 5),
  updatePost,
);

// DELETE /api/posts/:id
router.delete('/:id', authorize('society_admin', 'super_admin'), deletePost);

// POST /api/posts/:id/like
router.post('/:id/like', likePost);

// GET /api/posts/:id/comments
router.get('/:id/comments', getComments);

// POST /api/posts/:id/comments — admins only
router.post('/:id/comments', authorize('society_admin', 'super_admin'), addComment);

// DELETE /api/posts/:id/comments/:commentId — admins only
router.delete(
  '/:id/comments/:commentId',
  authorize('society_admin', 'super_admin'),
  deleteComment,
);

module.exports = router;
