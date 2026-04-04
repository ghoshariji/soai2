'use strict';

const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// generatePassword
// Returns a cryptographically random 10-character password containing at least
// one uppercase letter, one digit, and one special character so it satisfies
// common password-policy requirements.
// ─────────────────────────────────────────────────────────────────────────────
const generatePassword = () => {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '!@#$%^&*';
  const all     = upper + lower + digits + special;

  // Guarantee at least one character from each required class
  const randomChar = (set) => set[crypto.randomInt(0, set.length)];

  const required = [
    randomChar(upper),
    randomChar(lower),
    randomChar(digits),
    randomChar(special),
  ];

  // Fill the remaining 6 characters from the full pool
  for (let i = required.length; i < 10; i++) {
    required.push(randomChar(all));
  }

  // Fisher-Yates shuffle so the required chars are not always at fixed positions
  for (let i = required.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join('');
};

// ─────────────────────────────────────────────────────────────────────────────
// generateOTP
// Returns a 6-digit numeric OTP as a zero-padded string (e.g. "042839").
// ─────────────────────────────────────────────────────────────────────────────
const generateOTP = () => {
  const otp = crypto.randomInt(0, 1_000_000); // [0, 999999]
  return String(otp).padStart(6, '0');
};

// ─────────────────────────────────────────────────────────────────────────────
// paginate
// Takes page and limit params, returns { skip, limit, page } for Mongoose
// queries.  A companion paginateMeta() builds the response envelope.
//
// Usage:
//   const { skip, limit, page } = paginate(req.query.page, req.query.limit);
//   const docs = await Model.find(filter).skip(skip).limit(limit);
//   const meta = paginateMeta(totalDocs, page, limit);
// ─────────────────────────────────────────────────────────────────────────────
const paginate = (page = 1, limit = 10) => {
  const parsedPage  = Math.max(1, parseInt(page,  10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10)); // cap at 100
  const skip        = (parsedPage - 1) * parsedLimit;

  return {
    page:  parsedPage,
    limit: parsedLimit,
    skip,
  };
};

/**
 * Build a pagination meta object to attach to API list responses.
 * @param {number} totalDocs  - Total documents matching the query
 * @param {number} page       - Current page number
 * @param {number} limit      - Page size
 */
const paginateMeta = (totalDocs, page, limit) => {
  const totalPages = Math.ceil(totalDocs / limit) || 1;
  return {
    totalDocs,
    totalPages,
    currentPage: page,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// buildSearchQuery
// Constructs a MongoDB $or query that performs a case-insensitive regex search
// for `searchText` across every field in the `fields` array.
//
// Returns an empty object when searchText is blank so it can be spread safely
// into any existing filter object.
//
// Example:
//   const q = buildSearchQuery('john', ['name', 'email', 'flatNumber']);
//   // { $or: [ {name: /john/i}, {email: /john/i}, {flatNumber: /john/i} ] }
// ─────────────────────────────────────────────────────────────────────────────
const buildSearchQuery = (searchText, fields = []) => {
  if (!searchText || typeof searchText !== 'string' || searchText.trim() === '') {
    return {};
  }

  // Escape special regex characters to prevent ReDoS
  const escaped = searchText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex   = new RegExp(escaped, 'i');

  if (!Array.isArray(fields) || fields.length === 0) {
    return {};
  }

  return {
    $or: fields.map((field) => ({ [field]: { $regex: regex } })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// asyncHandler
// Wraps an async Express route handler so that any rejected promise or thrown
// error is forwarded to next() automatically, avoiding repetitive try/catch.
//
// Usage:
//   router.get('/route', asyncHandler(async (req, res, next) => { ... }));
// ─────────────────────────────────────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ─────────────────────────────────────────────────────────────────────────────
// ApiResponse
// Standardised response formatter used by all controllers.
//
// Shape:
//   { success, statusCode, message, data?, meta?, errors? }
// ─────────────────────────────────────────────────────────────────────────────
class ApiResponse {
  /**
   * @param {boolean} success
   * @param {number}  statusCode
   * @param {string}  message
   * @param {*}       [data]
   * @param {object}  [meta]   - e.g. pagination metadata
   */
  constructor(success, statusCode, message, data = null, meta = null) {
    this.success    = success;
    this.statusCode = statusCode;
    this.message    = message;
    if (data !== null && data !== undefined) this.data = data;
    if (meta !== null && meta !== undefined) this.meta = meta;
  }

  // ── Convenience static factories ──────────────────────────────────────────

  /** 200 OK success response. */
  static ok(message, data = null, meta = null) {
    return new ApiResponse(true, 200, message, data, meta);
  }

  /** 201 Created response. */
  static created(message, data = null) {
    return new ApiResponse(true, 201, message, data);
  }

  /** Generic error response. */
  static error(statusCode, message, errors = null) {
    const resp = new ApiResponse(false, statusCode, message);
    if (errors) resp.errors = errors;
    return resp;
  }

  /**
   * Send the response using an Express res object.
   * @param {import('express').Response} res
   */
  send(res) {
    return res.status(this.statusCode).json(this);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APIError
// Custom error class that carries an HTTP status code and an optional
// validation-errors array.  Extends native Error so instanceof checks work
// throughout the middleware chain.
//
// Usage:
//   throw new APIError(404, 'User not found');
//   throw new APIError(422, 'Validation failed', validationErrors);
//   throw APIError.forbidden('Insufficient permissions');
// ─────────────────────────────────────────────────────────────────────────────
class APIError extends Error {
  /**
   * @param {number}   statusCode     - HTTP status code (e.g. 400, 401, 403, 404, 500)
   * @param {string}   message        - Human-readable error message
   * @param {Array}    [errors=[]]    - Optional array of field-level validation errors
   * @param {boolean}  [isOperational=true] - Distinguish operational vs programmer errors
   */
  constructor(statusCode = 500, message = 'Internal Server Error', errors = [], isOperational = true) {
    super(message);

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.name          = this.constructor.name;
    this.statusCode    = statusCode;
    this.errors        = errors;
    this.isOperational = isOperational;
    this.success       = false;
  }

  // ── Common factory shortcuts ───────────────────────────────────────────────

  static badRequest(message = 'Bad Request', errors = []) {
    return new APIError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new APIError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new APIError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new APIError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new APIError(409, message);
  }

  static unprocessable(message = 'Unprocessable Entity', errors = []) {
    return new APIError(422, message, errors);
  }

  static internal(message = 'Internal Server Error') {
    return new APIError(500, message, [], false);
  }

  /** Serialise to a plain object suitable for JSON error responses. */
  toJSON() {
    return {
      success:    false,
      statusCode: this.statusCode,
      message:    this.message,
      ...(this.errors && this.errors.length > 0 ? { errors: this.errors } : {}),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// formatDate
// Returns a human-readable date string (e.g. "02 Apr 2026") for emails/logs.
// ─────────────────────────────────────────────────────────────────────────────
const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// slugify
// Converts a string into a URL-safe slug.
// ─────────────────────────────────────────────────────────────────────────────
const slugify = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');

// ─────────────────────────────────────────────────────────────────────────────
// pickFields
// Returns a new object containing only the specified keys from source.
// Useful for whitelisting user input before persisting to the database.
// ─────────────────────────────────────────────────────────────────────────────
const pickFields = (source, fields = []) =>
  fields.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      acc[key] = source[key];
    }
    return acc;
  }, {});

// ─────────────────────────────────────────────────────────────────────────────
// omitFields
// Returns a shallow copy of source with the specified keys removed.
// ─────────────────────────────────────────────────────────────────────────────
const omitFields = (source, fields = []) => {
  const result = { ...source };
  fields.forEach((key) => delete result[key]);
  return result;
};

module.exports = {
  generatePassword,
  generateOTP,
  paginate,
  paginateMeta,
  buildSearchQuery,
  asyncHandler,
  ApiResponse,
  APIError,
  formatDate,
  slugify,
  pickFields,
  omitFields,
};
