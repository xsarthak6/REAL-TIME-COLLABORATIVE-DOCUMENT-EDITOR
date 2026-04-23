const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Document = require('../models/Document');
const Version = require('../models/Version');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Helper: check if user can access document
const canAccess = (doc, userId, permission = 'view') => {
  if (doc.owner.toString() === userId.toString()) return true;
  const collab = doc.collaborators.find(
    (c) => c.user.toString() === userId.toString()
  );
  if (!collab) return false;
  if (permission === 'view') return true;
  return collab.permission === 'edit';
};

// @route   GET /api/documents
// @desc    Get all documents for logged-in user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const owned = await Document.find({ owner: req.user._id })
      .select('title updatedAt wordCount owner lastEditedBy')
      .populate('lastEditedBy', 'name color')
      .sort({ updatedAt: -1 });

    const shared = await Document.find({
      'collaborators.user': req.user._id,
    })
      .select('title updatedAt wordCount owner lastEditedBy')
      .populate('owner', 'name color')
      .populate('lastEditedBy', 'name color')
      .sort({ updatedAt: -1 });

    res.json({ owned, shared });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/documents
// @desc    Create a new document
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { title } = req.body;
    const doc = await Document.create({
      title: title || 'Untitled Document',
      owner: req.user._id,
      lastEditedBy: req.user._id,
    });

    // Create initial version
    await Version.create({
      document: doc._id,
      content: doc.content,
      savedBy: req.user._id,
      label: 'Initial draft',
      versionNumber: 1,
    });

    res.status(201).json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/documents/:id
// @desc    Get a single document
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('owner', 'name email color')
      .populate('collaborators.user', 'name email color')
      .populate('lastEditedBy', 'name color');

    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(doc, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/documents/:id
// @desc    Update document title
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(doc, req.user._id, 'edit')) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.body.title !== undefined) doc.title = req.body.title;
    doc.lastEditedBy = req.user._id;
    await doc.save();

    res.json({ _id: doc._id, title: doc.title, updatedAt: doc.updatedAt });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/documents/:id
// @desc    Delete a document (owner only)
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the owner can delete this document' });
    }

    await Document.deleteOne({ _id: doc._id });
    await Version.deleteMany({ document: doc._id });

    res.json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/documents/:id/versions
// @desc    Get version history for a document
// @access  Private
router.get('/:id/versions', protect, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(doc, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const versions = await Version.find({ document: req.params.id })
      .populate('savedBy', 'name color')
      .sort({ versionNumber: -1 })
      .limit(50);

    res.json(versions);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/documents/:id/versions/restore/:versionId
// @desc    Restore a document to a previous version
// @access  Private
router.post('/:id/versions/restore/:versionId', protect, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!canAccess(doc, req.user._id, 'edit')) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const version = await Version.findById(req.params.versionId);
    if (!version) return res.status(404).json({ message: 'Version not found' });

    // Save current as a new version before restoring
    const latestVersion = await Version.findOne({ document: doc._id }).sort({ versionNumber: -1 });
    const nextNum = latestVersion ? latestVersion.versionNumber + 1 : 1;

    await Version.create({
      document: doc._id,
      content: doc.content,
      contentText: doc.contentText,
      savedBy: req.user._id,
      label: `Before restore to v${version.versionNumber}`,
      wordCount: doc.wordCount,
      versionNumber: nextNum,
    });

    // Restore
    doc.content = version.content;
    doc.contentText = version.contentText;
    doc.wordCount = version.wordCount;
    doc.lastEditedBy = req.user._id;
    await doc.save();

    res.json({ message: 'Document restored', content: doc.content });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/documents/:id/share
// @desc    Generate or update share link
// @access  Private
router.post('/:id/share', protect, async (req, res) => {
  try {
    const { permission } = req.body; // 'view' | 'edit' | 'none'
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the owner can manage sharing' });
    }

    if (permission === 'none') {
      doc.shareLink = undefined;
      doc.shareLinkPermission = 'none';
    } else {
      if (!doc.shareLink) doc.shareLink = uuidv4();
      doc.shareLinkPermission = permission || 'view';
    }

    await doc.save();
    res.json({
      shareLink: doc.shareLink,
      shareLinkPermission: doc.shareLinkPermission,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/documents/:id/collaborators
// @desc    Add a collaborator by email
// @access  Private (owner only)
router.post('/:id/collaborators', protect, async (req, res) => {
  try {
    const { email, permission } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the owner can add collaborators' });
    }

    const invitee = await User.findOne({ email });
    if (!invitee) return res.status(404).json({ message: 'No user found with that email' });
    if (invitee._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You are already the owner' });
    }

    const alreadyCollab = doc.collaborators.find(
      (c) => c.user.toString() === invitee._id.toString()
    );
    if (alreadyCollab) {
      alreadyCollab.permission = permission || 'edit';
    } else {
      doc.collaborators.push({ user: invitee._id, permission: permission || 'edit' });
    }

    await doc.save();
    await doc.populate('collaborators.user', 'name email color');
    res.json(doc.collaborators);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
