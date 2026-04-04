const express = require('express');
const router = express.Router();
const { uploadExcel } = require('../controllers/upload.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { checkTenant, checkSubscriptionFeature } = require('../middleware/tenant');
const { excelUpload } = require('../config/cloudinary');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.post(
  '/excel',
  authenticate,
  authorize('society_admin'),
  checkTenant,
  checkSubscriptionFeature('bulkUploadEnabled'),
  uploadLimiter,
  excelUpload.single('file'),
  uploadExcel
);

module.exports = router;
