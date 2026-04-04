const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    societyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Society',
      required: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: { type: String, trim: true, maxlength: 2000 },
    images: [{ url: String, publicId: String }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

postSchema.index({ societyId: 1, isDeleted: 1, createdAt: -1 });
postSchema.index({ authorId: 1, isDeleted: 1 });

module.exports = mongoose.model('Post', postSchema);
