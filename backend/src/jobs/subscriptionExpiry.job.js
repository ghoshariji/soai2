const cron = require('node-cron');
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const Society = require('../models/Society');
const User = require('../models/User');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');

// Daily 9 AM – send expiry warning emails (7 days before expiry)
const sendExpiryWarnings = cron.schedule(
  '0 9 * * *',
  async () => {
    logger.info('[cron] Running subscription expiry warning job');
    try {
      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const expiringSoon = await Subscription.find({
        status: 'active',
        expiryDate: { $gte: now, $lte: sevenDaysLater },
        reminderSent: false,
      }).populate('societyId', 'name adminId');

      for (const sub of expiringSoon) {
        try {
          const society = sub.societyId;
          if (!society) continue;

          const admin = await User.findOne({
            _id: society.adminId,
            isDeleted: false,
          }).select('email name');

          if (!admin) continue;

          const daysLeft = Math.ceil((sub.expiryDate - now) / (1000 * 60 * 60 * 24));
          await emailService.sendSubscriptionExpiryWarning(
            admin.email,
            society.name,
            daysLeft,
            sub.expiryDate
          );

          await Subscription.updateOne({ _id: sub._id }, { reminderSent: true, reminderSentAt: now });
          logger.info(`[cron] Expiry warning sent for society: ${society.name}`);
        } catch (err) {
          logger.error(`[cron] Failed to send warning for subscription ${sub._id}: ${err.message}`);
        }
      }

      logger.info(`[cron] Expiry warning job complete. Processed: ${expiringSoon.length}`);
    } catch (err) {
      logger.error(`[cron] Expiry warning job failed: ${err.message}`);
    }
  },
  { scheduled: false }
);

// Midnight – expire subscriptions and deactivate societies
const expireSubscriptions = cron.schedule(
  '0 0 * * *',
  async () => {
    logger.info('[cron] Running subscription expiry job');
    try {
      const now = new Date();

      const expired = await Subscription.find({
        status: 'active',
        expiryDate: { $lt: now },
      }).select('_id societyId');

      const societyIds = expired.map((s) => s.societyId).filter(Boolean);

      if (expired.length > 0) {
        await Subscription.updateMany(
          { _id: { $in: expired.map((s) => s._id) } },
          { status: 'expired' }
        );

        await Society.updateMany(
          { _id: { $in: societyIds } },
          { status: 'inactive' }
        );

        // Send expired notification emails
        for (const sub of expired) {
          try {
            const society = await Society.findById(sub.societyId).select('name adminId');
            if (!society) continue;
            const admin = await User.findById(society.adminId).select('email');
            if (!admin) continue;
            await emailService.sendSubscriptionExpiredEmail(admin.email, society.name);
          } catch (err) {
            logger.error(`[cron] Failed to send expiry email for ${sub._id}: ${err.message}`);
          }
        }

        logger.info(`[cron] Expired ${expired.length} subscription(s), deactivated ${societyIds.length} society(ies)`);
      } else {
        logger.info('[cron] No subscriptions to expire');
      }
    } catch (err) {
      logger.error(`[cron] Subscription expiry job failed: ${err.message}`);
    }
  },
  { scheduled: false }
);

const startCronJobs = () => {
  sendExpiryWarnings.start();
  expireSubscriptions.start();
  logger.info('[cron] Cron jobs started: expiry warnings (9 AM daily), expiry check (midnight)');
};

module.exports = { startCronJobs };
