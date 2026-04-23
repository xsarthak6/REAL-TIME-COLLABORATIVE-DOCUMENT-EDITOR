import { useState } from 'react';
import api from '../api';

export default function ShareModal({ docId, onClose }) {
  const [permission, setPermission] = useState('view');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/documents/${docId}/share`, { permission });
      const url = `${window.location.origin}/document/${docId}?share=${data.shareLink}`;
      setLink(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate link');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const disableLink = async () => {
    await api.post(`/documents/${docId}/share`, { permission: 'none' });
    setLink('');
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Share document</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          <p style={styles.label}>Anyone with the link can</p>
          <div style={styles.permRow}>
            {['view', 'edit'].map((p) => (
              <label key={p} style={styles.permOption}>
                <input
                  type="radio"
                  name="perm"
                  value={p}
                  checked={permission === p}
                  onChange={() => setPermission(p)}
                />
                <span style={{ textTransform: 'capitalize', fontSize: '14px' }}>{p}</span>
              </label>
            ))}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
            onClick={generateLink}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate share link'}
          </button>

          {link && (
            <div style={styles.linkBox}>
              <input
                style={styles.linkInput}
                value={link}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button className="btn btn-sm btn-primary" onClick={copyLink}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}

          {link && (
            <button
              style={styles.disableBtn}
              onClick={disableLink}
            >
              Disable link
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    background: 'var(--surface)',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 0',
  },
  title: { fontSize: '17px', fontWeight: '600' },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: 'var(--text2)',
    cursor: 'pointer',
    padding: '4px',
  },
  body: { padding: '20px 24px 24px' },
  label: { fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--text2)' },
  permRow: { display: 'flex', gap: '20px' },
  permOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
  },
  linkBox: {
    display: 'flex',
    gap: '8px',
    marginTop: '14px',
    alignItems: 'center',
  },
  linkInput: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid var(--border2)',
    borderRadius: '8px',
    fontSize: '12px',
    background: 'var(--bg)',
    color: 'var(--text)',
    outline: 'none',
    fontFamily: 'monospace',
  },
  disableBtn: {
    marginTop: '12px',
    background: 'none',
    border: 'none',
    color: 'var(--danger)',
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
