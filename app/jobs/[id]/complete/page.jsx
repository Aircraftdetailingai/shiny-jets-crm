"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';

const SURFACE_TAGS = [
  { key: 'exterior', label: 'Exterior' },
  { key: 'interior', label: 'Interior' },
  { key: 'brightwork', label: 'Brightwork' },
  { key: 'windows', label: 'Transparencies' },
  { key: 'paint', label: 'Paint' },
  { key: 'leather', label: 'Leather' },
  { key: 'carpet', label: 'Carpet' },
  { key: 'engine', label: 'Engine Area' },
  { key: 'landing_gear', label: 'Landing Gear' },
  { key: 'other', label: 'Other' },
];

export default function JobCompletePage() {
  const router = useRouter();
  const { id: quoteId } = useParams();

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [activeUpload, setActiveUpload] = useState(null); // { phase: 'before'|'after', tag: string }
  const [completionNotes, setCompletionNotes] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [deliverySent, setDeliverySent] = useState(false);
  const [sendingDelivery, setSendingDelivery] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetchData();
  }, [quoteId]);

  const fetchData = async () => {
    try {
      const [qRes, mRes] = await Promise.all([
        fetch(`/api/quotes/${quoteId}`, { headers }),
        fetch(`/api/job-media?quote_id=${quoteId}`, { headers }),
      ]);
      if (qRes.ok) {
        const q = await qRes.json();
        setQuote(q);
        if (q.status === 'completed') setCompleted(true);
      }
      if (mRes.ok) {
        const m = await mRes.json();
        setBeforePhotos(m.beforeMedia || []);
        setAfterPhotos(m.afterMedia || []);
      }
    } catch {
      setError('Failed to load job data');
    } finally {
      setLoading(false);
    }
  };

  const startUpload = (phase, tag) => {
    setActiveUpload({ phase, tag });
    fileRef.current?.click();
  };

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !activeUpload) return;
    setUploading(true);
    setError(null);

    for (const file of files) {
      try {
        const dataUrl = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.readAsDataURL(file);
        });

        await fetch('/api/job-media', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_id: quoteId,
            media_type: `${activeUpload.phase}_photo`,
            url: dataUrl,
            notes: activeUpload.tag,
            surface_tag: activeUpload.tag,
          }),
        });
      } catch {}
    }

    await fetchData();
    setUploading(false);
    setActiveUpload(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (mediaId) => {
    await fetch(`/api/job-media?id=${mediaId}`, { method: 'DELETE', headers });
    await fetchData();
  };

  const handleComplete = async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quoteId,
          notes: completionNotes,
          actual_hours: quote?.total_hours,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to complete');
      }
      setCompleted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  };

  const handleSendDelivery = async () => {
    setSendingDelivery(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs/delivery', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quoteId }),
      });
      if (!res.ok) throw new Error('Failed to send');
      setDeliverySent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingDelivery(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const aircraft = [quote?.aircraft_type, quote?.aircraft_model].filter(Boolean).join(' ') || 'Aircraft';

  return (
    <div className="min-h-screen bg-v-charcoal p-4">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFile} capture="environment" />

      {/* Header */}
      <header className="text-white flex items-center space-x-4 mb-6">
        <a href="/dashboard" className="text-2xl hover:text-v-gold">&#8592;</a>
        <div>
          <h1 className="text-xl font-bold">Job Completion</h1>
          <p className="text-v-text-secondary text-sm">{aircraft} {quote?.tail_number ? `- ${quote.tail_number}` : ''}</p>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-6">

        {/* Before Photos */}
        <PhotoSection
          title="Before Photos"
          subtitle="Document condition before starting"
          photos={beforePhotos}
          phase="before"
          uploading={uploading}
          activeUpload={activeUpload}
          onUpload={startUpload}
          onDelete={handleDelete}
        />

        {/* After Photos */}
        <PhotoSection
          title="After Photos"
          subtitle="Document your completed work"
          photos={afterPhotos}
          phase="after"
          uploading={uploading}
          activeUpload={activeUpload}
          onUpload={startUpload}
          onDelete={handleDelete}
        />

        {/* Completion Notes */}
        {!completed && (
          <div className="bg-v-surface rounded-xl p-5">
            <h3 className="text-white font-medium mb-3">Completion Notes</h3>
            <textarea
              value={completionNotes}
              onChange={e => setCompletionNotes(e.target.value)}
              placeholder="Any notes about the job — issues found, extra work done, recommendations for next visit..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-3 text-sm placeholder-white/30 outline-none focus:border-v-gold resize-none"
            />
          </div>
        )}

        {/* Mark Complete */}
        {!completed ? (
          <button
            onClick={handleComplete}
            disabled={completing}
            className="w-full py-4 bg-green-600 text-white rounded-xl text-sm font-semibold uppercase tracking-wider hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {completing ? 'Completing...' : 'Mark Job Complete'}
          </button>
        ) : (
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-5 text-center">
            <p className="text-green-400 font-medium text-lg mb-1">Job Complete</p>
            <p className="text-green-400/60 text-sm">Completed {quote?.completed_at ? new Date(quote.completed_at).toLocaleDateString() : 'just now'}</p>
          </div>
        )}

        {/* Send Delivery Email */}
        {completed && !deliverySent && (
          <button
            onClick={handleSendDelivery}
            disabled={sendingDelivery}
            className="w-full py-4 bg-v-gold text-v-charcoal rounded-xl text-sm font-semibold uppercase tracking-wider hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
          >
            {sendingDelivery ? 'Sending...' : 'Send Delivery Email to Customer'}
          </button>
        )}

        {deliverySent && (
          <div className="bg-v-gold/10 border border-v-gold/30 rounded-xl p-4 text-center">
            <p className="text-v-gold text-sm font-medium">Delivery email sent to {quote?.client_email || 'customer'}</p>
          </div>
        )}

        {/* Back to Dashboard */}
        <a href="/dashboard" className="block w-full py-3 text-center text-v-text-secondary text-sm hover:text-white transition-colors">
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}

function PhotoSection({ title, subtitle, photos, phase, uploading, activeUpload, onUpload, onDelete }) {
  const isActive = activeUpload?.phase === phase;
  const color = phase === 'before' ? 'blue' : 'green';

  // Group photos by surface tag
  const grouped = {};
  for (const p of photos) {
    const tag = p.notes || p.surface_tag || 'other';
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(p);
  }

  return (
    <div className="bg-v-surface rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-white font-medium">{title}</h3>
          <p className="text-v-text-secondary text-xs">{subtitle}</p>
        </div>
        {photos.length > 0 && (
          <span className="text-green-400 text-xs font-medium">{photos.length} uploaded</span>
        )}
      </div>

      {/* Photo grid grouped by surface */}
      {Object.keys(grouped).length > 0 && (
        <div className="space-y-3 mb-4">
          {Object.entries(grouped).map(([tag, items]) => (
            <div key={tag}>
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
                {SURFACE_TAGS.find(s => s.key === tag)?.label || tag}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {items.map(item => (
                  <div key={item.id} className="relative group">
                    <img src={item.url} alt="" className="w-full h-20 object-cover rounded-lg border border-white/10" />
                    <button
                      onClick={() => onDelete(item.id)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >&times;</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Surface tag buttons */}
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Upload by surface area</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {SURFACE_TAGS.map(tag => (
          <button
            key={tag.key}
            onClick={() => onUpload(phase, tag.key)}
            disabled={uploading}
            className={`px-2 py-2 rounded-lg border text-[11px] transition-all ${
              isActive && activeUpload?.tag === tag.key
                ? `border-${color}-500 bg-${color}-500/20 text-white`
                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
            } disabled:opacity-50`}
          >
            {uploading && isActive && activeUpload?.tag === tag.key ? '...' : tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}
