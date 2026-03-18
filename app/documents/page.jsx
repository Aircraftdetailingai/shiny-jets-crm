"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const CATEGORY_COLORS = {
  insurance: 'bg-blue-900/30 text-blue-400',
  licenses: 'bg-purple-900/30 text-purple-400',
  contracts: 'bg-green-900/30 text-green-400',
  sops: 'bg-v-gold-muted/30 text-v-gold',
  other: 'bg-v-charcoal text-v-text-secondary',
};

const CATEGORY_ICONS = {
  insurance: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  licenses: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
    </svg>
  ),
  contracts: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  sops: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  other: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntilExpiry(d) {
  if (!d) return null;
  const diff = new Date(d) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiresAt, t }) {
  const days = daysUntilExpiry(expiresAt);
  if (days === null) return null;
  if (days < 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 font-medium">{'Expired'}</span>;
  if (days <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-v-gold-muted/30 text-v-gold font-medium">{'Expires in'} {days}d</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 font-medium">{'Valid'}</span>;
}

export default function DocumentsPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Upload form state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const CATEGORIES = [
    { value: 'all', label: 'All' + ' ' + 'Documents' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'licenses', label: 'Licenses' },
    { value: 'contracts', label: 'Contracts' },
    { value: 'sops', label: 'SOPs' },
    { value: 'other', label: 'Other' },
  ];

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchDocuments();
  }, [router]);

  const getToken = () => localStorage.getItem('vector_token');
  const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });
  const jsonHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

  async function fetchDocuments() {
    try {
      const res = await fetch('/api/documents', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      setError('Failed to fetch');
    } finally {
      setLoading(false);
    }
  }

  function openUploadModal() {
    setUploadFile(null);
    setUploadName('');
    setUploadCategory('other');
    setUploadExpiry('');
    setUploadNotes('');
    setError('');
    setShowUpload(true);
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum 10MB.');
      return;
    }
    setUploadFile(file);
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''));
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadName || uploadFile.name);
      formData.append('category', uploadCategory);
      if (uploadExpiry) formData.append('expires_at', new Date(uploadExpiry).toISOString());
      if (uploadNotes) formData.append('notes', uploadNotes);

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setShowUpload(false);
      setSuccess('Document uploaded');
      fetchDocuments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function downloadDocument(doc) {
    setDownloading(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Download failed');
      window.open(data.url, '_blank');
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  }

  function openEditModal(doc) {
    setEditName(doc.name || '');
    setEditCategory(doc.category || 'other');
    setEditExpiry(doc.expires_at ? doc.expires_at.slice(0, 10) : '');
    setEditNotes(doc.notes || '');
    setError('');
    setShowEdit(doc);
  }

  async function saveEdit() {
    if (!showEdit) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/documents/${showEdit.id}`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: editName,
          category: editCategory,
          expires_at: editExpiry ? new Date(editExpiry).toISOString() : null,
          notes: editNotes,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setShowEdit(null);
      setSuccess('Document updated');
      fetchDocuments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDocument(doc) {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setSuccess('Document deleted');
      fetchDocuments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = filter === 'all' ? documents : documents.filter(d => d.category === filter);

  const expiringSoon = documents.filter(d => {
    const days = daysUntilExpiry(d.expires_at);
    return days !== null && days <= 30;
  });

  const categoryCounts = {};
  documents.forEach(d => {
    const cat = d.category || 'other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  if (loading) {
    return (
      <div className="page-transition min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-v-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-white text-2xl hover:opacity-70">&larr;</a>
          <h1 className="text-2xl font-bold text-white">{'Documents'}</h1>
        </div>
        <button
          onClick={openUploadModal}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-v-gold text-white shadow"
        >
          {'+ Upload Document'}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-900/20 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/20 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">{success}</div>
      )}

      {/* Expiring Soon Alert */}
      {expiringSoon.length > 0 && (
        <div className="bg-v-gold-muted/20 border border-v-gold/40 rounded-lg p-3 mb-4">
          <p className="text-v-gold font-medium text-sm">
            {expiringSoon.length} {'documents expiring soon or expired'}
          </p>
          <div className="mt-1 space-y-0.5">
            {expiringSoon.map(d => {
              const days = daysUntilExpiry(d.expires_at);
              return (
                <p key={d.id} className="text-xs text-v-gold/80">
                  {d.name} — {days < 0 ? <span className="text-red-600 font-medium">expired {formatDate(d.expires_at)}</span> : `expires ${formatDate(d.expires_at)}`}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {CATEGORIES.filter(c => c.value !== 'all').map(cat => (
          <button
            key={cat.value}
            onClick={() => setFilter(filter === cat.value ? 'all' : cat.value)}
            className={`rounded-lg p-3 text-left transition shadow ${
              filter === cat.value
                ? 'bg-v-gold text-white ring-2 ring-v-gold/50'
                : 'bg-v-surface hover:bg-white/5'
            }`}
          >
            <div className={`mb-1 ${filter === cat.value ? 'text-white' : 'text-v-text-secondary'}`}>
              {CATEGORY_ICONS[cat.value]}
            </div>
            <p className={`text-xs ${filter === cat.value ? 'text-white/80' : 'text-v-text-secondary'}`}>{cat.label}</p>
            <p className={`text-lg font-bold ${filter === cat.value ? 'text-white' : 'text-v-text-primary'}`}>
              {categoryCounts[cat.value] || 0}
            </p>
          </button>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setFilter(c.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === c.value ? 'bg-v-gold text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {c.label}
            {c.value !== 'all' && categoryCounts[c.value] ? ` (${categoryCounts[c.value]})` : ''}
          </button>
        ))}
      </div>

      {/* Document List */}
      {filtered.length === 0 ? (
        <div className="bg-v-surface rounded-lg p-8 text-center shadow">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="text-v-text-secondary mb-2">{'No documents yet'}</p>
          <button onClick={openUploadModal} className="text-v-gold hover:text-v-gold/80 font-medium text-sm">
            {'Upload your first document'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const days = daysUntilExpiry(doc.expires_at);
            const isExpiring = days !== null && days <= 30;
            return (
              <div
                key={doc.id}
                className={`bg-v-surface rounded-lg p-4 shadow hover:shadow-md transition-shadow ${isExpiring ? 'border-l-4 border-v-gold' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-lg ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}>
                      {CATEGORY_ICONS[doc.category] || CATEGORY_ICONS.other}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-v-text-primary truncate">{doc.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}>
                          {doc.category || 'other'}
                        </span>
                        <ExpiryBadge expiresAt={doc.expires_at} t={t} />
                      </div>
                      <p className="text-sm text-v-text-secondary mt-0.5">
                        {doc.file_name || 'File'}
                        {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
                        {' · '}{formatDate(doc.created_at)}
                      </p>
                      {doc.notes && <p className="text-xs text-v-text-secondary mt-1 truncate">{doc.notes}</p>}
                      {doc.expires_at && (
                        <p className={`text-xs mt-1 ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-v-gold' : 'text-v-text-secondary'}`}>
                          {days < 0 ? 'Expired' : 'Expires in'} {formatDate(doc.expires_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => downloadDocument(doc)}
                      disabled={downloading === doc.id}
                      title={'Download'}
                      className="p-2 text-v-text-secondary hover:text-blue-600 hover:bg-blue-900/20 rounded-lg transition"
                    >
                      {downloading === doc.id ? (
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => openEditModal(doc)}
                      title={'Edit'}
                      className="p-2 text-v-text-secondary hover:text-v-text-secondary hover:bg-white/5 rounded-lg transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteDocument(doc)}
                      title={'Delete'}
                      className="p-2 text-v-text-secondary hover:text-red-600 hover:bg-red-900/20 rounded-lg transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-v-surface rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-v-text-primary">{'+ Upload Document'}</h2>
              <button onClick={() => setShowUpload(false)} className="text-v-text-secondary hover:text-v-text-secondary text-xl">&times;</button>
            </div>

            {/* File drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition mb-4 ${
                uploadFile ? 'border-v-gold bg-v-gold/20' : 'border-v-border hover:border-gray-400'
              }`}
            >
              {uploadFile ? (
                <div>
                  <svg className="w-8 h-8 text-v-gold mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-v-text-primary">{uploadFile.name}</p>
                  <p className="text-xs text-v-text-secondary">{formatFileSize(uploadFile.size)}</p>
                  <p className="text-xs text-v-gold mt-1">{'Click to change file'}</p>
                </div>
              ) : (
                <div>
                  <svg className="w-8 h-8 text-v-text-secondary mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-v-text-secondary">{'Click to select a file'}</p>
                  <p className="text-xs text-v-text-secondary mt-1">{'PDF, DOC, images, etc. Max 10MB'}</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Document Name'}</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  placeholder="e.g. Liability Insurance 2026"
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm bg-v-surface text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Category'}</label>
                <div className="grid grid-cols-5 gap-1">
                  {CATEGORIES.filter(c => c.value !== 'all').map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setUploadCategory(cat.value)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition ${
                        uploadCategory === cat.value
                          ? 'bg-v-gold text-white border-v-gold'
                          : 'bg-v-surface text-v-text-secondary border-v-border hover:bg-white/5'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Expiration Date (optional)'}</label>
                <input
                  type="date"
                  value={uploadExpiry}
                  onChange={e => setUploadExpiry(e.target.value)}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm bg-v-surface text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Notes (optional)'}</label>
                <textarea
                  value={uploadNotes}
                  onChange={e => setUploadNotes(e.target.value)}
                  rows={2}
                  placeholder="Policy number, renewal info, etc."
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm bg-v-surface text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowUpload(false)} className="flex-1 px-4 py-2 border rounded-lg text-v-text-secondary hover:bg-white/5 text-sm">
                {'Cancel'}
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg font-medium disabled:opacity-50 text-sm"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEdit(null)}>
          <div className="bg-v-surface rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-v-text-primary">{'Edit Document'}</h2>
              <button onClick={() => setShowEdit(null)} className="text-v-text-secondary hover:text-v-text-secondary text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Document Name'}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm bg-v-surface text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Category'}</label>
                <div className="grid grid-cols-5 gap-1">
                  {CATEGORIES.filter(c => c.value !== 'all').map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setEditCategory(cat.value)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition ${
                        editCategory === cat.value
                          ? 'bg-v-gold text-white border-v-gold'
                          : 'bg-v-surface text-v-text-secondary border-v-border hover:bg-white/5'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Expiration Date (optional)'}</label>
                <input
                  type="date"
                  value={editExpiry}
                  onChange={e => setEditExpiry(e.target.value)}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm bg-v-surface text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Notes'}</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm bg-v-surface text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowEdit(null)} className="flex-1 px-4 py-2 border rounded-lg text-v-text-secondary hover:bg-white/5 text-sm">
                {'Cancel'}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg font-medium disabled:opacity-50 text-sm"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
