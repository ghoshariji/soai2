'use strict';

/**
 * auth.js – JWT Authentication & Role-Based Authorization Middleware
 *
 * Exports:
 *   authenticate          – verify Bearer access token, attach req.user
 *   authorize(...roles)   – RBAC factory, must follow authenticate
 *   verifyRefreshToken    – validate refresh token, attach req.tokenPayload
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const { APIError } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read and validate an environment variable that must be a non-empty string.
 * Logs a fatal-level message and throws a 500 APIError when the variable is
 * absent so that misconfigured deployments surface immediately.
 *
 * @param {string} name  Environment variable name
 * @returns {string}
 */
function requireEnvSecret(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    logger.error(`[auth] Required environment variable "${name}" is not set.`);
    throw APIError.internal('Server authentication configuration error.');
  }
  return value;
}

/**
 * Verify a JWT with the supplied secret.  Maps jsonwebtoken's named error
 * classes to consistent 401 APIErrors so callers don't need to know the
 * underlying library details.
 *
 * @param {string} token
 * @param {string} secret
 * @returns {object} Decoded payload
 */
function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    switch (err.name) {
      case 'TokenExpiredError':
        throw new APIError(
          'Access token has expired. Please refresh your session.',
          401
        );
      case 'JsonWebTokenError':
        throw new APIError('Invalid token. Authentication failed.', 401);
      case 'NotBeforeError':
        throw new APIError('Token is not yet active.', 401);
      default:
        throw new APIError('Token verification failed.', 401);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// authenticate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express middleware – verify the Bearer access token from the Authorization
 * header and attach a clean `req.user` object for downstream use.
 *
 * req.user shape: { id, role, societyId, email, status }
 *
 * Throws 401 when:
 *   • Authorization header is absent or malformed
 *   • Token signature / expiry is invalid
 *   • User no longer exists or has been soft-deleted
 *
 * Throws 403 when:
 *   • User account is inactive or blocked
 */
const authenticate = async (req, res, next) => {
  try {
    // ── 1. Extract the raw token from the Authorization header ─────────────
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(
        new APIError('No authentication token provided.', 401)
      );
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.trim() === '') {
      return next(new APIError('Malformed Authorization header.', 401));
    }

    // ── 2. Verify signature and expiry ─────────────────────────────────────
    // Support both JWT_ACCESS_SECRET (preferred) and the legacy JWT_SECRET.
    const secret = process.env.JWT_ACCESS_SECRET || requireEnvSecret('JWT_SECRET');
    const decoded = verifyToken(token, secret);

    // ── 3. Confirm the user still exists, is active, and is not soft-deleted
    const user = await User.findOne({
      _id: decoded.id,
      isDeleted: false,
    }).select('_id role societyId email status isDeleted');

    if (!user) {
      return next(
        new APIError('User account not found or has been removed.', 401)
      );
    }

    if (user.status !== 'active') {
      const messages = {
        inactive: 'Your account is inactive. Please contact support.',
        blocked:  'Your account has been blocked. Please contact support.',
      };
      return next(
        new APIError(
          messages[user.status] || 'Account access denied.',
          403
        )
      );
    }

    // ── 4. Attach a plain, serialisable object – never the full Mongoose doc ─
    req.user = {
      id:        user._id.toString(),
      role:      user.role,
      societyId: user.societyId ? user.societyId.toString() : null,
      email:     user.email,
      status:    user.status,
    };

    return next();
  } catch (err) {
    // APIErrors thrown by verifyToken or requireEnvSecret pass straight through.
    if (err instanceof APIError || err.name === 'APIError') {
      return next(err);
    }
    logger.error('[authenticate] Unexpected error during token verification:', err);
    return next(new APIError('Authentication failed.', 401));
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// authorize(...roles)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RBAC factory middleware.  Returns a middleware function that allows only
 * users whose `role` appears in `roles`.
 *
 * Must be chained AFTER `authenticate` so that `req.user` is populated.
 *
 * @param {...string} roles  One or more allowed role names
 *                           (e.g. 'super_admin', 'society_admin', 'user')
 * @returns {import('express').RequestHandler}
 *
 * @throws {Error} At route-registration time if no roles are provided (fail fast).
 *
 * @example
 *   router.delete('/societies/:id',
 *     authenticate,
 *     authorize('super_admin'),
 *     deleteHandler
 *   );
 */
const authorize = (...roles) => {
  if (roles.length === 0) {
    // Crash at startup – a route registered with zero allowed roles is a bug.
    throw new Error(
      '[authorize] At least one role must be supplied to authorize().'
    );
  }

  // Validate that every provided value is a known role to catch typos early.
  const VALID_ROLES = new Set(['super_admin', 'society_admin', 'user']);
  roles.forEach((role) => {
    if (!VALID_ROLES.has(role)) {
      throw new Error(
        `[authorize] Unknown role "${role}". Valid values are: ${[...VALID_ROLES].join(', ')}.`
      );
    }
  });

  return (req, res, next) => {
    if (!req.user) {
      return next(
        new APIError(
          'Not authenticated. The authenticate middleware must run before authorize.',
          401
        )
      );
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(
        `[authorize] Access denied – user ${req.user.id} ` +
        `(role="${req.user.role}") attempted to reach a route restricted to [${roles.join(', ')}]. ` +
        `Path: ${req.method} ${req.originalUrl}`
      );
      return next(
        new APIError(
          `You do not have permission to perform this action. ` +
          `Required role(s): ${roles.join(', ')}.`,
          403
        )
      );
    }

    return next();
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// verifyRefreshToken
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express middleware – validate a refresh token and attach the decoded payload
 * as `req.tokenPayload` so the token-rotation endpoint can issue new tokens.
 *
 * Token lookup order:
 *   1. req.body.refreshToken
 *   2. x-refresh-token header
 *   3. refreshToken cookie
 *
 * req.tokenPayload shape: { id, role, societyId, email }
 *
 * Security considerations:
 *   • The raw token stored in User.refreshToken must match exactly; this
 *     enables single-use rotation / revocation.
 *   • A mismatch is logged as a potential token-reuse attack so it can be
 *     monitored and trigger an account lockout policy if desired.
 */
const verifyRefreshToken = async (req, res, next) => {
  try {
    // ── 1. Read the refresh token from the request ─────────────────────────
    const token =
      req.body?.refreshToken          ||
      req.headers['x-refresh-token']  ||
      req.cookies?.refreshToken;

    if (!token) {
      return next(new APIError('Refresh token not provided.', 401));
    }

    // ── 2. Verify signature and expiry ─────────────────────────────────────
    const secret = process.env.JWT_REFRESH_SECRET || requireEnvSecret('JWT_SECRET');
    const decoded = verifyToken(token, secret);

    // ── 3. Load the user and cross-check the stored token ──────────────────
    const user = await User.findOne({
      _id: decoded.id,
      isDeleted: false,
    }).select('_id role societyId email status refreshToken');

    if (!user) {
      return next(
        new APIError('User not found or account has been removed.', 401)
      );
    }

    if (user.status !== 'active') {
      return next(
        new APIError('Account is not active. Token refresh denied.', 403)
      );
    }

    // If the model stores the refresh token validate it matches exactly.
    // An absent refreshToken field (null / undefined) means the model doesn't
    // track it – in that case we skip the comparison to stay backward-compatible.
    if (user.refreshToken && user.refreshToken !== token) {
      logger.warn(
        `[verifyRefreshToken] Possible refresh token reuse attack detected ` +
        `for user ${user._id}. Stored token does not match the supplied token.`
      );
      return next(
        new APIError(
          'Refresh token is invalid or has already been used. Please log in again.',
          401
        )
      );
    }

    // ── 4. Attach the decoded identity for downstream handlers ─────────────
    req.tokenPayload = {
      id:        user._id.toString(),
      role:      user.role,
      societyId: user.societyId ? user.societyId.toString() : null,
      email:     user.email,
    };

    return next();
  } catch (err) {
    if (err instanceof APIError || err.name === 'APIError') {
      return next(err);
    }
    logger.error('[verifyRefreshToken] Unexpected error:', err);
    return next(new APIError('Refresh token verification failed.', 401));
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { authenticate, authorize, verifyRefreshToken };
