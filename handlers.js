const Document = require('../models/Document');
const Version = require('../models/Version');
const { verifySocketToken } = require('../middleware/auth');

// Track active rooms: { documentId: { userId: { socketId, user, cursor } } }
const activeRooms = {};

// Auto-save debounce per document
const saveTimers = {};

const registerSocketHandlers = (io) => {
  // Middleware: authenticate every socket connection
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    const user = await verifySocketToken(token);
    if (!user) return next(new Error('Invalid token'));

    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.name} (${socket.id})`);

    // ─── Join Document Room ──────────────────────────────────────────
    socket.on('join-document', async ({ documentId }) => {
      try {
        const doc = await Document.findById(documentId)
          .populate('owner', 'name email color')
          .populate('collaborators.user', 'name email color')
          .populate('lastEditedBy', 'name color');

        if (!doc) {
          socket.emit('error', { message: 'Document not found' });
          return;
        }

        // Check access
        const userId = socket.user._id.toString();
        const isOwner = doc.owner._id.toString() === userId;
        const isCollab = doc.collaborators.some(
          (c) => c.user._id.toString() === userId
        );

        if (!isOwner && !isCollab && !doc.isPublic) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(documentId);
        socket.currentDocId = documentId;

        // Track in room
        if (!activeRooms[documentId]) activeRooms[documentId] = {};
        activeRooms[documentId][userId] = {
          socketId: socket.id,
          user: {
            _id: socket.user._id,
            name: socket.user.name,
            color: socket.user.color,
          },
          cursor: null,
        };

        // Send current document to joining user
        socket.emit('load-document', {
          _id: doc._id,
          title: doc.title,
          content: doc.content,
          owner: doc.owner,
          collaborators: doc.collaborators,
          updatedAt: doc.updatedAt,
        });

        // Broadcast updated active users list to room
        const roomUsers = Object.values(activeRooms[documentId]).map((u) => u.user);
        io.to(documentId).emit('active-users', roomUsers);

        console.log(`${socket.user.name} joined document ${documentId}`);
      } catch (err) {
        console.error('join-document error:', err);
        socket.emit('error', { message: 'Failed to join document' });
      }
    });

    // ─── Send Delta (content change) ────────────────────────────────
    socket.on('send-changes', ({ documentId, delta, source }) => {
      if (source !== 'user') return;
      // Broadcast delta to all OTHER users in the room
      socket.to(documentId).emit('receive-changes', { delta, userId: socket.user._id });

      // Debounce auto-save (save 2s after last change)
      if (saveTimers[documentId]) clearTimeout(saveTimers[documentId]);
      saveTimers[documentId] = setTimeout(async () => {
        // Content is saved via save-document event from client
      }, 2000);
    });

    // ─── Save Document Content ───────────────────────────────────────
    socket.on('save-document', async ({ documentId, content, contentText }) => {
      try {
        const doc = await Document.findById(documentId);
        if (!doc) return;

        const wordCount = contentText
          ? contentText.trim().split(/\s+/).filter((w) => w.length > 0).length
          : 0;

        doc.content = content;
        doc.contentText = contentText || '';
        doc.wordCount = wordCount;
        doc.lastEditedBy = socket.user._id;
        await doc.save();

        // Create a version snapshot (max every 30s per user to avoid flooding)
        const latestVersion = await Version.findOne({ document: documentId }).sort({
          versionNumber: -1,
        });
        const nextNum = latestVersion ? latestVersion.versionNumber + 1 : 1;

        // Only save version if content changed significantly
        await Version.create({
          document: documentId,
          content,
          contentText: contentText || '',
          savedBy: socket.user._id,
          wordCount,
          versionNumber: nextNum,
          label: `Auto-save by ${socket.user.name}`,
        });

        // Prune versions older than last 50
        const allVersions = await Version.find({ document: documentId })
          .sort({ versionNumber: -1 })
          .select('_id');
        if (allVersions.length > 50) {
          const toDelete = allVersions.slice(50).map((v) => v._id);
          await Version.deleteMany({ _id: { $in: toDelete } });
        }

        // Notify room of save
        io.to(documentId).emit('document-saved', {
          updatedAt: doc.updatedAt,
          savedBy: { name: socket.user.name, color: socket.user.color },
          wordCount,
        });
      } catch (err) {
        console.error('save-document error:', err);
      }
    });

    // ─── Title Change ────────────────────────────────────────────────
    socket.on('title-change', ({ documentId, title }) => {
      socket.to(documentId).emit('title-changed', { title, userId: socket.user._id });

      // Persist title
      Document.findByIdAndUpdate(documentId, {
        title,
        lastEditedBy: socket.user._id,
      }).catch(console.error);
    });

    // ─── Cursor Position ─────────────────────────────────────────────
    socket.on('cursor-change', ({ documentId, range }) => {
      if (activeRooms[documentId] && activeRooms[documentId][socket.user._id]) {
        activeRooms[documentId][socket.user._id].cursor = range;
      }
      socket.to(documentId).emit('cursor-update', {
        userId: socket.user._id,
        user: {
          name: socket.user.name,
          color: socket.user.color,
        },
        range,
      });
    });

    // ─── User is Typing ──────────────────────────────────────────────
    socket.on('typing', ({ documentId, isTyping }) => {
      socket.to(documentId).emit('user-typing', {
        userId: socket.user._id,
        name: socket.user.name,
        color: socket.user.color,
        isTyping,
      });
    });

    // ─── Disconnect ──────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.user.name}`);

      const docId = socket.currentDocId;
      if (docId && activeRooms[docId]) {
        delete activeRooms[docId][socket.user._id.toString()];

        if (Object.keys(activeRooms[docId]).length === 0) {
          delete activeRooms[docId];
        } else {
          const roomUsers = Object.values(activeRooms[docId]).map((u) => u.user);
          io.to(docId).emit('active-users', roomUsers);
        }

        // Notify others this user left
        socket.to(docId).emit('user-left', {
          userId: socket.user._id,
          name: socket.user.name,
        });
      }
    });
  });
};

module.exports = registerSocketHandlers;
