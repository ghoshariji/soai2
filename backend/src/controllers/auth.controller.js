'use strict';

/**
 * auth.controller.js
 * ──────────────────
 * Handles all authentication flows for the Society Management SaaS platform:
 *
 *   POST   /api/auth/login               → login
 *   POST   /api/auth/refresh-token       → refreshToken
 *   POST   /api/auth/logout              → logout          (auth required)
 *   GET    /api/auth/me                  → getMe           (auth required)
 *   PATCH  /api/auth/change-password     → changePassword  (auth required)
 *
 * Security model:
 *   - Access tokens:  JWT, 15-minute TTL, signed with JWT_ACCESS_SECRET
 *   - Refresh tokens: JWT, 7-day TTL, signed with JWT_REFRESH_SECRET,
 *                     bcrypt-hashed before storage (cost factor 10).
 *   - Refresh token rotation: every /refresh-token call issues a new pair and
 *     overwrites the stored hash.  Reuse of a superseded token revokes the
 *     session immediately (detect-and-revoke pattern).
 *   - changePassword clears the stored refresh token, forcing re-login on all
 *     devices.
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User   = require('../models/User');
const logger = require('../utils/logger');
const { sendPasswordResetEmail } = require('../services/email.service');
const {
  asyncHandler,
  APIError,
  ApiResponse,
} = require('../utils/helpers');
const {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validate,
} = require('../utils/validators');

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a required JWT secret from the environment.
 * Throws a 500 APIError at request-time (not startup) so misconfigured
 * deployments surface clearly in error logs.
 *
 * @param {string} name  Environment variable name
 * @returns {string}
 */
const requireSecret = (name) => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    logger.error(`[auth.controller] Required env var "${name}" is missing.`);
    throw APIError.internal('Server authentication configuration error.');
  }
  return value;
};

/**
 * Sign a short-lived JWT access token (15 min).
 * Payload: { id, role, societyId, email }
 *
 * @param {import('../models/User').UserDocument} user
 * @returns {string}
 */
const signAccessToken = (user) =>
  jwt.sign(
    {
      id:        user._id,
      role:      user.role,
      societyId: user.societyId ?? null,
      email:     user.email,
    },
    requireSecret('JWT_ACCESS_SECRET'),
    { expiresIn: '15m' }
  );

/**
 * Sign a long-lived JWT refresh token (7 days).
 * Payload is intentionally minimal – just the user id.
 *
 * @param {import('../models/User').UserDocument} user
 * @returns {string}
 */
const signRefreshToken = (user) =>
  jwt.sign(
    { id: user._id },
    requireSecret('JWT_REFRESH_SECRET'),
    { expiresIn: '7d' }
  );

/**
 * Build the safe public user shape returned to the client on login / refresh.
 *
 * @param {import('../models/User').UserDocument} user
 * @returns {object}
 */
const buildPublicUser = (user) => ({
  id:           user._id,
  name:         user.name,
  email:        user.email,
  role:         user.role,
  societyId:    user.societyId ?? null,
  profilePhoto: user.profilePhoto ?? '',
});

// ─────────────────────────────────────────────────────────────────────────────
// login
// POST /api/auth/login
// Body: { email, password }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticate a user with email + password and return a JWT token pair.
 *
 * Flow:
 *   1. Validate request body (Joi – loginSchema).
 *   2. Find user by email, projecting in the normally-hidden `password` and
 *      `refreshToken` fields.
 *   3. Reject soft-deleted or blocked/inactive accounts with informative but
 *      non-revealing messages (no user enumeration).
 *   4. Compare submitted password against the stored bcrypt hash.
 *   5. Issue access token (15m) + refresh token (7d).
 *   6. Persist bcrypt hash of the refresh token to the user document.
 *   7. Return { accessToken, refreshToken, user }.
 */
const login = asyncHandler(async (req, res) => {
  // ── 1. Validate input ───────────────────────────────────────────────────────
  const { email, password } = validate(loginSchema, req.body);

  // ── 2. Load user with hidden auth fields ────────────────────────────────────
  const user = await User
    .findOne({ email })
    .select('+password +refreshToken');

  // Use the same generic message for "not found" and "wrong password" to avoid
  // leaking whether the e-mail is registered.
  if (!user) {
    throw APIError.unauthorized('Invalid email or password.');
  }

  // ── 3. Account health checks ────────────────────────────────────────────────
  if (user.isDeleted) {
    // Do not reveal the account existed – treat it as "not found".
    throw APIError.unauthorized('Invalid email or password.');
  }

  if (user.status === 'blocked') {
    throw APIError.forbidden(
      'Your account has been blocked. Please contact support.'
    );
  }

  if (user.status === 'inactive') {
    throw APIError.forbidden(
      'Your account is inactive. Please contact your society administrator.'
    );
  }

  // ── 4. Verify password ──────────────────────────────────────────────────────
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw APIError.unauthorized('Invalid email or password.');
  }

  // ── 5. Issue tokens ─────────────────────────────────────────────────────────
  const accessToken  = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  // ── 6. Store hashed refresh token ──────────────────────────────────────────
  user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
  // Bump lastSeen without running full schema validation
  user.lastSeen = new Date();
  await user.save({ validateBeforeSave: false });

  logger.info(`[auth] User ${user._id} (${user.role}) logged in.`);

  // ── 7. Respond ──────────────────────────────────────────────────────────────
  return ApiResponse.ok('Login successful.', {
    accessToken,
    refreshToken: newRefreshToken,
    user: buildPublicUser(user),
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// refreshToken
// POST /api/auth/refresh-token
// Body: { refreshToken }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a new access + refresh token pair given a valid, non-rotated refresh
 * token.
 *
 * Flow:
 *   1. Extract refresh token from request body.
 *   2. Verify JWT signature and expiry using JWT_REFRESH_SECRET.
 *   3. Load user from DB and check they still exist and are not blocked.
 *   4. bcrypt.compare the incoming token against the stored hash.
 *      If the hash doesn't match, the token has already been rotated or is
 *      forged → clear stored token and force re-login (detect-and-revoke).
 *   5. Issue a new token pair and persist the new hashed refresh token.
 *   6. Return { accessToken, refreshToken }.
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: incomingToken } = req.body;

  if (!incomingToken) {
    throw APIError.badRequest('Refresh token is required.');
  }

  // ── 1. Verify JWT signature and expiry ──────────────────────────────────────
  let decoded;
  try {
    decoded = jwt.verify(incomingToken, requireSecret('JWT_REFRESH_SECRET'));
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw APIError.unauthorized(
        'Refresh token has expired. Please log in again.'
      );
    }
    throw APIError.unauthorized('Invalid refresh token.');
  }

  // ── 2. Load user ────────────────────────────────────────────────────────────
  const user = await User
    .findOne({ _id: decoded.id, isDeleted: false })
    .select('+refreshToken');

  if (!user) {
    throw APIError.unauthorized(
      'User not found or account has been removed.'
    );
  }

  if (user.status === 'blocked') {
    throw APIError.forbidden('Your account has been blocked.');
  }

  if (user.status === 'inactive') {
    throw APIError.forbidden('Your account is inactive.');
  }

  // ── 3. Validate stored hash ─────────────────────────────────────────────────
  if (!user.refreshToken) {
    throw APIError.unauthorized(
      'No active session found. Please log in again.'
    );
  }

  const isTokenValid = await bcrypt.compare(incomingToken, user.refreshToken);
  if (!isTokenValid) {
    // Possible reuse of a previously rotated token – revoke entirely.
    logger.warn(
      `[auth] Potential refresh token reuse detected for user ${user._id}. ` +
      'Session revoked.'
    );
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
    throw APIError.unauthorized(
      'Refresh token is invalid or has already been used. Please log in again.'
    );
  }

  // ── 4. Issue rotated token pair ─────────────────────────────────────────────
  const newAccessToken  = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
  await user.save({ validateBeforeSave: false });

  logger.info(`[auth] Token refreshed for user ${user._id}.`);

  // ── 5. Respond ──────────────────────────────────────────────────────────────
  return ApiResponse.ok('Token refreshed successfully.', {
    accessToken:  newAccessToken,
    refreshToken: newRefreshToken,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// logout
// POST /api/auth/logout
// Requires: authenticate middleware (req.user populated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invalidate the current session by clearing the stored refresh token hash.
 *
 * After this call, neither the existing access token (which will expire within
 * 15m) nor the refresh token can be used to obtain new tokens.
 *
 * Note: The access token cannot be actively revoked without a token blacklist;
 * the 15-minute expiry is the security boundary.  For highly sensitive apps,
 * add a Redis-backed blacklist in the authenticate middleware.
 */
const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user.id,
    { $unset: { refreshToken: '' }, lastSeen: new Date() },
    { new: false }
  );

  logger.info(`[auth] User ${req.user.id} logged out.`);

  return ApiResponse.ok('Logged out successfully.').send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getMe
// GET /api/auth/me
// Requires: authenticate middleware (req.user populated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the full profile of the currently authenticated user with the
 * societyId ref populated (name, city, address, status, logo, settings).
 *
 * We re-fetch from the DB rather than relying on the token payload so the
 * response always reflects the current state of the account (e.g. after an
 * admin updates a user's flat number or role).
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User
    .findOne({ _id: req.user.id, isDeleted: false })
    .populate({
      path:   'societyId',
      select: 'name city address status logo settings totalUnits',
    })
    .lean();

  if (!user) {
    throw APIError.notFound('User account not found.');
  }

  // Strip any sensitive / internal fields that lean() might include
  delete user.password;
  delete user.refreshToken;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;

  return ApiResponse.ok('Profile fetched successfully.', user).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// changePassword
// PATCH /api/auth/change-password
// Body: { currentPassword, newPassword, confirmNewPassword }
// Requires: authenticate middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allow an authenticated user to change their own password.
 *
 * Flow:
 *   1. Validate that all three fields are present and the new passwords match.
 *   2. Enforce minimum password strength (min 8 chars, strength rules).
 *   3. Load user with password field.
 *   4. Compare currentPassword against stored hash.
 *   5. Reject if new password is identical to the current one.
 *   6. Assign new password (pre-save hook hashes it) and clear refreshToken
 *      so all existing sessions on other devices are invalidated.
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  // ── 1. Presence check ───────────────────────────────────────────────────────
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    throw APIError.badRequest(
      'currentPassword, newPassword, and confirmNewPassword are all required.'
    );
  }

  // ── 2. New password match ───────────────────────────────────────────────────
  if (newPassword !== confirmNewPassword) {
    throw APIError.badRequest(
      'New password and confirmation password do not match.'
    );
  }

  // ── 3. Strength policy ──────────────────────────────────────────────────────
  if (newPassword.length < 8) {
    throw APIError.badRequest('New password must be at least 8 characters long.');
  }

  // Require at least one uppercase letter, one digit, one special character
  const strengthRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?])/;
  if (!strengthRegex.test(newPassword)) {
    throw APIError.badRequest(
      'New password must contain at least one uppercase letter, one number, and one special character.'
    );
  }

  // ── 4. Load user with password field ────────────────────────────────────────
  const user = await User
    .findOne({ _id: req.user.id, isDeleted: false })
    .select('+password');

  if (!user) {
    throw APIError.notFound('User account not found.');
  }

  // ── 5. Verify current password ──────────────────────────────────────────────
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw APIError.unauthorized('Current password is incorrect.');
  }

  // ── 6. Reject same-as-current password ──────────────────────────────────────
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw APIError.badRequest(
      'New password must be different from the current password.'
    );
  }

  // ── 7. Persist – pre-save hook handles hashing ──────────────────────────────
  user.password     = newPassword;
  user.refreshToken = undefined; // invalidate all sessions
  await user.save();

  logger.info(`[auth] User ${user._id} changed their password.`);

  return ApiResponse.ok(
    'Password changed successfully. Please log in again with your new password.'
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// forgotPassword
// POST /api/auth/forgot-password
// Body: { email }
// ─────────────────────────────────────────────────────────────────────────────

const hashResetToken = (plain) =>
  crypto.createHash('sha256').update(plain, 'utf8').digest('hex');

/**
 * Issue a one-time password reset token (e-mailed in plain form; only a hash is stored).
 * Always responds with the same message to avoid account enumeration.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = validate(forgotPasswordSchema, req.body);

  const user = await User.findOne({
    email,
    isDeleted: false,
  }).select('+passwordResetToken +passwordResetExpires');

  if (user && user.status !== 'blocked') {
    const plainToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken   = hashResetToken(plainToken);
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user, plainToken);
    } catch (err) {
      logger.error(`[auth] Password reset email failed for ${email}: ${err.message}`);
    }
  }

  return ApiResponse.ok(
    'If an account exists for that email, you will receive password reset instructions shortly.'
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// resetPassword
// POST /api/auth/reset-password
// Body: { token, newPassword, confirmNewPassword }
// ─────────────────────────────────────────────────────────────────────────────

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = validate(resetPasswordSchema, req.body);

  const hashed = hashResetToken(token);
  const user   = await User.findOne({
    passwordResetToken:   hashed,
    passwordResetExpires: { $gt: new Date() },
    isDeleted:            false,
  }).select('+passwordResetToken +passwordResetExpires +password +refreshToken');

  if (!user) {
    throw APIError.badRequest(
      'This reset link is invalid or has expired. Please request a new one.'
    );
  }

  if (user.status === 'blocked') {
    throw APIError.forbidden('Your account has been blocked. Please contact support.');
  }

  user.password             = newPassword;
  user.passwordResetToken   = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken         = undefined;
  await user.save();

  logger.info(`[auth] User ${user._id} reset password via e-mail token.`);

  return ApiResponse.ok(
    'Password reset successful. You can now sign in with your new password.'
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  login,
  refreshToken,
  logout,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
};
