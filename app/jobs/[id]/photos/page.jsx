"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import MediaGrid from '@/components/MediaGrid';
import MediaLightbox from '@/components/MediaLightbox';

export default function JobPhotosPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id;

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);
  const [beforeMedia, setBeforeMedia] = useState([]);
  const [afterMedia, setAfterMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeUpload, setActiveUpload] = useState(null); // 'before' | 'after'
  const [error, setError] = useState(null);

  // Lightbox state
  const [lightboxItems, setLightboxItems] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Selection state per section
  const [beforeSelected, setBeforeSelected] = useState(new Set());
  const [afterSelected, setAfterSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchData(token);
  }, [router, quoteId]);

  const fetchData = async (token) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const quoteRes = await fetch(`/api/quotes/${quoteId}`, { headers });
      if (quoteRes.ok) setQuote(await quoteRes.json());

      const mediaRes = await fetch(`/api/job-media?quote_id=${quoteId}`, { headers });
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        setBeforeMedia(data.beforeMedia || []);
        setAfterMedia(data.afterMedia || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load job data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMedia = (phase) => {
    setActiveUpload(phase);
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !activeUpload) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const token = localStorage.getItem('vector_token');
      let completed = 0;

      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const mediaType = `${activeUpload}_${isVideo ? 'video' : 'photo'}`;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('quote_id', quoteId);
        formData.append('media_type', mediaType);

        const res = await fetch('/api/job-media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Upload failed for ${file.name}`);
        }
        completed++;
        setUploadProgress(Math.round((completed / files.length) * 100));
      }

      await fetchData(token);
    } catch (err) {
      console.error('[upload]', err);
      setError('Upload failed: ' + (err.message || 'unknown'));
    } finally {
      setUploading(false);
      setActiveUpload(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelect = (id, phase) => {
    const setter = phase === 'before' ? setBeforeSelected : setAfterSelected;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (phase) => {
    const items = phase === 'before' ? beforeMedia : afterMedia;
    const setter = phase === 'before' ? setBeforeSelected : setAfterSelected;
    const current = phase === 'before' ? beforeSelected : afterSelected;
    if (current.size === items.length) {
      setter(new Set());
    } else {
      setter(new Set(items.map(i => i.id)));
    }
  };

  const handleBulkDelete = async (phase) => {
    const selected = phase === 'before' ? beforeSelected : afterSelected;
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item${selected.size === 1 ? '' : 's'}?`)) return;

    setDeleting(true);
    try {
      const token = localStorage.getItem('vector_token');
      const ids = [...selected].join(',');
      await fetch(`/api/job-media?ids=${ids}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData(token);
      if (phase === 'before') setBeforeSelected(new Set());
      else setAfterSelected(new Set());
    } catch (err) {
      setError('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const openLightbox = (items, index) => {
    setLightboxItems(items);
    setLightboxIndex(index);
  };

  if (loading) return <LoadingSpinner message="Loading photos..." />;

  return (
    <div className="min-h-screen bg-v-charcoal p-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,video/*"
        multiple
        className="hidden"
      />

      {/* Header */}
      <header className="text-white flex items-center justify-between mb-6 max-w-3xl mx-auto">
        <div className="flex items-center space-x-4">
          <button onClick={() => router.back()} className="text-2xl hover:text-v-gold">&larr;</button>
          <div>
            <h1 className="text-2xl font-bold">Job Documentation</h1>
            {quote && (
              <p className="text-v-text-secondary text-sm">
                {quote.aircraft_type} {quote.aircraft_model}
                {quote.tail_number && ` · ${quote.tail_number}`}
              </p>
            )}
          </div>
        </div>
        <a href={`/jobs/${quoteId}`} className="text-sm text-v-gold hover:underline">View Job</a>
      </header>

      {error && (
        <div className="max-w-3xl mx-auto mb-4 bg-red-900/30 border border-red-500/30 text-red-300 px-4 py-3 rounded">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      {uploading && (
        <div className="max-w-3xl mx-auto mb-4 bg-v-gold/10 border border-v-gold/30 text-v-gold px-4 py-3 rounded">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium">Uploading {activeUpload} media...</span>
            <span className="text-xs">{uploadProgress}%</span>
          </div>
          <div className="w-full h-1.5 bg-v-gold/20 rounded overflow-hidden">
            <div className="h-full bg-v-gold transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Before Section */}
        <MediaSection
          title="Before"
          subtitle="Document the aircraft condition before starting"
          items={beforeMedia}
          selectedIds={beforeSelected}
          onSelect={(id) => toggleSelect(id, 'before')}
          onSelectAll={() => toggleSelectAll('before')}
          onBulkDelete={() => handleBulkDelete('before')}
          onAddMedia={() => handleAddMedia('before')}
          onOpen={(i) => openLightbox(beforeMedia, i)}
          uploading={uploading && activeUpload === 'before'}
          deleting={deleting}
          accentColor="#3b82f6"
        />

        {/* After Section */}
        <MediaSection
          title="After"
          subtitle="Document your completed work"
          items={afterMedia}
          selectedIds={afterSelected}
          onSelect={(id) => toggleSelect(id, 'after')}
          onSelectAll={() => toggleSelectAll('after')}
          onBulkDelete={() => handleBulkDelete('after')}
          onAddMedia={() => handleAddMedia('after')}
          onOpen={(i) => openLightbox(afterMedia, i)}
          uploading={uploading && activeUpload === 'after'}
          deleting={deleting}
          accentColor="#10b981"
        />

        {/* Status Summary */}
        <div className="bg-v-surface rounded-xl p-5">
          <h3 className="font-semibold text-v-text-primary mb-3 text-sm">Documentation Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-v-text-secondary">Before</span>
              <span className={beforeMedia.length > 0 ? 'text-green-400' : 'text-v-text-secondary/50'}>
                {beforeMedia.length > 0 ? `${beforeMedia.length} items \u2713` : 'None yet'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-v-text-secondary">After</span>
              <span className={afterMedia.length > 0 ? 'text-green-400' : 'text-v-text-secondary/50'}>
                {afterMedia.length > 0 ? `${afterMedia.length} items \u2713` : 'None yet'}
              </span>
            </div>
          </div>
          {beforeMedia.length > 0 && afterMedia.length > 0 && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-500/20 rounded">
              <p className="text-green-400 text-sm font-medium">Full documentation complete. Customer can view in their portal.</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <MediaLightbox
        items={lightboxItems}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNav={setLightboxIndex}
      />
    </div>
  );
}

// Reusable section for each phase
function MediaSection({ title, subtitle, items, selectedIds, onSelect, onSelectAll, onBulkDelete, onAddMedia, onOpen, uploading, deleting, accentColor }) {
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="bg-v-surface rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-v-text-primary">{title}</h2>
          <p className="text-sm text-v-text-secondary">{subtitle}</p>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-v-text-secondary">
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Selection bar */}
      {items.length > 0 && (
        <div className="flex items-center justify-between mb-3 py-2 border-y border-v-border">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-v-text-secondary">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onSelectAll}
              className="w-4 h-4 rounded accent-v-gold cursor-pointer"
            />
            <span>Select all</span>
            {selectedIds.size > 0 && <span className="text-v-gold">({selectedIds.size} selected)</span>}
          </label>
          {selectedIds.size > 0 && (
            <button
              onClick={onBulkDelete}
              disabled={deleting}
              className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
            </button>
          )}
        </div>
      )}

      {/* Media grid */}
      {items.length > 0 ? (
        <div className="mb-4">
          <MediaGrid items={items} selectedIds={selectedIds} onSelect={onSelect} onOpen={onOpen} />
        </div>
      ) : (
        <div className="mb-4 border-2 border-dashed border-v-border rounded-lg p-8 text-center">
          <svg className="w-10 h-10 text-v-text-secondary/40 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-v-text-secondary text-sm">No {title.toLowerCase()} media yet</p>
        </div>
      )}

      {/* Add Media button */}
      <button
        onClick={onAddMedia}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        style={{ background: uploading ? '#666' : accentColor }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {uploading ? 'Uploading...' : `Add ${title} Media`}
      </button>
      <p className="text-xs text-v-text-secondary/50 text-center mt-2">Photos and videos accepted</p>
    </div>
  );
}
