'use strict';

/**
 * dashboard.controller.js
 *
 * Two dashboard views:
 *   getSuperAdminDashboard   – super_admin only, platform-wide stats
 *   getSocietyAdminDashboard – society_admin, scoped to their society
 *
 * All helpers imported from ../utils/helpers.
 */

const mongoose     = require('mongoose');
const Society      = require('../models/Society');
const User         = require('../models/User');
const Subscription = require('../models/Subscription');
const Group        = require('../models/Group');
const Announcement = require('../models/Announcement');
const Complaint    = require('../models/Complaint');
const {
  asyncHandler,
  APIError,
  ApiResponse,
} = require('../utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Date representing the start of a given month offset from today.
 * offset = 0  → start of current month
 * offset = -1 → start of last month
 * etc.
 */
const startOfMonthOffset = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d;
};

/**
 * Return the ISO year-month label (e.g. "2026-03") for a given month offset.
 */
const monthLabel = (offset = 0) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + offset);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// getSuperAdminDashboard
// GET /api/dashboard/super-admin
// super_admin role required.
// ─────────────────────────────────────────────────────────────────────────────
const getSuperAdminDashboard = asyncHandler(async (req, res) => {
  if (req.user.role !== 'super_admin') {
    throw APIError.forbidden('Only super_admin can access this dashboard.');
  }

  const now = new Date();

  // ── Run all independent queries in parallel for performance ────────────────
  const [
    societyStats,
    totalUsers,
    subscriptionStats,
    monthlyGrowthRaw,
    topSocietiesRaw,
  ] = await Promise.all([

    // 1. Society counts: total, active, inactive (excludes soft-deleted)
    Society.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id:      null,
          total:    { $sum: 1 },
          active:   { $sum: { $cond: [{ $eq: ['$status', 'active'] },   1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
        },
      },
    ]),

    // 2. Total non-deleted, non-super_admin users across all societies
    User.countDocuments({ isDeleted: false, role: { $ne: 'super_admin' } }),

    // 3. Subscription counts: active, expired, expiring within 7 days
    Subscription.aggregate([
      {
        $facet: {
          active: [
            { $match: { expiryDate: { $gt: now }, status: { $ne: 'cancelled' } } },
            { $count: 'count' },
          ],
          expired: [
            { $match: { $or: [{ expiryDate: { $lte: now } }, { status: 'expired' }] } },
            { $count: 'count' },
          ],
          expiringSoon: [
            {
              $match: {
                expiryDate: {
                  $gt: now,
                  $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
                },
                status: { $ne: 'cancelled' },
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]),

    // 4. Monthly society creation for the last 6 months (including current)
    Society.aggregate([
      {
        $match: {
          isDeleted:  false,
          createdAt:  { $gte: startOfMonthOffset(-5) },
        },
      },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // 5. Top 5 societies by user count
    User.aggregate([
      { $match: { isDeleted: false, societyId: { $ne: null }, role: { $ne: 'super_admin' } } },
      { $group: { _id: '$societyId', userCount: { $sum: 1 } } },
      { $sort: { userCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from:         'societies',
          localField:   '_id',
          foreignField: '_id',
          as:           'society',
        },
      },
      { $unwind: { path: '$society', preserveNullAndEmpty: false } },
      {
        $project: {
          _id:       0,
          societyId: '$_id',
          userCount: 1,
          name:      '$society.name',
          city:      '$society.city',
          status:    '$society.status',
        },
      },
    ]),
  ]);

  // ── Flatten society stats ──────────────────────────────────────────────────
  const sStats = societyStats[0] || { total: 0, active: 0, inactive: 0 };

  // ── Flatten subscription stats ────────────────────────────────────────────
  const subFacet       = subscriptionStats[0] || {};
  const activeSubCount       = subFacet.active?.[0]?.count       ?? 0;
  const expiredSubCount      = subFacet.expired?.[0]?.count      ?? 0;
  const expiringSoonSubCount = subFacet.expiringSoon?.[0]?.count ?? 0;

  // ── Build monthly growth array with zeros for months with no data ─────────
  // We want exactly 6 buckets: current month and 5 months back.
  const growthMap = new Map();
  for (const doc of monthlyGrowthRaw) {
    const label = `${doc._id.year}-${String(doc._id.month).padStart(2, '0')}`;
    growthMap.set(label, doc.count);
  }

  const monthlyGrowth = Array.from({ length: 6 }, (_, i) => {
    const offset = i - 5; // -5, -4, -3, -2, -1, 0
    const label  = monthLabel(offset);
    return { month: label, count: growthMap.get(label) ?? 0 };
  });

  return ApiResponse.ok('Super admin dashboard data fetched successfully.', {
    societies: {
      total:    sStats.total,
      active:   sStats.active,
      inactive: sStats.inactive,
    },
    users: {
      total: totalUsers,
    },
    subscriptions: {
      active:       activeSubCount,
      expired:      expiredSubCount,
      expiringSoon: expiringSoonSubCount,
    },
    monthlyGrowth,
    topSocietiesByUsers: topSocietiesRaw,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// getSocietyAdminDashboard
// GET /api/dashboard/society-admin
// society_admin role required; scoped to req.user.societyId.
// ─────────────────────────────────────────────────────────────────────────────
const getSocietyAdminDashboard = asyncHandler(async (req, res) => {
  if (req.user.role !== 'society_admin' && req.user.role !== 'super_admin') {
    throw APIError.forbidden('Only society_admin can access this dashboard.');
  }

  const societyId = req.user.societyId;
  if (!societyId) throw APIError.forbidden('No society is associated with your account.');

  const sid = new mongoose.Types.ObjectId(societyId);

  // ── Run all independent queries in parallel ────────────────────────────────
  const [
    userStats,
    totalGroups,
    totalAnnouncements,
    complaintStats,
    recentAnnouncements,
    recentComplaints,
  ] = await Promise.all([

    // 1. User counts by status (exclude soft-deleted, exclude super_admin)
    User.aggregate([
      {
        $match: {
          societyId: sid,
          isDeleted: false,
          role:      { $ne: 'super_admin' },
        },
      },
      {
        $group: {
          _id:     null,
          total:   { $sum: 1 },
          active:  { $sum: { $cond: [{ $eq: ['$status', 'active'] },  1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
        },
      },
    ]),

    // 2. Total non-deleted groups in this society
    Group.countDocuments({ societyId: sid, isDeleted: false }),

    // 3. Total non-deleted, non-expired announcements in this society
    Announcement.countDocuments({ societyId: sid, isDeleted: false }),

    // 4. Complaint counts: open vs resolved
    Complaint.aggregate([
      { $match: { societyId: sid, isDeleted: false } },
      {
        $group: {
          _id:      null,
          total:    { $sum: 1 },
          open:     { $sum: { $cond: [{ $in: ['$status', ['open', 'in_progress']] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0] } },
        },
      },
    ]),

    // 5. Last 5 announcements (for recent activity feed)
    Announcement.find({ societyId: sid, isDeleted: false })
      .select('title priority createdAt createdBy')
      .populate({ path: 'createdBy', select: 'name profilePhoto' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),

    // 6. Last 5 complaints (for recent activity feed)
    Complaint.find({ societyId: sid, isDeleted: false })
      .select('title status priority category createdAt raisedBy')
      .populate({ path: 'raisedBy', select: 'name flatNumber profilePhoto' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // ── Flatten user stats ────────────────────────────────────────────────────
  const uStats = userStats[0] || { total: 0, active: 0, blocked: 0, inactive: 0 };

  // ── Flatten complaint stats ───────────────────────────────────────────────
  const cStats = complaintStats[0] || { total: 0, open: 0, resolved: 0 };

  // ── Merge and sort recent activity (announcements + complaints) ───────────
  const announcementActivity = recentAnnouncements.map((a) => ({
    type:      'announcement',
    _id:       a._id,
    title:     a.title,
    priority:  a.priority,
    createdBy: a.createdBy,
    createdAt: a.createdAt,
  }));

  const complaintActivity = recentComplaints.map((c) => ({
    type:      'complaint',
    _id:       c._id,
    title:     c.title,
    status:    c.status,
    priority:  c.priority,
    category:  c.category,
    raisedBy:  c.raisedBy,
    createdAt: c.createdAt,
  }));

  // Combine both streams, sort by createdAt descending, keep top 5
  const recentActivity = [...announcementActivity, ...complaintActivity]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return ApiResponse.ok('Society admin dashboard data fetched successfully.', {
    users: {
      total:    uStats.total,
      active:   uStats.active,
      blocked:  uStats.blocked,
      inactive: uStats.inactive,
    },
    groups: {
      total: totalGroups,
    },
    announcements: {
      total: totalAnnouncements,
    },
    complaints: {
      total:    cStats.total,
      open:     cStats.open,
      resolved: cStats.resolved,
    },
    recentActivity,
  }).send(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getSuperAdminDashboard,
  getSocietyAdminDashboard,
};
