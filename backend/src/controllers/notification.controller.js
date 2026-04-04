const Notification = require('../models/Notification');
const { asyncHandler, APIError, paginate } = require('../utils/helpers');

const getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip, take } = paginate(page, limit);

  const [notifications, total] = await Promise.all([
    Notification.find({ recipientId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(take)
      .lean(),
    Notification.countDocuments({ recipientId: req.user.id }),
  ]);

  res.json({
    success: true,
    data: { notifications, total, page: Number(page), pages: Math.ceil(total / take) },
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    recipientId: req.user.id,
    isRead: false,
  });
  res.json({ success: true, data: { count } });
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipientId: req.user.id,
  });
  if (!notification) throw new APIError('Notification not found', 404);

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  res.json({ success: true, message: 'Marked as read' });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipientId: req.user.id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.json({ success: true, message: 'All notifications marked as read', data: { updated: result.modifiedCount } });
});

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead };
