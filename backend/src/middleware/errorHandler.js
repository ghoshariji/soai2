'use strict';

/**
 * errorHandler.js – Centralised Express Error Handling
 *
 * Exports:
 *   errorHandler(err, req, res, next) – 4-argument global error handler
 *   notFound(req, res, next)          – 404 fallback for unmatched routes
 *   APIError                          – re-exported for convenience
 *
 * Handled error types
 * ───────────────────
 *   Mongoose ValidationError  → 422  field-level errors array
 *   Mongoose CastError        → 400  invalid ObjectId / type cast
 *   MongoDB duplicate key     → 409  code 11000 / 11001
 *   jsonwebtoken errors       → 401  TokenExpiredError, JsonWebTokenError, NotBeforeError
 *   Custom APIError           → uses err.statusCode
 *   Unknown / programmer      → 500  message hidden in production
 *
 * Response shape (always)
 * ───────────────────────
 *   {
 *     success: false,
 *     message: string,
 *     errors?:  [ { field, message } ],   // validation / duplicate errors only
 *     stack?:   string                    // development only
 *   }
 */

const { APIError } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Environment flag
// ─────────────────────────────────────────────────────────────────────────────
const IS_DEV  = process.env.NODE_ENV !== 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

// ─────────────────────────────────────────────────────────────────────────────
// Error classifiers – each returns a normalised { statusCode, message, errors? }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mongoose ValidationError (schema-level validation failures).
 * Each path that failed gets its own entry in the errors array.
 *
 * @param {import('mongoose').Error.ValidationError} err
 * @returns {{ statusCode: number, message: string, errors: Array }}
 */
function classifyValidationError(err) {
  const errors = Object.values(err.errors).map((e) => ({
    field:   e.path,
    message: e.message,
  }));

  return {
    statusCode: 422,
    message: 'Validation failed. Please check the submitted data.',
    errors,
  };
}

/**
 * Mongoose CastError – typically an invalid ObjectId passed to a query.
 *
 * @param {import('mongoose').Error.CastError} err
 * @returns {{ statusCode: number, message: string }}
 */
function classifyCastError(err) {
  return {
    statusCode: 400,
    message: `Invalid value "${err.value}" supplied for field "${err.path}".`,
  };
}

/**
 * MongoDB duplicate-key error (code 11000 or 11001).
 * Extracts the duplicate field name from keyValue (modern drivers) or
 * falls back to parsing the errmsg string for older versions.
 *
 * @param {object} err
 * @returns {{ statusCode: number, message: string, errors: Array }}
 */
function classifyDuplicateKeyError(err) {
  let field = 'field';
  let value;

  if (err.keyValue && typeof err.keyValue === 'object') {
    field = Object.keys(err.keyValue)[0];
    value = err.keyValue[field];
  } else if (err.errmsg) {
    // Fallback pattern: "index: <collection>.$<field>_1"
    const match = err.errmsg.match(/index: (?:.*\.)?\$?(\w+)_\d+/);
    if (match) field = match[1];
  }

  const valueStr = value !== undefined ? ` ("${value}")` : '';

  return {
    statusCode: 409,
    message: `A record with this ${field}${valueStr} already exists.`,
    errors: [
      {
        field,
        message: `Duplicate value for ${field}${valueStr}.`,
      },
    ],
  };
}

/**
 * jsonwebtoken error family.
 *
 * @param {Error} err
 * @returns {{ statusCode: number, message: string }}
 */
function classifyJwtError(err) {
  const messages = {
    TokenExpiredError:  'Your session has expired. Please log in again.',
    JsonWebTokenError:  'Invalid authentication token.',
    NotBeforeError:     'Authentication token is not yet valid.',
  };

  return {
    statusCode: 401,
    message: messages[err.name] || 'Authentication token error.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// notFound – 404 handler for routes that never matched the router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register this as the LAST middleware before `errorHandler` to catch any
 * request that did not match a defined route.
 *
 * @type {import('express').RequestHandler}
 */
const notFound = (req, res, next) => {
  const message = `Route not found: ${req.method} ${req.originalUrl}`;
  logger.warn(`[notFound] ${message}`);
  next(APIError.notFound(message));
};

// ─────────────────────────────────────────────────────────────────────────────
// errorHandler – central 4-argument Express error middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global error handler.  Must be registered with exactly four parameters so
 * Express identifies it as an error-handling middleware.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // ── Structured log context ───────────────────────────────────────────────
  const logContext = {
    method:    req.method,
    url:       req.originalUrl,
    userId:    req.user?.id    ?? null,
    societyId: req.user?.societyId ?? null,
    ip:        req.ip,
  };

  // 5xx and unknown errors → error level; 4xx operational errors → warn level
  const isServerError = !err.statusCode || err.statusCode >= 500;
  if (isServerError) {
    logger.error(err.message || 'Internal server error', {
      ...logContext,
      stack: err.stack,
    });
  } else if (!IS_TEST) {
    // Suppress 4xx noise in test output; keep it in staging and production.
    logger.warn(err.message, logContext);
  }

  // ── Normalise the error ──────────────────────────────────────────────────
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'An unexpected error occurred.';
  let errors     = err.errors     || null;

  if (err.name === 'ValidationError') {
    // Mongoose schema validation
    ({ statusCode, message, errors } = classifyValidationError(err));

  } else if (err.name === 'CastError') {
    // Mongoose type-cast (bad ObjectId, etc.)
    ({ statusCode, message } = classifyCastError(err));
    errors = null;

  } else if (err.code === 11000 || err.code === 11001) {
    // MongoDB unique-index violation
    ({ statusCode, message, errors } = classifyDuplicateKeyError(err));

  } else if (
    err.name === 'JsonWebTokenError' ||
    err.name === 'TokenExpiredError' ||
    err.name === 'NotBeforeError'
  ) {
    // jsonwebtoken errors (should be rare since auth middleware catches them)
    ({ statusCode, message } = classifyJwtError(err));
    errors = null;

  } else if (err.name === 'APIError') {
    // Our own intentional errors – trust the values already set
    statusCode = err.statusCode ?? 500;
    message    = err.message;
    errors     = Array.isArray(err.errors) && err.errors.length > 0
      ? err.errors
      : null;

  } else if (err.name === 'MulterError') {
    // Optional uploads (e.g. complaints) – bad field name, size, or count
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'One or more images are too large (max 10MB each).'
        : IS_DEV
          ? err.message
          : 'Upload could not be processed. Use JPG/PNG/WebP, max 3 images.';

  } else if (!err.statusCode) {
    // Unrecognised / programmer error – hide internals from non-dev clients
    statusCode = 500;
    message    = IS_DEV ? err.message : 'An internal server error occurred.';
    errors     = null;
  }

  // ── Sanitise the errors array ────────────────────────────────────────────
  // Guarantee it's null (omitted) rather than an empty array in the response.
  if (Array.isArray(errors) && errors.length === 0) {
    errors = null;
  }

  // ── Build the response body ──────────────────────────────────────────────
  const body = {
    success: false,
    message,
  };

  if (errors) {
    body.errors = errors;
  }

  // Stack traces are only exposed in development / test environments
  if (IS_DEV && err.stack) {
    body.stack = err.stack;
  }

  return res.status(statusCode).json(body);
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { errorHandler, notFound, APIError };
