'use strict';

/**
 * post.routes.js
 *
 * All routes require authenticate + checkTenant.
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

const { authenticate } = require('../middleware/auth');
const { checkTenant }  = require('../middleware/tenant');
const { feedUpload }   = require('../config/cloudinary');

const router = express.Router();

// Apply authenticate + checkTenant to every post route
router.use(authenticate, checkTenant);

// POST /api/posts
router.post('/', feedUpload.array('images', 5), createPost);

// GET /api/posts
router.get('/', getPosts);

// GET /api/posts/:id
router.get('/:id', getPost);

// PUT /api/posts/:id
router.put('/:id', feedUpload.array('images', 5), updatePost);

// DELETE /api/posts/:id
router.delete('/:id', deletePost);

// POST /api/posts/:id/like
router.post('/:id/like', likePost);

// GET /api/posts/:id/comments
router.get('/:id/comments', getComments);

// POST /api/posts/:id/comments
router.post('/:id/comments', addComment);

// DELETE /api/posts/:id/comments/:commentId
router.delete('/:id/comments/:commentId', deleteComment);

module.exports = router;
