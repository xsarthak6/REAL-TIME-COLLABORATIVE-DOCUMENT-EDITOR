const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Untitled Document',
      trim: true,
      maxlength: 200,
    },
    content: {
      // Quill Delta format stored as JSON object
      type: mongoose.Schema.Types.Mixed,
      default: { ops: [{ insert: '\n' }] },
    },
    contentText: {
      // Plain text for word count / search
      type: String,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    collaborators: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        permission: {
          type: String,
          enum: ['view', 'edit'],
          default: 'edit',
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    shareLink: {
      type: String,
      unique: true,
      sparse: true,
    },
    shareLinkPermission: {
      type: String,
      enum: ['view', 'edit', 'none'],
      default: 'none',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    wordCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Index for fast user document queries
documentSchema.index({ owner: 1, updatedAt: -1 });
documentSchema.index({ 'collaborators.user': 1 });

module.exports = mongoose.model('Document', documentSchema);
