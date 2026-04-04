'use strict';

/**
 * rateLimiter.js – Express Rate-Limiting Middleware
 *
 * Exports:
 *   generalLimiter  – 100 req / 15 min (broad API groups)
 *   authLimiter     – 10  req / 15 min (login, register, password reset, etc.)
 *   uploadLimiter   – 20  req / 60 min (file and bulk uploads, scoped per user)
 *
 * All limiters:
 *   • Use express-rate-limit v7+ (standardHeaders: true, legacyHeaders: false)
 *   • Return a consistent JSON error body on 429 so clients can parse it
 *   • Log warnings via the shared winston logger
 *   • Set Retry-After in seconds via the RateLimit-Reset standard header
 */

const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the `handler` function used by all limiters.
 * Returns a standard JSON 429 response with an actionable error message and
 * the number of seconds until the window resets (sourced from the standard
 * RateLimit-Reset header set by express-rate-limit).
 *
 * @param {string} message  Human-readable explanation of the limit
 * @returns {import('express').RequestHandler}
 */
const buildHandler = (message) => (req, res) => {
  // express-rate-limit v7 sets 'RateLimit-Reset' as a Unix timestamp (seconds).
  // Convert it to a "seconds from now" delta for a friendlier retryAfter value.
  const resetHeader = res.getHeader('RateLimit-Reset');
  let retryAfter;

  if (resetHeader) {
    const resetTimestamp = parseInt(String(resetHeader), 10);
    if (!isNaN(resetTimestamp)) {
      const nowSeconds = Math.floor(Date.now() / 1_000);
      retryAfter = Math.max(0, resetTimestamp - nowSeconds);
    }
  }

  return res.status(429).json({
    success: false,
    message,
    ...(retryAfter !== undefined ? { retryAfter: `${retryAfter} seconds` } : {}),
  });
};

/**
 * Shared `onLimitReached` / `skip` behaviour extracted once to avoid
 * duplication across limiters.
 *
 * Note: express-rate-limit v7 removed the `onLimitReached` option; its
 * successor is a custom `handler` that is called on every rejected request.
 * We embed the log call inside each handler via `buildHandlerWithLog`.
 */

/**
 * Build a combined handler that logs the breach and returns the JSON 429 body.
 *
 * @param {string} limiterName  Short label for log messages (e.g. "auth")
 * @param {number} max          Configured request ceiling
 * @param {number} windowMs     Configured window in milliseconds
 * @param {string} message      User-facing error message
 * @returns {import('express').RequestHandler}
 */
const buildHandlerWithLog = (limiterName, max, windowMs, message) =>
  (req, res) => {
    const windowMin = windowMs / 60_000;
    logger.warn(
      `[rateLimiter:${limiterName}] Limit exceeded – ` +
      `IP: ${req.ip} | ` +
      `User: ${req.user?.id ?? 'unauthenticated'} | ` +
      `Path: ${req.method} ${req.originalUrl} | ` +
      `Limit: ${max} req / ${windowMin} min`
    );

    // Delegate body / header logic to the shared builder
    return buildHandler(message)(req, res);
  };

// ─────────────────────────────────────────────────────────────────────────────
// generalLimiter – 100 requests per 15-minute window, per IP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Broad API rate limiter.  Apply globally or to all authenticated routes.
 *
 * Exclusions:
 *   /health and /ping are not counted so infrastructure probes don't consume
 *   quota and cannot accidentally trigger a lockout.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,   // 15 minutes
  max:      100,

  // RFC 6585 standard headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
  standardHeaders: 'draft-7',   // express-rate-limit v7 string form
  legacyHeaders:   false,       // suppress X-RateLimit-* headers

  // Count every request, including those that return 4xx/5xx
  skipSuccessfulRequests: false,
  skipFailedRequests:     false,

  // Scope by IP address
  keyGenerator: (req) => req.ip,

  // Skip health-check / monitoring endpoints
  skip: (req) =>
    req.path === '/health' ||
    req.path === '/ping'   ||
    req.path === '/favicon.ico',

  handler: buildHandlerWithLog(
    'general',
    100,
    15 * 60 * 1_000,
    'Too many requests from this IP address. ' +
    'You have exceeded the limit of 100 requests per 15 minutes. ' +
    'Please slow down and try again shortly.'
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// authLimiter – 10 requests per 15-minute window, per IP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tight limiter for authentication endpoints: login, register, forgot-password,
 * reset-password, token refresh.  Mitigates brute-force and credential-stuffing
 * attacks.
 *
 * Using IP-level scoping here (rather than user/email) is intentional: an
 * attacker rotating usernames should still be blocked by IP, and legitimate
 * users rarely need to authenticate more than a handful of times per 15 min.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,   // 15 minutes
  max:      10,

  standardHeaders: 'draft-7',
  legacyHeaders:   false,

  skipSuccessfulRequests: false,
  skipFailedRequests:     false,

  keyGenerator: (req) => req.ip,

  handler: buildHandlerWithLog(
    'auth',
    10,
    15 * 60 * 1_000,
    'Too many authentication attempts from this IP address. ' +
    'You have exceeded the limit of 10 attempts per 15 minutes. ' +
    'Please wait before trying again.'
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadLimiter – 20 requests per 60-minute window, per user (or IP fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Limiter for file and bulk-upload endpoints.  Scoped per authenticated user
 * (req.user.id) when available so that multiple users behind the same NAT
 * address don't share a quota.  Falls back to IP for unauthenticated contexts
 * so the endpoint is still protected before auth middleware runs.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,   // 1 hour
  max:      20,

  standardHeaders: 'draft-7',
  legacyHeaders:   false,

  skipSuccessfulRequests: false,
  skipFailedRequests:     false,

  // User-scoped key with IP fallback
  keyGenerator: (req) => req.user?.id ?? req.ip,

  handler: buildHandlerWithLog(
    'upload',
    20,
    60 * 60 * 1_000,
    'Upload limit reached. You may perform a maximum of 20 uploads per hour. ' +
    'Please try again after your current window resets.'
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { generalLimiter, authLimiter, uploadLimiter };
