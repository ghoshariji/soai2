const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Society',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: { type: String, enum: ['admin', 'moderator', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
        isMuted: { type: Boolean, default: false },
        mutedUntil: { type: Date },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    lastMessage: {
      content: { type: String },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sentAt: { type: Date },
    },
  },
  { timestamps: true }
);

groupSchema.index({ societyId: 1, isDeleted: 1 });
groupSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('Group', groupSchema);
