"use client";
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import AppShell from '@/components/AppShell';

function formatPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

function formatCurrency(val) {
  const n = Number(val) || 0;
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_STYLES = {
  draft: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
  pending: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
  sent: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  viewed: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  accepted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  scheduled: 'bg-v-gold/15 text-v-gold border-v-gold/30',
  in_progress: 'bg-v-gold/15 text-v-gold border-v-gold/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  expired: 'bg-red-500/15 text-red-300 border-red-500/30',
  overdue: 'bg-red-500/15 text-red-300 border-red-500/30',
  cancelled: 'bg-red-500/15 text-red-300 border-red-500/30',
};

function statusClass(s) {
  return STATUS_STYLES[s] || 'bg-gray-500/15 text-gray-300 border-gray-500/30';
}

const KIND_LABEL = { quote: 'QUOTE', invoice: 'INVOICE', job: 'JOB' };

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Notes editing
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState(null);

  // Aircraft editing
  const [addingAircraft, setAddingAircraft] = useState(false);
  const [newAircraft, setNewAircraft] = useState({ tail: '', model: '' });
  const [aircraftSaving, setAircraftSaving] = useState(false);

  // Photo viewer
  const [viewerPhoto, setViewerPhoto] = useState(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const authHeaders = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    loadDetails();
  }, [customerId]);

  const loadDetails = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/details`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLoadError(err.error || `Failed to load (${res.status})`);
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
      setNotesDraft(json.notes || '');
      setNotesDirty(false);
    } catch (err) {
      setLoadError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (res.ok) {
        setNotesDirty(false);
        setNotesSavedAt(Date.now());
        setData(prev => prev ? { ...prev, notes: notesDraft, customer: { ...prev.customer, notes: notesDraft } } : prev);
      }
    } catch (err) {
      console.error('Save notes error', err);
    } finally {
      setNotesSaving(false);
    }
  };

  const addAircraft = async () => {
    const tail = (newAircraft.tail || '').trim().toUpperCase();
    if (!tail) return;
    setAircraftSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/aircraft`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tail, model: (newAircraft.model || '').trim() }),
      });
      if (res.ok) {
        const j = await res.json();
        setData(prev => prev ? { ...prev, aircraft: j.aircraft || prev.aircraft } : prev);
        setNewAircraft({ tail: '', model: '' });
        setAddingAircraft(false);
      }
    } catch (err) {
      console.error('Add aircraft error', err);
    } finally {
      setAircraftSaving(false);
    }
  };

  const removeAircraft = async (tail) => {
    if (!confirm(`Remove ${tail} from this customer?`)) return;
    const remaining = (data?.aircraft || []).filter(a => String(a.tail || '').toUpperCase() !== String(tail).toUpperCase());
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ tail_numbers: remaining }),
      });
      if (res.ok) {
        setData(prev => prev ? { ...prev, aircraft: remaining } : prev);
      }
    } catch (err) {
      console.error('Remove aircraft error', err);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading customer..." />;
  }

  if (loadError || !data?.customer) {
    return (
      <AppShell title="Customer">
        <div className="p-6 max-w-md">
          <p className="text-v-text-secondary mb-4">{loadError || 'Customer not found'}</p>
          <a href="/customers" className="text-v-gold hover:text-v-gold-dim">&larr; Back to Customers</a>
        </div>
      </AppShell>
    );
  }

  const { customer, aircraft = [], photos = [], activity = [], counts = {} } = data;
  const tags = Array.isArray(customer.tags) ? customer.tags : [];

  return (
    <AppShell title="Customer">
      <div className="px-4 sm:px-6 md:px-10 py-6 pb-32 max-w-[1400px] mx-auto">
        {/* Back link */}
        <div className="mb-4">
          <a href="/customers" className="text-sm text-v-text-secondary hover:text-v-gold">&larr; Customers</a>
        </div>

        {/* HEADER */}
        <header className="bg-v-surface border border-v-border rounded-sm p-4 sm:p-6 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-heading text-2xl sm:text-3xl text-v-text-primary truncate">{customer.name || 'Customer'}</h1>
              {customer.company_name && (
                <p className="text-sm text-v-text-secondary mt-0.5 truncate">{customer.company_name}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm">
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="text-v-gold hover:text-v-gold-dim flex items-center gap-1.5 min-w-0">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <span className="truncate">{customer.email}</span>
                  </a>
                )}
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="text-v-gold hover:text-v-gold-dim flex items-center gap-1.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    {formatPhone(customer.phone)}
                  </a>
                )}
                {customer.airport && (
                  <span className="text-v-text-secondary flex items-center gap-1.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12l4-4m-4 4l4 4" /></svg>
                    {customer.airport}
                  </span>
                )}
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded text-[11px] font-medium bg-v-gold/10 text-v-gold border border-v-gold/30">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons — full width on mobile, row on desktop */}
            <div className="grid grid-cols-3 sm:flex sm:flex-row gap-2 sm:gap-2 sm:shrink-0">
              <a
                href={`/quotes/new?customer_id=${customerId}`}
                className="px-3 py-2 bg-v-gold text-v-charcoal rounded-sm text-xs sm:text-sm font-medium text-center hover:bg-v-gold-dim"
              >
                + Quote
              </a>
              <a
                href={`/jobs/new?customer_id=${customerId}`}
                className="px-3 py-2 bg-v-gold text-v-charcoal rounded-sm text-xs sm:text-sm font-medium text-center hover:bg-v-gold-dim"
              >
                + Job
              </a>
              <a
                href={`/invoices?new=blank&customer_id=${customerId}`}
                className="px-3 py-2 bg-v-gold text-v-charcoal rounded-sm text-xs sm:text-sm font-medium text-center hover:bg-v-gold-dim"
              >
                + Invoice
              </a>
            </div>
          </div>
        </header>

        {/* AIRCRAFT */}
        <section className="bg-v-surface border border-v-border rounded-sm p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-heading text-v-text-secondary uppercase tracking-widest">Aircraft ({aircraft.length})</h2>
            {!addingAircraft && (
              <button
                onClick={() => setAddingAircraft(true)}
                className="text-xs text-v-gold hover:text-v-gold-dim border border-v-gold/30 hover:border-v-gold/60 rounded px-2.5 py-1"
              >
                + Add Aircraft
              </button>
            )}
          </div>

          {addingAircraft && (
            <div className="bg-v-charcoal/50 border border-v-border rounded p-3 mb-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newAircraft.tail}
                onChange={(e) => setNewAircraft(p => ({ ...p, tail: e.target.value.toUpperCase() }))}
                placeholder="Tail #"
                className="flex-1 bg-v-surface border border-v-border rounded px-3 py-2 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
              <input
                type="text"
                value={newAircraft.model}
                onChange={(e) => setNewAircraft(p => ({ ...p, model: e.target.value }))}
                placeholder="Make / Model (optional)"
                className="flex-[2] bg-v-surface border border-v-border rounded px-3 py-2 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={addAircraft}
                  disabled={aircraftSaving || !newAircraft.tail.trim()}
                  className="px-3 py-2 bg-v-gold text-v-charcoal text-sm rounded font-medium hover:bg-v-gold-dim disabled:opacity-50"
                >
                  {aircraftSaving ? 'Saving...' : 'Add'}
                </button>
                <button
                  onClick={() => { setAddingAircraft(false); setNewAircraft({ tail: '', model: '' }); }}
                  className="px-3 py-2 border border-v-border rounded text-sm text-v-text-secondary hover:text-v-text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {aircraft.length === 0 && !addingAircraft ? (
            <p className="text-sm text-v-text-secondary py-3">No aircraft on file. Tap "+ Add Aircraft" to add one.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {aircraft.map((ac) => {
                const tail = String(ac.tail || '').toUpperCase();
                return (
                  <div
                    key={tail || Math.random()}
                    className="flex items-center justify-between bg-v-charcoal/40 border border-v-border rounded p-3 hover:border-v-gold/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => tail && router.push(`/aircraft/${encodeURIComponent(tail)}`)}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="font-data text-v-text-primary text-base truncate">{tail || 'Aircraft'}</p>
                      {ac.model && <p className="text-xs text-v-text-secondary truncate">{ac.model}</p>}
                    </button>
                    <button
                      onClick={() => removeAircraft(tail)}
                      className="text-v-text-secondary/40 hover:text-red-400 p-1.5 ml-2 shrink-0"
                      title="Remove"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* NOTES */}
        <section className="bg-v-surface border border-v-border rounded-sm p-4 sm:p-6 mb-4">
          <h2 className="text-sm font-heading text-v-text-secondary uppercase tracking-widest mb-3">Notes</h2>
          <textarea
            value={notesDraft}
            onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
            rows={4}
            placeholder="Notes about this customer (preferences, schedule, internal reminders)..."
            className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-v-text-secondary">
              {notesSaving ? 'Saving...' : notesDirty ? 'Unsaved changes' : notesSavedAt ? 'Saved' : ' '}
            </span>
            <button
              onClick={saveNotes}
              disabled={notesSaving || !notesDirty}
              className="px-3 py-1.5 bg-v-gold text-v-charcoal text-sm rounded font-medium hover:bg-v-gold-dim disabled:opacity-50"
            >
              {notesSaving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>
        </section>

        {/* PHOTOS */}
        <section className="bg-v-surface border border-v-border rounded-sm p-4 sm:p-6 mb-4">
          <h2 className="text-sm font-heading text-v-text-secondary uppercase tracking-widest mb-3">Photos ({photos.length})</h2>
          {photos.length === 0 ? (
            <p className="text-sm text-v-text-secondary py-3">No photos yet. Photos uploaded with requests for this customer will appear here.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {photos.map((p, idx) => (
                <button
                  key={`${p.url}-${idx}`}
                  onClick={() => setViewerPhoto(p)}
                  className="aspect-square bg-v-charcoal rounded overflow-hidden border border-v-border hover:border-v-gold/40 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.aircraft || 'Customer photo'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ACTIVITY */}
        <section className="bg-v-surface border border-v-border rounded-sm p-4 sm:p-6">
          <h2 className="text-sm font-heading text-v-text-secondary uppercase tracking-widest mb-3">
            Recent Activity ({counts.quotes || 0} quotes &middot; {counts.invoices || 0} invoices &middot; {counts.jobs || 0} jobs)
          </h2>
          {activity.length === 0 ? (
            <p className="text-sm text-v-text-secondary py-3">No quotes, invoices, or jobs yet for this customer.</p>
          ) : (
            <div className="divide-y divide-v-border/30">
              {activity.map(item => (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => router.push(item.href)}
                  className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-v-charcoal/30 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-[10px] font-bold tracking-wider text-v-text-secondary w-14 shrink-0">
                      {KIND_LABEL[item.kind] || item.kind.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-v-text-primary truncate">{item.label}</p>
                      <p className="text-xs text-v-text-secondary">{formatDate(item.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                    {item.amount > 0 && (
                      <span className="text-sm font-data text-v-text-primary whitespace-nowrap">{formatCurrency(item.amount)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Photo viewer */}
      {viewerPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setViewerPhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewerPhoto.url}
            alt={viewerPhoto.aircraft || 'Photo'}
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={() => setViewerPhoto(null)}
            className="absolute top-4 right-4 text-white text-2xl hover:text-v-gold"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      )}
    </AppShell>
  );
}
