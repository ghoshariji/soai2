'use strict';

/**
 * socket/index.js – Socket.IO server setup with multi-tenant support
 *
 * Exports:
 *   initializeSocket(server, app)  → returns the io instance
 *
 * Responsibilities:
 *   • JWT authentication middleware on every incoming connection
 *   • Per-user room    : `user_${userId}`
 *   • Per-society room : `society_${societyId}`
 *   • Per-group rooms  : `group_${groupId}` for every group the user belongs to
 *   • Online/offline presence tracking (isOnline, lastSeen in DB)
 *   • Delegated chat events via chat.handler.js
 */

const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');

const User    = require('../models/User');
const Group   = require('../models/Group');
const logger  = require('../utils/logger');

const {
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleReadReceipt,
  handleUserOnline,
  handleUserOffline,
} = require('./handlers/chat.handler');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the JWT access secret with fallback to the legacy JWT_SECRET.
 * Throws at startup if neither variable is set so misconfigured deployments
 * surface immediately rather than silently accepting connections.
 */
function getJwtSecret() {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[socket] Neither JWT_ACCESS_SECRET nor JWT_SECRET environment variable is set.'
    );
  }
  return secret;
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the JWT token supplied in socket.handshake.auth.token.
 * On success, attaches socket.data.user = { id, role, societyId, email }.
 * On failure, calls next(new Error(...)) which triggers a connection_error
 * on the client side and prevents the socket from being established.
 */
async function authMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return next(new Error('Authentication token is required.'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token.trim(), getJwtSecret());
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Authentication token has expired.'
          : 'Invalid authentication token.';
      return next(new Error(message));
    }

    // Confirm the user still exists, is active, and has not been soft-deleted
    const user = await User.findOne({ _id: decoded.id, isDeleted: false })
      .select('_id role societyId email status')
      .lean();

    if (!user) {
      return next(new Error('User account not found or has been removed.'));
    }

    if (user.status !== 'active') {
      return next(new Error(`Account access denied: status is "${user.status}".`));
    }

    // Attach a plain, serialisable identity object – never the Mongoose document
    socket.data.user = {
      id:        user._id.toString(),
      role:      user.role,
      societyId: user.societyId ? user.societyId.toString() : null,
      email:     user.email,
      status:    user.status,
    };

    return next();
  } catch (err) {
    logger.error('[socket:auth] Unexpected error during authentication:', err);
    return next(new Error('Authentication failed.'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle a successfully authenticated socket connection:
 *   1. Join personal + society rooms
 *   2. Mark the user online in the database
 *   3. Notify society peers of the user's online status
 *   4. Join all group rooms the user belongs to
 *   5. Register all chat / presence event handlers
 *   6. Handle disconnection (offline status + peer notification)
 */
async function onConnection(io, socket) {
  const { id: userId, societyId } = socket.data.user;

  logger.debug(`[socket] User connected – userId=${userId} socketId=${socket.id}`);

  // ── 1. Room setup ──────────────────────────────────────────────────────────
  const personalRoom = `user_${userId}`;
  const societyRoom  = `society_${societyId}`;

  socket.join(personalRoom);
  if (societyId) {
    socket.join(societyRoom);
  }

  // ── 2. Mark user online in DB ──────────────────────────────────────────────
  try {
    await User.updateOne({ _id: userId }, { $set: { isOnline: true } });
  } catch (err) {
    logger.error(`[socket] Failed to mark user online – userId=${userId}:`, err);
  }

  // ── 3. Broadcast presence to society ──────────────────────────────────────
  if (societyId) {
    socket.to(societyRoom).emit('user_online', { userId });
  }

  // ── 4. Join group rooms ────────────────────────────────────────────────────
  try {
    const groups = await Group.find(
      { 'members.userId': userId, isDeleted: false },
      { _id: 1 }
    ).lean();

    for (const group of groups) {
      socket.join(`group_${group._id.toString()}`);
    }

    logger.debug(`[socket] User joined ${groups.length} group room(s) – userId=${userId}`);
  } catch (err) {
    logger.error(`[socket] Failed to join group rooms – userId=${userId}:`, err);
  }

  // ── 5. Notify handler about new online connection ──────────────────────────
  handleUserOnline(socket, io);

  // ── 6. Chat / messaging events ─────────────────────────────────────────────

  /**
   * 'send_message'
   * data: { type, content, receiverId?, groupId?, mediaUrl?, mediaType?, replyTo? }
   */
  socket.on('send_message', (data) => {
    handleSendMessage(socket, io, data);
  });

  /**
   * 'join_group'
   * data: { groupId }  – dynamically join a group room (e.g., after being added)
   */
  socket.on('join_group', (data) => {
    const groupId = data?.groupId;
    if (!groupId) return;
    const room = `group_${groupId}`;
    socket.join(room);
    logger.debug(`[socket] User joined group room – userId=${userId} room=${room}`);
  });

  /**
   * 'leave_group'
   * data: { groupId }  – leave a group room (e.g., after being removed)
   */
  socket.on('leave_group', (data) => {
    const groupId = data?.groupId;
    if (!groupId) return;
    const room = `group_${groupId}`;
    socket.leave(room);
    logger.debug(`[socket] User left group room – userId=${userId} room=${room}`);
  });

  /**
   * 'typing'
   * data: { roomId }  – broadcast typing indicator to a room
   */
  socket.on('typing', (data) => {
    handleTyping(socket, io, { ...data, typing: true });
  });

  /**
   * 'stop_typing'
   * data: { roomId }  – broadcast stop-typing indicator to a room
   */
  socket.on('stop_typing', (data) => {
    handleStopTyping(socket, io, { ...data, typing: false });
  });

  /**
   * 'mark_read'
   * data: { messageId, roomId? }  – mark a message as read by the current user
   */
  socket.on('mark_read', (data) => {
    handleReadReceipt(socket, io, data);
  });

  // ── 7. Disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', async (reason) => {
    logger.debug(
      `[socket] User disconnected – userId=${userId} socketId=${socket.id} reason=${reason}`
    );

    // Mark offline in DB
    try {
      await User.updateOne(
        { _id: userId },
        { $set: { isOnline: false, lastSeen: new Date() } }
      );
    } catch (err) {
      logger.error(`[socket] Failed to mark user offline – userId=${userId}:`, err);
    }

    // Notify society peers
    if (societyId) {
      socket.to(societyRoom).emit('user_offline', { userId, lastSeen: new Date() });
    }

    handleUserOffline(socket, io);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// initializeSocket
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bootstrap the Socket.IO server, attach authentication middleware, wire up
 * the connection handler, and bind the io instance to the Express app so that
 * HTTP controllers can emit events via `req.app.get('io')`.
 *
 * @param {import('http').Server}       server  – Node HTTP server
 * @param {import('express').Application} app   – Express application instance
 * @returns {import('socket.io').Server}         io instance
 */
function initializeSocket(server, app) {
  const allowedOrigins =
    process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(',').map((o) => o.trim())
      : ['http://localhost:3000'];

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Prefer WebSocket; fall back to long-polling if WS is unavailable
    transports: ['websocket', 'polling'],
    // Ping/pong settings for presence detection
    pingTimeout:  60_000, // 60 s – how long to wait for pong before disconnecting
    pingInterval: 25_000, // 25 s – how often to ping
    // Increase max buffer for media payloads (10 MB)
    maxHttpBufferSize: 10 * 1024 * 1024,
  });

  // ── Authentication middleware ────────────────────────────────────────────
  io.use(authMiddleware);

  // ── Connection handler ───────────────────────────────────────────────────
  io.on('connection', (socket) => onConnection(io, socket));

  // ── Make io accessible from Express controllers ──────────────────────────
  app.set('io', io);

  logger.info('[socket] Socket.IO server initialized successfully.');

  return io;
}

module.exports = { initializeSocket };
