const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    contentText: {
      type: String,
      default: '',
    },
    savedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    label: {
      type: String,
      default: '',
    },
    wordCount: {
      type: Number,
      default: 0,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

// Keep only last 50 versions per document
versionSchema.index({ document: 1, versionNumber: -1 });

module.exports = mongoose.model('Version', versionSchema);
