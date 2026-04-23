import { useState } from 'react';
import api from '../api';

export default function Sidebar({
  docId,
  activeUsers,
  versions,
  wordCount,
  charCount,
  onRestoreVersion,
  owner,
  collaborators,
  currentUser,
}) {
  const [tab, setTab] = useState('users'); // 'users' | 'versions' | 'info'
  const [addEmail, setAddEmail] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [adding, setAdding] = useState(false);

  const isOwner = owner?._id === currentUser?._id;

  const formatTime = (d) => {
    const date = new Date(d);
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleAddCollaborator = async (e) => {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    setAddMsg('');
    try {
      await api.post(`/documents/${docId}/collaborators`, {
        email: addEmail.trim(),
        permission: 'edit',
      });
      setAddMsg('✓ Collaborator added');
      setAddEmail('');
    } catch (err) {
      setAddMsg(err.response?.data?.message || 'Failed to add collaborator');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={styles.sidebar}>
      {/* Tabs */}
      <div style={styles.tabs}>
        {['users', 'versions', 'info'].map((t) => (
          <button
            key={t}
            style={{
              ...styles.tab,
              ...(tab === t ? styles.tabActive : {}),
            }}
            onClick={() => setTab(t)}
          >
            {t === 'users' ? 'People' : t === 'versions' ? 'History' : 'Info'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {/* PEOPLE TAB */}
        {tab === 'users' && (
          <div>
            <p style={styles.sectionLabel}>Online now</p>
            {activeUsers.length === 0 ? (
              <p style={styles.empty}>No one else is online</p>
            ) : (
              activeUsers.map((u) => (
                <div key={u._id} style={styles.userRow}>
                  <div
                    className="avatar"
                    style={{ background: u.color, fontSize: '11px', width: 28, height: 28 }}
                  >
                    {u.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <p style={styles.userName}>
                      {u.name} {u._id === currentUser?._id ? '(you)' : ''}
                    </p>
                    <p style={styles.userStatus}>
                      <span style={{ ...styles.onlineDot, background: '#1D9E75' }} />
                      Active
                    </p>
                  </div>
                </div>
              ))
            )}

            {collaborators?.length > 0 && (
              <>
                <p style={{ ...styles.sectionLabel, marginTop: 20 }}>Collaborators</p>
                {collaborators.map((c) => (
                  <div key={c.user?._id} style={styles.userRow}>
                    <div
                      className="avatar"
                      style={{ background: c.user?.color || '#888', fontSize: '11px', width: 28, height: 28 }}
                    >
                      {c.user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <p style={styles.userName}>{c.user?.name}</p>
                      <p style={styles.userStatus}>{c.permission}</p>
                    </div>
                  </div>
                ))}
              </>
            )}

            {isOwner && (
              <div style={{ marginTop: 20 }}>
                <p style={styles.sectionLabel}>Invite by email</p>
                <form onSubmit={handleAddCollaborator}>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="colleague@email.com"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    style={{ fontSize: '12px', padding: '7px 10px', marginBottom: 8 }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={adding}
                  >
                    {adding ? 'Adding...' : 'Add collaborator'}
                  </button>
                  {addMsg && (
                    <p style={{ fontSize: '12px', marginTop: 6, color: addMsg.startsWith('✓') ? '#1D9E75' : '#E24B4A' }}>
                      {addMsg}
                    </p>
                  )}
                </form>
              </div>
            )}
          </div>
        )}

        {/* VERSIONS TAB */}
        {tab === 'versions' && (
          <div>
            <p style={styles.sectionLabel}>Version history</p>
            {versions.length === 0 ? (
              <p style={styles.empty}>No saved versions yet</p>
            ) : (
              versions.map((v, i) => (
                <div
                  key={v._id}
                  style={styles.versionRow}
                  onClick={() => onRestoreVersion(v)}
                  title="Click to restore this version"
                >
                  <div
                    style={{
                      ...styles.versionDot,
                      background: i === 0 ? '#1D9E75' : 'var(--border2)',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <p style={styles.versionLabel}>
                      {i === 0 ? 'Current' : v.label || `Version ${v.versionNumber}`}
                    </p>
                    <p style={styles.versionMeta}>
                      {formatTime(v.createdAt)} · {v.savedBy?.name}
                    </p>
                    {v.wordCount > 0 && (
                      <p style={styles.versionMeta}>{v.wordCount} words</p>
                    )}
                  </div>
                  {i > 0 && (
                    <span style={styles.restoreBtn}>Restore</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* INFO TAB */}
        {tab === 'info' && (
          <div>
            <p style={styles.sectionLabel}>Document stats</p>
            {[
              ['Words', wordCount],
              ['Characters', charCount],
              ['Est. read time', `${Math.max(1, Math.round(wordCount / 200))} min`],
              ['Collaborators', (collaborators?.length || 0) + 1],
              ['Versions', versions.length],
            ].map(([label, value]) => (
              <div key={label} style={styles.statRow}>
                <span style={styles.statLabel}>{label}</span>
                <span style={styles.statValue}>{value}</span>
              </div>
            ))}

            {owner && (
              <>
                <p style={{ ...styles.sectionLabel, marginTop: 20 }}>Owner</p>
                <div style={styles.userRow}>
                  <div
                    className="avatar"
                    style={{ background: owner.color, fontSize: '11px', width: 28, height: 28 }}
                  >
                    {owner.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <p style={styles.userName}>{owner.name}</p>
                    <p style={styles.userStatus}>{owner.email}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: '240px',
    minWidth: '240px',
    borderLeft: '1px solid var(--border)',
    background: 'var(--surface)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    fontSize: '12px',
    fontWeight: '500',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text2)',
    borderBottom: '2px solid transparent',
    transition: 'color 0.15s',
  },
  tabActive: {
    color: 'var(--primary)',
    borderBottom: '2px solid var(--primary)',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--text3)',
    marginBottom: '10px',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
  },
  userName: { fontSize: '13px', fontWeight: '500', color: 'var(--text)' },
  userStatus: {
    fontSize: '11px',
    color: 'var(--text3)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  onlineDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  versionRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
  },
  versionDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '4px',
  },
  versionLabel: { fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '2px' },
  versionMeta: { fontSize: '11px', color: 'var(--text3)' },
  restoreBtn: {
    fontSize: '11px',
    color: 'var(--primary)',
    flexShrink: 0,
    marginTop: '2px',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '7px 0',
    borderBottom: '1px solid var(--border)',
  },
  statLabel: { fontSize: '13px', color: 'var(--text2)' },
  statValue: { fontSize: '13px', fontWeight: '500', color: 'var(--text)' },
  empty: { fontSize: '12px', color: 'var(--text3)', padding: '8px 0' },
};
