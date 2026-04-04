const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    password: { type: String, required: true, select: false, minlength: 6 },
    phone: { type: String, trim: true },
    role: {
      type: String,
      enum: ['super_admin', 'society_admin', 'user'],
      default: 'user',
    },
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Society',
      default: null,
    },
    flatNumber: { type: String, trim: true },
    profilePhoto: { type: String, default: '' },
    profilePhotoPublicId: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
    },
    isDeleted: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    refreshToken: { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    fcmToken: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for multi-tenant queries
userSchema.index({ societyId: 1, email: 1 });
userSchema.index({ societyId: 1, status: 1, isDeleted: 1 });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Exclude deleted and blocked in queries by default (can override)
userSchema.query.active = function () {
  return this.where({ isDeleted: false });
};

module.exports = mongoose.model('User', userSchema);
