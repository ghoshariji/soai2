'use strict';

const mongoose = require('mongoose');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { asyncHandler, APIError, paginate } = require('../utils/helpers');
const { deleteImage } = require('../services/cloudinary.service');

const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, description, priority = 'normal' } = req.body;
  if (!title || !description) throw new APIError('Title and description are required', 400);

  const societyId = req.user.societyId;
  const image = req.file ? req.file.path : '';
  const imagePublicId = req.file ? req.file.filename : '';

  const announcement = await Announcement.create({
    societyId,
    createdBy: req.user.id,
    title,
    description,
    priority,
    image,
    imagePublicId,
  });

  await announcement.populate('createdBy', 'name profilePhoto');

  // Create notifications for all active users in society
  const users = await User.find({
    societyId,
    isDeleted: false,
    status: 'active',
    _id: { $ne: req.user.id },
  }).select('_id');

  if (users.length > 0) {
    const notifications = users.map((u) => ({
      recipientId: u._id,
      societyId,
      type: 'announcement',
      title: `📢 ${title}`,
      body: description.substring(0, 100),
      data: { announcementId: announcement._id },
    }));
    await Notification.insertMany(notifications);
  }

  // Real-time broadcast
  const io = req.app.get('io');
  if (io) {
    io.to(`society_${societyId}`).emit('new_announcement', {
      announcement,
      message: `New announcement: ${title}`,
    });
  }

  res.status(201).json({ success: true, message: 'Announcement created', data: { announcement } });
});

const getAnnouncements = asyncHandler(async (req, res) => {
  const { page = 1, limit = 15, priority } = req.query;
  const { skip, take } = paginate(page, limit);
  const societyId = req.user.societyId || req.query.societyId;

  const filter = { societyId, isDeleted: false };
  if (priority) filter.priority = priority;

  const [announcements, total] = await Promise.all([
    Announcement.find(filter)
      .populate('createdBy', 'name profilePhoto')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(take)
      .lean(),
    Announcement.countDocuments(filter),
  ]);

  const userId = req.user.id;
  const enriched = announcements.map((a) => ({
    ...a,
    isRead: a.readBy?.some((r) => r.userId?.toString() === userId) || false,
    readCount: a.readBy?.length || 0,
  }));

  res.json({
    success: true,
    data: {
      announcements: enriched,
      total,
      page: Number(page),
      pages: Math.ceil(total / take),
    },
  });
});

const getAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
    _id: req.params.id,
    societyId: req.user.societyId,
    isDeleted: false,
  }).populate('createdBy', 'name profilePhoto');

  if (!announcement) throw new APIError('Announcement not found', 404);

  // Auto-mark as read
  const userId = new mongoose.Types.ObjectId(req.user.id);
  const alreadyRead = announcement.readBy.some(
    (r) => r.userId?.toString() === req.user.id
  );
  if (!alreadyRead) {
    announcement.readBy.push({ userId, readAt: new Date() });
    await announcement.save();
  }

  res.json({ success: true, data: { announcement } });
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
    _id: req.params.id,
    societyId: req.user.societyId,
    isDeleted: false,
  });
  if (!announcement) throw new APIError('Announcement not found', 404);

  const { title, description, priority } = req.body;
  if (title) announcement.title = title;
  if (description) announcement.description = description;
  if (priority) announcement.priority = priority;

  if (req.file) {
    if (announcement.imagePublicId) await deleteImage(announcement.imagePublicId);
    announcement.image = req.file.path;
    announcement.imagePublicId = req.file.filename;
  }

  await announcement.save();
  res.json({ success: true, message: 'Announcement updated', data: { announcement } });
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
    _id: req.params.id,
    societyId: req.user.societyId,
    isDeleted: false,
  });
  if (!announcement) throw new APIError('Announcement not found', 404);

  if (announcement.imagePublicId) await deleteImage(announcement.imagePublicId);
  announcement.isDeleted = true;
  await announcement.save();

  res.json({ success: true, message: 'Announcement deleted' });
});

const markAsRead = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({
    _id: req.params.id,
    societyId: req.user.societyId,
    isDeleted: false,
  });
  if (!announcement) throw new APIError('Announcement not found', 404);

  const alreadyRead = announcement.readBy.some(
    (r) => r.userId?.toString() === req.user.id
  );
  if (!alreadyRead) {
    announcement.readBy.push({ userId: req.user.id, readAt: new Date() });
    await announcement.save();
  }

  res.json({ success: true, message: 'Marked as read' });
});

module.exports = {
  createAnnouncement,
  getAnnouncements,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAsRead,
};
