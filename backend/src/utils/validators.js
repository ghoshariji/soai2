'use strict';

/**
 * validators.js
 * -------------
 * Centralised Joi validation schemas for the Society Management SaaS backend.
 * Every schema is exported individually so controllers can import only what
 * they need, e.g.:
 *
 *   const { loginSchema } = require('../utils/validators');
 *   const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
 *
 * All schemas use { abortEarly: false } as the recommended call-site option so
 * that all validation errors are collected in one pass.
 */

const Joi = require('joi');

// ─────────────────────────────────────────────────────────────────────────────
// Reusable field definitions
// ─────────────────────────────────────────────────────────────────────────────

/** E.164-style phone (optionally prefixed with +91 or 0, 10 digits) */
const phoneField = Joi.string()
  .trim()
  .pattern(/^(\+91[\s-]?)?[6-9]\d{9}$/)
  .messages({
    'string.pattern.base': 'Phone must be a valid 10-digit Indian mobile number',
  });

/** Strong password: min 8 chars, at least one uppercase, one digit, one special char */
const passwordField = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
  .messages({
    'string.min':          'Password must be at least 8 characters',
    'string.max':          'Password must not exceed 128 characters',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one number, and one special character',
  });

/** MongoDB ObjectId */
const objectIdField = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ 'string.pattern.base': 'Invalid ID format' });

/** ISO 8601 future date */
const futureDateField = Joi.date()
  .iso()
  .greater('now')
  .messages({
    'date.greater': 'Date must be in the future',
    'date.format':  'Date must be a valid ISO 8601 date',
  });

// ─────────────────────────────────────────────────────────────────────────────
// Auth schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * registerSchema
 * Used for super-admin / first-time platform registration.
 * Role is limited to 'superadmin' and 'admin' at this endpoint.
 */
const registerSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min':     'Name must be at least 2 characters',
      'string.max':     'Name must not exceed 100 characters',
      'any.required':   'Name is required',
    }),

  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(255)
    .required()
    .messages({
      'string.email':   'Please provide a valid email address',
      'any.required':   'Email is required',
    }),

  password: passwordField.required().messages({ 'any.required': 'Password is required' }),

  phone: phoneField.required().messages({ 'any.required': 'Phone number is required' }),

  role: Joi.string()
    .valid('superadmin', 'admin')
    .default('admin')
    .messages({ 'any.only': 'Role must be superadmin or admin' }),
});

/**
 * loginSchema
 * Validates the credentials payload for the POST /auth/login endpoint.
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),

  password: Joi.string()
    .trim()
    .min(1)
    .max(128)
    .required()
    .messages({ 'any.required': 'Password is required' }),
});

/** POST /auth/forgot-password */
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(255)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
});

/** POST /auth/reset-password */
const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().min(32).max(128).required().messages({
    'any.required': 'Reset token is required',
    'string.min':   'Invalid reset token',
  }),

  newPassword: passwordField.required().messages({
    'any.required': 'New password is required',
  }),

  confirmNewPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only':     'Passwords must match',
      'any.required': 'Please confirm your new password',
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Society schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createSocietySchema
 * Used by superadmin when onboarding a new society onto the platform.
 */
const createSocietySchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(3)
    .max(150)
    .required()
    .messages({
      'string.min':   'Society name must be at least 3 characters',
      'string.max':   'Society name must not exceed 150 characters',
      'any.required': 'Society name is required',
    }),

  address: Joi.string()
    .trim()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.min':   'Address must be at least 5 characters',
      'any.required': 'Address is required',
    }),

  city: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min':   'City must be at least 2 characters',
      'any.required': 'City is required',
    }),

  plan: Joi.string()
    .valid('basic', 'standard', 'premium', 'enterprise', 'custom')
    .default('basic')
    .messages({
      'any.only':
        'Plan must be one of: basic, standard, premium, enterprise, custom',
    }),

  expiryDate: futureDateField.required().messages({ 'any.required': 'Expiry date is required' }),
});

// ─────────────────────────────────────────────────────────────────────────────
// User management schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createUserSchema
 * Used by a society admin to add a new resident / security / staff member.
 */
const createUserSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min':   'Name must be at least 2 characters',
      'any.required': 'Name is required',
    }),

  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(255)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),

  phone: phoneField.required().messages({ 'any.required': 'Phone number is required' }),

  flatNumber: Joi.string()
    .trim()
    .min(1)
    .max(20)
    .required()
    .messages({
      'string.min':   'Flat number must be at least 1 character',
      'string.max':   'Flat number must not exceed 20 characters',
      'any.required': 'Flat number is required',
    }),

  role: Joi.string()
    .valid('resident', 'security', 'staff', 'committee')
    .default('resident')
    .messages({ 'any.only': 'Role must be one of: resident, security, staff, committee' }),
});

/**
 * updateUserSchema
 * All fields are optional — clients send only what they want to change.
 * At least one field must be present to prevent empty-body updates.
 */
const updateUserSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({ 'string.min': 'Name must be at least 2 characters' }),

  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(255)
    .messages({ 'string.email': 'Please provide a valid email address' }),

  phone: phoneField,

  flatNumber: Joi.string()
    .trim()
    .min(1)
    .max(20)
    .messages({ 'string.max': 'Flat number must not exceed 20 characters' }),

  role: Joi.string()
    .valid('resident', 'security', 'staff', 'committee')
    .messages({ 'any.only': 'Role must be one of: resident, security, staff, committee' }),
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

// ─────────────────────────────────────────────────────────────────────────────
// Post / Feed schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createPostSchema
 * Used when a society_admin creates a post in the society feed (residents cannot post via API).
 */
const createPostSchema = Joi.object({
  content: Joi.string()
    .trim()
    .min(1)
    .max(2000)
    .required()
    .messages({
      'string.min':   'Post content cannot be empty',
      'string.max':   'Post content must not exceed 2000 characters',
      'any.required': 'Post content is required',
    }),

  images: Joi.array()
    .items(
      Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .messages({ 'string.uri': 'Each image must be a valid URL' })
    )
    .max(10)
    .default([])
    .messages({ 'array.max': 'You can attach a maximum of 10 images per post' }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Complaint schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createComplaintSchema
 * Filed by a resident when raising a new complaint.
 */
const createComplaintSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(5)
    .max(200)
    .required()
    .messages({
      'string.min':   'Title must be at least 5 characters',
      'string.max':   'Title must not exceed 200 characters',
      'any.required': 'Complaint title is required',
    }),

  description: Joi.string()
    .trim()
    .min(10)
    .max(2000)
    .required()
    .messages({
      'string.min':   'Description must be at least 10 characters',
      'string.max':   'Description must not exceed 2000 characters',
      'any.required': 'Complaint description is required',
    }),

  category: Joi.string()
    .valid(
      'maintenance',
      'security',
      'cleanliness',
      'noise',
      'parking',
      'water',
      'electricity',
      'lift',
      'other'
    )
    .required()
    .messages({
      'any.only':   'Category must be one of: maintenance, security, cleanliness, noise, parking, water, electricity, lift, other',
      'any.required': 'Complaint category is required',
    }),

  priority: Joi.string()
    .valid('low', 'medium', 'high', 'urgent')
    .default('medium')
    .messages({ 'any.only': 'Priority must be one of: low, medium, high, urgent' }),
});

/**
 * updateComplaintSchema
 * Used by admins (or committee members) to update complaint status and
 * add an admin comment.
 */
const updateComplaintSchema = Joi.object({
  status: Joi.string()
    .valid('open', 'in_progress', 'resolved', 'closed', 'rejected')
    .messages({ 'any.only': 'Status must be one of: open, in_progress, resolved, closed, rejected' }),

  adminComment: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .messages({ 'string.max': 'Admin comment must not exceed 1000 characters' }),
}).min(1).messages({ 'object.min': 'At least one field (status or adminComment) must be provided' });

// ─────────────────────────────────────────────────────────────────────────────
// Announcement schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createAnnouncementSchema
 * Used by admins or committee members to broadcast an announcement.
 */
const createAnnouncementSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(5)
    .max(200)
    .required()
    .messages({
      'string.min':   'Announcement title must be at least 5 characters',
      'string.max':   'Announcement title must not exceed 200 characters',
      'any.required': 'Announcement title is required',
    }),

  description: Joi.string()
    .trim()
    .min(10)
    .max(5000)
    .required()
    .messages({
      'string.min':   'Description must be at least 10 characters',
      'string.max':   'Description must not exceed 5000 characters',
      'any.required': 'Announcement description is required',
    }),

  priority: Joi.string()
    .valid('low', 'normal', 'high', 'urgent')
    .default('normal')
    .messages({ 'any.only': 'Priority must be one of: low, normal, high, urgent' }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Group / Chat schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createGroupSchema
 * Used to create a new messaging group within a society.
 */
const createGroupSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min':   'Group name must be at least 2 characters',
      'string.max':   'Group name must not exceed 100 characters',
      'any.required': 'Group name is required',
    }),

  description: Joi.string()
    .trim()
    .min(0)
    .max(500)
    .allow('', null)
    .default('')
    .messages({ 'string.max': 'Description must not exceed 500 characters' }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Subscription schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * subscriptionSchema
 * Used by superadmin to create or renew a society subscription.
 */
const subscriptionSchema = Joi.object({
  plan: Joi.string()
    .valid('basic', 'standard', 'premium', 'enterprise')
    .required()
    .messages({
      'any.only':   'Plan must be one of: basic, standard, premium, enterprise',
      'any.required': 'Subscription plan is required',
    }),

  expiryDate: futureDateField
    .required()
    .messages({ 'any.required': 'Expiry date is required' }),

  price: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.positive': 'Price must be a positive number',
      'any.required':    'Price is required',
    }),

  features: Joi.object({
    maxResidents:     Joi.number().integer().min(1).default(100),
    maxAdmins:        Joi.number().integer().min(1).default(2),
    canUseChat:       Joi.boolean().default(false),
    canUseAnnouncements: Joi.boolean().default(true),
    canUseComplaints: Joi.boolean().default(true),
    canUseVisitors:   Joi.boolean().default(false),
    canUseFacilities: Joi.boolean().default(false),
    canExportReports: Joi.boolean().default(false),
    storageGb:        Joi.number().min(0).default(1),
  })
    .default({})
    .messages({ 'object.base': 'Features must be a valid object' }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Generic validate helper
// Validates data against a Joi schema and throws a structured error payload
// that can be consumed by the global error handler.
//
// Usage:
//   const data = validate(loginSchema, req.body);
// ─────────────────────────────────────────────────────────────────────────────
const validate = (schema, data) => {
  const { error, value } = schema.validate(data, {
    abortEarly:   false,
    stripUnknown: true,
    convert:      true,
  });

  if (error) {
    const errors = error.details.map((d) => ({
      field:   d.context?.key || d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));

    // Attach structured errors to a plain Error so the error-handler middleware
    // can detect this as a 422 Validation Error.
    const validationError = new Error('Validation failed');
    validationError.statusCode = 422;
    validationError.isValidation = true;
    validationError.errors = errors;
    throw validationError;
  }

  return value;
};

module.exports = {
  // Auth
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,

  // Society
  createSocietySchema,

  // User management
  createUserSchema,
  updateUserSchema,

  // Feed
  createPostSchema,

  // Complaints
  createComplaintSchema,
  updateComplaintSchema,

  // Announcements
  createAnnouncementSchema,

  // Groups
  createGroupSchema,

  // Subscriptions
  subscriptionSchema,

  // Reusable field schemas (for composing new schemas elsewhere)
  phoneField,
  passwordField,
  objectIdField,
  futureDateField,

  // Helper
  validate,
};
