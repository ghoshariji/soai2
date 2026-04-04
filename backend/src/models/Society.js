const mongoose = require('mongoose');

const societySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    isDeleted: { type: Boolean, default: false },
    logo: { type: String, default: '' },
    logoPublicId: { type: String, default: '' },
    totalUnits: { type: Number, default: 0 },
    settings: {
      allowUserPosts: { type: Boolean, default: true },
      allowGroupCreation: { type: Boolean, default: false },
      maintenanceMode: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

societySchema.index({ status: 1, isDeleted: 1 });

module.exports = mongoose.model('Society', societySchema);
