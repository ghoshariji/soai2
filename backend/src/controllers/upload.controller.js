'use strict';

/**
 * upload.controller.js
 *
 * Handles bulk data-import operations for the multi-tenant Society Management
 * platform.  The primary use-case is uploading an Excel (.xlsx) workbook that
 * contains resident data so the society admin can onboard many users at once
 * without going through the single-user creation form.
 *
 * Expected Excel format (row 1 = header row):
 *   Column A  →  Name         (required, string, 2–80 chars)
 *   Column B  →  Email        (required, valid email)
 *   Column C  →  Phone        (optional, 7–20 digit string)
 *   Column D  →  FlatNumber   (optional, string, ≤ 20 chars)
 *
 * multer must be configured with memoryStorage and the field name "file".
 * exceljs is used to parse the buffer – no disk I/O needed.
 *
 * Exports:
 *   uploadExcel   POST /upload/excel   (society_admin)
 */

const ExcelJS = require('exceljs');

const User         = require('../models/User');
const Subscription = require('../models/Subscription');
const {
  asyncHandler,
  APIError,
  ApiResponse,
  generatePassword,
} = require('../utils/helpers');
const logger = require('../utils/logger');
const { sendResidentWelcomeEmail } = require('../services/email.service');

// ─────────────────────────────────────────────────────────────────────────────
// Internal validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Basic RFC-5322 inspired email regex – same pattern used in the User model. */
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

/** Phone: optional plus sign, then 7–20 digits/spaces/hyphens/dots/parens */
const PHONE_REGEX = /^\+?[0-9\s\-().]{7,20}$/;

/**
 * Validate a single row object parsed from the worksheet.
 *
 * @param {{ Name, Email, Phone, FlatNumber }} row
 * @param {number} rowNumber  1-based row index (including header) for reporting
 * @returns {{ valid: boolean, value?: object, reason?: string }}
 */
const validateRow = (row, rowNumber) => {
  const name       = typeof row.Name       === 'string' ? row.Name.trim()       : String(row.Name       ?? '').trim();
  const email      = typeof row.Email      === 'string' ? row.Email.trim().toLowerCase() : String(row.Email ?? '').trim().toLowerCase();
  const phone      = typeof row.Phone      === 'string' ? row.Phone.trim()      : String(row.Phone      ?? '').trim();
  const flatNumber = typeof row.FlatNumber === 'string' ? row.FlatNumber.trim() : String(row.FlatNumber ?? '').trim();

  // Required: Name
  if (!name) {
    return { valid: false, reason: 'Name is required.' };
  }
  if (name.length < 2 || name.length > 80) {
    return { valid: false, reason: 'Name must be between 2 and 80 characters.' };
  }

  // Required: Email
  if (!email) {
    return { valid: false, reason: 'Email is required.' };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, reason: `"${email}" is not a valid email address.` };
  }

  // Optional: Phone
  if (phone && !PHONE_REGEX.test(phone)) {
    return {
      valid:  false,
      reason: `"${phone}" is not a valid phone number. Use 7–20 digits (with optional +, spaces, hyphens).`,
    };
  }

  // Optional: FlatNumber
  if (flatNumber && flatNumber.length > 20) {
    return { valid: false, reason: 'FlatNumber must not exceed 20 characters.' };
  }

  return {
    valid: true,
    value: {
      name,
      email,
      phone:      phone      || '',
      flatNumber: flatNumber || '',
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// uploadExcel
// POST /upload/excel
// Requires: authenticate + authorize('society_admin') middleware
//           multer memoryStorage field "file"
// ─────────────────────────────────────────────────────────────────────────────
const uploadExcel = asyncHandler(async (req, res) => {
  // ── 1. Validate that a file was uploaded ────────────────────────────────────
  if (!req.file) {
    throw APIError.badRequest('No file uploaded. Please attach an Excel (.xlsx) file.');
  }

  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel',                                           // .xls (fallback)
  ];

  if (!allowedMimes.includes(req.file.mimetype)) {
    throw APIError.badRequest('Invalid file type. Please upload an Excel (.xlsx) file.');
  }

  // Guard against unreasonably large uploads (5 MB)
  const MAX_BYTES = 5 * 1024 * 1024;
  if (req.file.size > MAX_BYTES) {
    throw APIError.badRequest('File size exceeds the 5 MB limit.');
  }

  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society associated with your account.');

  // ── 2. Check subscription allows bulk upload ─────────────────────────────────
  const subscription = await Subscription.findOne({
    societyId,
    status:     'active',
    expiryDate: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!subscription) {
    throw new APIError(402, 'No active subscription found for this society.');
  }

  if (!subscription.features?.bulkUploadEnabled) {
    throw APIError.forbidden(
      'Bulk upload is not enabled on your current subscription plan. Please upgrade.'
    );
  }

  // ── 3. Parse the Excel workbook from the in-memory buffer ────────────────────
  const workbook   = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch (parseErr) {
    logger.error('[upload] Excel parse error:', parseErr.message);
    throw APIError.badRequest('Failed to parse the uploaded file. Ensure it is a valid Excel workbook.');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw APIError.badRequest('The uploaded workbook contains no worksheets.');
  }

  // ── 4. Read and normalise the header row ─────────────────────────────────────
  //
  // We read the first row to build a column-index → field-name map.
  // This makes the parser tolerant of column order as long as the header
  // labels match exactly (case-insensitive).
  //
  const EXPECTED_HEADERS = ['Name', 'Email', 'Phone', 'FlatNumber'];
  const headerMap = {}; // columnIndex (1-based) → normalised field name

  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const raw       = String(cell.value ?? '').trim();
    const normalised = EXPECTED_HEADERS.find(
      (h) => h.toLowerCase() === raw.toLowerCase()
    );
    if (normalised) {
      headerMap[colNumber] = normalised;
    }
  });

  // Enforce required columns
  const foundHeaders = Object.values(headerMap);
  const missingRequired = ['Name', 'Email'].filter((h) => !foundHeaders.includes(h));
  if (missingRequired.length > 0) {
    throw APIError.badRequest(
      `The worksheet is missing required header column(s): ${missingRequired.join(', ')}. ` +
      'Row 1 must contain: Name, Email, Phone, FlatNumber.'
    );
  }

  // ── 5. Parse data rows and validate ──────────────────────────────────────────
  const validRows   = [];   // { rowNumber, value: { name, email, phone, flatNumber } }
  const failedRows  = [];   // { row, email, name, reason }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    // Build a plain object from the row using the dynamic column map
    const rowObj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const field = headerMap[colNumber];
      if (field) {
        // Handle formula cells (use result value) and date cells
        const raw = cell.value;
        if (raw !== null && raw !== undefined && typeof raw === 'object') {
          rowObj[field] = raw.result !== undefined
            ? String(raw.result)   // formula cell
            : raw.text             // rich text cell
              ?? String(raw);
        } else {
          rowObj[field] = raw !== null && raw !== undefined ? String(raw) : '';
        }
      }
    });

    // Skip entirely blank rows (no Name and no Email)
    if (!rowObj.Name?.trim() && !rowObj.Email?.trim()) return;

    const { valid, value, reason } = validateRow(rowObj, rowNumber);

    if (!valid) {
      failedRows.push({
        row:    rowNumber,
        name:   rowObj.Name  || '',
        email:  rowObj.Email || '',
        reason,
      });
    } else {
      validRows.push({ rowNumber, value });
    }
  });

  const totalDataRows = validRows.length + failedRows.length;

  if (totalDataRows === 0) {
    return ApiResponse.ok('The worksheet contains no data rows.', {
      total:   0,
      success: 0,
      failed:  [],
    }).send(res);
  }

  if (validRows.length > 500) {
    throw APIError.badRequest(
      `Bulk upload is limited to 500 valid rows per file. ` +
      `This file contains ${validRows.length} valid rows after validation.`
    );
  }

  // ── 6. Check for duplicate emails within the uploaded file ───────────────────
  const seenEmails = new Set();

  const dedupedValid = [];
  for (const r of validRows) {
    const emailLower = r.value.email.toLowerCase();
    if (seenEmails.has(emailLower)) {
      failedRows.push({
        row:    r.rowNumber,
        name:   r.value.name,
        email:  r.value.email,
        reason: 'Duplicate email within the uploaded file.',
      });
    } else {
      seenEmails.add(emailLower);
      dedupedValid.push(r);
    }
  }

  if (dedupedValid.length === 0) {
    return ApiResponse.ok('No valid rows to import after deduplication.', {
      total:   totalDataRows,
      success: 0,
      failed:  failedRows,
    }).send(res);
  }

  // ── 7. Check for existing users in the society (batch query) ─────────────────
  const incomingEmails = dedupedValid.map((r) => r.value.email);

  const existingUsers = await User.find({
    email:     { $in: incomingEmails },
    societyId,
    isDeleted: false,
  })
    .select('email')
    .lean();

  const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  // ── 8. Prepare insertable batch ───────────────────────────────────────────────
  const toInsert    = [];  // Mongoose docs to bulk-insert
  const passwordMap = new Map(); // email → plain-text password (for welcome emails)

  for (const r of dedupedValid) {
    const emailLower = r.value.email.toLowerCase();

    if (existingEmailSet.has(emailLower)) {
      failedRows.push({
        row:    r.rowNumber,
        name:   r.value.name,
        email:  r.value.email,
        reason: 'A user with this email already exists in this society.',
      });
      continue;
    }

    const plainPassword = generatePassword();
    passwordMap.set(emailLower, plainPassword);

    toInsert.push({
      name:       r.value.name,
      email:      emailLower,
      phone:      r.value.phone,
      flatNumber: r.value.flatNumber,
      password:   plainPassword,   // User.pre('save') hook will hash this
      societyId,
      role:       'user',
      status:     'active',
    });
  }

  // ── 9. Bulk insert (ordered: false – partial success is acceptable) ───────────
  let insertedDocs = [];

  if (toInsert.length > 0) {
    try {
      // insertMany triggers pre-save hooks (including password hashing)
      insertedDocs = await User.insertMany(toInsert, { ordered: false });
    } catch (bulkErr) {
      // MongoBulkWriteError: some docs may have succeeded
      if (
        bulkErr.name === 'BulkWriteError' ||
        bulkErr.name === 'MongoBulkWriteError'
      ) {
        insertedDocs = bulkErr.insertedDocs || [];

        const writeErrors = bulkErr.writeErrors || [];
        for (const we of writeErrors) {
          const failedDoc = toInsert[we.index];
          failedRows.push({
            row:    failedDoc
              ? (dedupedValid.find((r) => r.value.email === failedDoc.email)?.rowNumber ?? we.index + 2)
              : we.index + 2,
            name:   failedDoc?.name  || '',
            email:  failedDoc?.email || '',
            reason: we.errmsg || 'Database write error.',
          });
        }
      } else {
        throw bulkErr; // unexpected – propagate to global error handler
      }
    }
  }

  // ── 10. Send welcome emails asynchronously (do not await – best effort) ───────
  for (const doc of insertedDocs) {
    const plain       = passwordMap.get(doc.email.toLowerCase());
    const societyName = req.user.societyName || '';
    if (plain) {
      sendResidentWelcomeEmail(
        {
          name:       doc.name,
          email:      doc.email,
          flatNumber: doc.flatNumber,
        },
        plain,
        societyName || 'your society',
      );
    }
  }

  // ── 11. Respond ───────────────────────────────────────────────────────────────
  logger.info(
    `[upload] Excel import by user ${req.user.id}: ` +
    `total=${totalDataRows}, inserted=${insertedDocs.length}, failed=${failedRows.length}`
  );

  return ApiResponse.ok(
    `Bulk import complete. ${insertedDocs.length} user(s) created.`,
    {
      total:   totalDataRows,
      success: insertedDocs.length,
      failed:  failedRows,
    }
  ).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  uploadExcel,
};
