import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState({ owned: [], shared: [] });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      const { data } = await api.get('/documents');
      setDocs(data);
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const createDoc = async () => {
    setCreating(true);
    try {
      const { data } = await api.post('/documents', { title: 'Untitled Document' });
      navigate(`/document/${data._id}`);
    } catch {
      setError('Failed to create document');
      setCreating(false);
    }
  };

  const deleteDoc = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this document permanently?')) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocs((d) => ({ ...d, owned: d.owned.filter((doc) => doc._id !== id) }));
    } catch {
      setError('Failed to delete document');
    }
  };

  const formatDate = (d) => {
    const date = new Date(d);
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={styles.page}>
      {/* Navbar */}
      <nav style={styles.nav}>
        <div style={styles.navLeft}>
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#185FA5" />
            <rect x="8" y="10" width="20" height="3" rx="1.5" fill="white" />
            <rect x="8" y="17" width="14" height="3" rx="1.5" fill="white" />
            <rect x="8" y="24" width="17" height="3" rx="1.5" fill="white" />
          </svg>
          <span style={styles.navBrand}>CollabDocs</span>
        </div>
        <div style={styles.navRight}>
          <div
            className="avatar"
            style={{ background: user?.color || '#185FA5', fontSize: '12px' }}
            title={user?.name}
          >
            {initials}
          </div>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{user?.name}</span>
          <button className="btn btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <main style={styles.main}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.h1}>My Documents</h1>
            <p style={{ color: 'var(--text2)', fontSize: '14px' }}>
              Create and collaborate on documents in real time
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={createDoc}
            disabled={creating}
          >
            {creating ? 'Creating...' : '+ New document'}
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <div style={styles.empty}>Loading your documents...</div>
        ) : (
          <>
            {/* Owned documents */}
            <section style={{ marginBottom: '40px' }}>
              <h2 style={styles.sectionTitle}>Created by me</h2>
              {docs.owned.length === 0 ? (
                <div style={styles.emptySection}>
                  <p style={{ color: 'var(--text2)', fontSize: '14px' }}>
                    No documents yet.{' '}
                    <button
                      onClick={createDoc}
                      style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                    >
                      Create your first document →
                    </button>
                  </p>
                </div>
              ) : (
                <div style={styles.grid}>
                  {docs.owned.map((doc) => (
                    <DocCard
                      key={doc._id}
                      doc={doc}
                      showDelete
                      onOpen={() => navigate(`/document/${doc._id}`)}
                      onDelete={(e) => deleteDoc(doc._id, e)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Shared documents */}
            {docs.shared.length > 0 && (
              <section>
                <h2 style={styles.sectionTitle}>Shared with me</h2>
                <div style={styles.grid}>
                  {docs.shared.map((doc) => (
                    <DocCard
                      key={doc._id}
                      doc={doc}
                      onOpen={() => navigate(`/document/${doc._id}`)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function DocCard({ doc, onOpen, onDelete, showDelete, formatDate }) {
  return (
    <div style={cardStyles.card} onClick={onOpen}>
      <div style={cardStyles.preview}>
        <div style={cardStyles.line} />
        <div style={{ ...cardStyles.line, width: '70%' }} />
        <div style={{ ...cardStyles.line, width: '85%' }} />
        <div style={{ ...cardStyles.line, width: '55%' }} />
      </div>
      <div style={cardStyles.body}>
        <p style={cardStyles.title}>{doc.title || 'Untitled Document'}</p>
        <div style={cardStyles.meta}>
          <span style={cardStyles.metaText}>
            Edited {formatDate(doc.updatedAt)}
          </span>
          {doc.wordCount > 0 && (
            <span style={cardStyles.metaText}>{doc.wordCount} words</span>
          )}
        </div>
      </div>
      {showDelete && (
        <button
          style={cardStyles.deleteBtn}
          onClick={onDelete}
          title="Delete document"
        >
          ✕
        </button>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: '60px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  navLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  navBrand: { fontSize: '17px', fontWeight: '600', color: 'var(--text)' },
  navRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  main: { maxWidth: '1100px', margin: '0 auto', padding: '40px 32px' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '32px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  h1: { fontSize: '24px', fontWeight: '600', marginBottom: '4px' },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text2)',
    marginBottom: '14px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  empty: {
    textAlign: 'center',
    padding: '80px 0',
    color: 'var(--text2)',
    fontSize: '15px',
  },
  emptySection: {
    padding: '24px',
    background: 'var(--surface)',
    border: '1px dashed var(--border2)',
    borderRadius: '12px',
    textAlign: 'center',
  },
};

const cardStyles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s, border-color 0.15s',
    overflow: 'hidden',
    position: 'relative',
    ':hover': { borderColor: 'var(--border2)' },
  },
  preview: {
    background: '#f8f7f4',
    padding: '20px 20px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    height: '110px',
  },
  line: {
    height: '8px',
    background: 'var(--border2)',
    borderRadius: '4px',
    width: '100%',
  },
  body: { padding: '12px 16px 14px' },
  title: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text)',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' },
  metaText: { fontSize: '11px', color: 'var(--text3)' },
  deleteBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    color: 'var(--text2)',
    cursor: 'pointer',
    opacity: 0,
    transition: 'opacity 0.15s',
  },
};
