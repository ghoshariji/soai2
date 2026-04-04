const express = require('express');
const router = express.Router();
const { getSuperAdminDashboard, getSocietyAdminDashboard } = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { checkTenant } = require('../middleware/tenant');

router.get('/super-admin', authenticate, authorize('super_admin'), getSuperAdminDashboard);
router.get('/society-admin', authenticate, authorize('society_admin'), checkTenant, getSocietyAdminDashboard);

module.exports = router;
