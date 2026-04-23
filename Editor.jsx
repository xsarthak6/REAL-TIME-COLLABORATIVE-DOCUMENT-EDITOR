import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Quill from 'quill';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import Sidebar from '../components/Sidebar';
import ShareModal from '../components/ShareModal';

const SOCKET_URL = 'http://localhost:5000';
const SAVE_INTERVAL = 2000;
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  [{ font: [] }],
  [{ size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ align: [] }],
  ['blockquote', 'code-block'],
  ['link'],
  ['clean'],
];

export default function Editor() {
  const { id: docId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const socketRef = useRef(null);
  const saveTimerRef = useRef(null);
  const titleRef = useRef(null);

  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('Untitled Document');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [activeUsers, setActiveUsers] = useState([]);
  const [versions, setVersions] = useState([]);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState({});

  // ── Initialize Quill ────────────────────────────────────────────────────────
  useEffect(() => {
    if (quillRef.current || !editorRef.current) return;

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: { toolbar: TOOLBAR_OPTIONS },
      placeholder: 'Start writing your document...',
    });

    quill.disable();
    quill.setText('Loading...');
    quillRef.current = quill;
  }, []);

  // ── Connect Socket & Load Document ──────────────────────────────────────────
  useEffect(() => {
    if (!quillRef.current || !user) return;

    const socket = io(SOCKET_URL, {
      auth: { token: user.token },
      reconnection: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-document', { documentId: docId });
    });

    socket.on('connect_error', (err) => {
      setError('Connection failed: ' + err.message);
      setLoading(false);
    });

    // Receive initial document content
    socket.on('load-document', (docData) => {
      setDoc(docData);
      setTitle(docData.title || 'Untitled Document');

      const quill = quillRef.current;
      if (docData.content?.ops) {
        quill.setContents(docData.content);
      } else {
        quill.setText('');
      }
      quill.enable();
      setLoading(false);
      updateStats(quill.getText());
    });

    // Receive remote delta changes
    socket.on('receive-changes', ({ delta }) => {
      quillRef.current?.updateContents(delta);
    });

    // Title changed by remote user
    socket.on('title-changed', ({ title: newTitle }) => {
      setTitle(newTitle);
    });

    // Active users list updated
    socket.on('active-users', (users) => {
      setActiveUsers(users);
    });

    // Remote cursor update
    socket.on('cursor-update', ({ userId, user: remoteUser, range }) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: { ...remoteUser, range },
      }));
    });

    // User left
    socket.on('user-left', ({ userId }) => {
      setRemoteCursors((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    });

    // Document saved confirmation
    socket.on('document-saved', ({ wordCount: wc }) => {
      setSaveStatus('Saved');
      setWordCount(wc);
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [docId, user]);

  // ── Handle Local Edits — send delta to server ───────────────────────────────
  useEffect(() => {
    const quill = quillRef.current;
    const socket = socketRef.current;
    if (!quill || !socket) return;

    const handler = (delta, _oldDelta, source) => {
      if (source !== 'user') return;

      socket.emit('send-changes', { documentId: docId, delta, source });
      setSaveStatus('Saving...');

      // Emit typing indicator
      socket.emit('typing', { documentId: docId, isTyping: true });

      // Update word count locally
      const text = quill.getText();
      updateStats(text);

      // Debounce actual save
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const content = quill.getContents();
        const text = quill.getText();
        socket.emit('save-document', {
          documentId: docId,
          content,
          contentText: text,
        });
        socket.emit('typing', { documentId: docId, isTyping: false });
      }, SAVE_INTERVAL);
    };

    quill.on('text-change', handler);
    return () => quill.off('text-change', handler);
  }, [docId]);

  // ── Send cursor position ────────────────────────────────────────────────────
  useEffect(() => {
    const quill = quillRef.current;
    const socket = socketRef.current;
    if (!quill || !socket) return;

    const handler = (range) => {
      socket.emit('cursor-change', { documentId: docId, range });
    };

    quill.on('selection-change', handler);
    return () => quill.off('selection-change', handler);
  }, [docId]);

  // ── Update word/char counts ─────────────────────────────────────────────────
  const updateStats = (text) => {
    const clean = text.replace(/\n$/, '');
    setCharCount(clean.length);
    setWordCount(
      clean.trim() === '' ? 0 : clean.trim().split(/\s+/).length
    );
  };

  // ── Title change ────────────────────────────────────────────────────────────
  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setSaveStatus('Saving...');
    socketRef.current?.emit('title-change', { documentId: docId, title: newTitle });
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('Saved'), 1000);
  };

  // ── Load versions ───────────────────────────────────────────────────────────
  const loadVersions = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents/${docId}/versions`);
      setVersions(data);
    } catch {}
  }, [docId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  // ── Restore version ─────────────────────────────────────────────────────────
  const handleRestoreVersion = async (version) => {
    if (!confirm(`Restore to version "${version.label || `v${version.versionNumber}`}"? Current content will be saved first.`)) return;
    try {
      const { data } = await api.post(`/documents/${docId}/versions/restore/${version._id}`);
      if (data.content?.ops) {
        quillRef.current?.setContents(data.content);
      }
      setSaveStatus('Restored');
      loadVersions();
    } catch {
      alert('Failed to restore version');
    }
  };

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: 'var(--danger)', fontSize: '16px' }}>{error}</p>
        <button className="btn" onClick={() => navigate('/')}>← Back to dashboard</button>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <div style={styles.topLeft}>
          <button
            className="btn btn-sm"
            onClick={() => navigate('/')}
            style={{ padding: '5px 10px' }}
          >
            ←
          </button>
          <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#185FA5" />
            <rect x="8" y="10" width="20" height="3" rx="1.5" fill="white" />
            <rect x="8" y="17" width="14" height="3" rx="1.5" fill="white" />
            <rect x="8" y="24" width="17" height="3" rx="1.5" fill="white" />
          </svg>
          <input
            ref={titleRef}
            style={styles.titleInput}
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled Document"
          />
          <span style={styles.saveStatus(saveStatus)}>{saveStatus}</span>
        </div>

        <div style={styles.topRight}>
          {/* Active user avatars */}
          <div style={{ display: 'flex' }}>
            {activeUsers.slice(0, 5).map((u, i) => (
              <div
                key={u._id}
                className="avatar"
                style={{
                  background: u.color,
                  fontSize: '11px',
                  width: 28,
                  height: 28,
                  marginLeft: i === 0 ? 0 : -6,
                  zIndex: 10 - i,
                  title: u.name,
                }}
                title={u.name}
              >
                {u.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
            ))}
          </div>

          <div style={styles.liveIndicator}>
            <span style={styles.liveDot} />
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Live</span>
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowShare(true)}
          >
            Share
          </button>
        </div>
      </div>

      {/* Editor + Sidebar */}
      <div style={styles.body}>
        <div style={styles.editorWrap}>
          {loading && (
            <div style={styles.loadingOverlay}>
              <p style={{ color: 'var(--text2)' }}>Loading document...</p>
            </div>
          )}

          {/* Remote cursor labels above editor */}
          {Object.entries(remoteCursors).map(([uid, info]) =>
            info.range ? (
              <div
                key={uid}
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '16px',
                  background: info.color,
                  color: 'white',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  zIndex: 5,
                  pointerEvents: 'none',
                  fontWeight: 500,
                }}
              >
                {info.name} is editing
              </div>
            ) : null
          )}

          <div ref={editorRef} style={styles.quillContainer} />

          {/* Word count bar */}
          <div style={styles.statusBar}>
            <span>{wordCount} words</span>
            <span>{charCount} characters</span>
            <span>Est. {Math.max(1, Math.round(wordCount / 200))} min read</span>
          </div>
        </div>

        <Sidebar
          docId={docId}
          activeUsers={activeUsers}
          versions={versions}
          wordCount={wordCount}
          charCount={charCount}
          onRestoreVersion={handleRestoreVersion}
          owner={doc?.owner}
          collaborators={doc?.collaborators}
          currentUser={user}
        />
      </div>

      {showShare && (
        <ShareModal docId={docId} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

const styles = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: '56px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    gap: '12px',
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    minWidth: 0,
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  titleInput: {
    border: 'none',
    background: 'transparent',
    fontSize: '15px',
    fontWeight: '500',
    color: 'var(--text)',
    outline: 'none',
    minWidth: '120px',
    maxWidth: '300px',
    flex: 1,
    padding: '4px 6px',
    borderRadius: '6px',
  },
  saveStatus: (status) => ({
    fontSize: '12px',
    color: status === 'Saved' ? 'var(--success)' : 'var(--text3)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }),
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  liveDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#1D9E75',
    display: 'inline-block',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  editorWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  quillContainer: {
    flex: 1,
    overflow: 'auto',
    background: 'var(--bg)',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  statusBar: {
    display: 'flex',
    gap: '20px',
    padding: '6px 24px',
    fontSize: '11px',
    color: 'var(--text3)',
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
};
