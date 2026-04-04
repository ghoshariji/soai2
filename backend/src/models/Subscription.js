const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Society',
      required: true,
    },
    plan: {
      type: String,
      enum: ['basic', 'premium', 'custom'],
      default: 'basic',
    },
    startDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    features: {
      maxUsers: { type: Number, default: 100 },
      maxGroups: { type: Number, default: 10 },
      chatEnabled: { type: Boolean, default: true },
      feedEnabled: { type: Boolean, default: true },
      announcementsEnabled: { type: Boolean, default: true },
      complaintsEnabled: { type: Boolean, default: true },
      bulkUploadEnabled: { type: Boolean, default: false },
    },
    price: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    notes: { type: String, default: '' },
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: { type: Date },
  },
  { timestamps: true }
);

subscriptionSchema.index({ societyId: 1 });
subscriptionSchema.index({ expiryDate: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
