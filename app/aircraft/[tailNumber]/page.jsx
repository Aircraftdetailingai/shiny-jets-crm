"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

// Lower-case + trim name for matching against the services catalog —
// jobs.services / quote_services use display names not service_ids, so
// the SOPs section does the same string-match the resolver does on the
// server. Mirror of normalizeName in lib/resolve-sop.js — kept local so
// this client component has no transitive Supabase import.
function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

export default function AircraftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tailNumber = decodeURIComponent(params.tailNumber);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Service SOPs (Stage 1). Loaded alongside the aircraft data so the
  // Service SOPs section renders without a second loading state.
  const [servicesCatalog, setServicesCatalog] = useState([]);
  const [aircraftId, setAircraftId] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [showAllServices, setShowAllServices] = useState(false);
  const [editingOverrideFor, setEditingOverrideFor] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ sop_url: '', sop_summary: '' });
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    const auth = { Authorization: `Bearer ${token}` };

    fetch(`/api/aircraft/by-tail?tail=${encodeURIComponent(tailNumber)}`, { headers: auth })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    // Load detailer's full service catalog (with sop_url / sop_summary)
    // plus any aircraft-specific overrides keyed on this tail. Both
    // requests are non-blocking — the page still renders if either 404s.
    fetch(`/api/services`, { headers: auth })
      .then(r => r.ok ? r.json() : null)
      .then(d => setServicesCatalog(Array.isArray(d?.services) ? d.services : []))
      .catch(() => {});

    fetch(`/api/aircraft-service-sops?tail=${encodeURIComponent(tailNumber)}`, { headers: auth })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.aircraft_id) setAircraftId(d.aircraft_id);
        setOverrides(Array.isArray(d?.overrides) ? d.overrides : []);
      })
      .catch(() => {});
  }, [tailNumber]);

  // Resolve which services have ever appeared on a job for this tail.
  // /api/aircraft/by-tail's `data.jobs[].services` is the quote_services
  // shape ({ service_name, price }). Match by name against the catalog
  // to get a service_id we can attach SOP overrides to.
  const servicesUsedHere = useMemo(() => {
    if (!data?.jobs) return [];
    const byName = new Map();
    for (const svc of servicesCatalog) {
      const key = normalizeName(svc.name);
      if (key && !byName.has(key)) byName.set(key, svc);
    }
    const seen = new Set();
    const out = [];
    for (const job of data.jobs) {
      for (const s of (job.services || [])) {
        const name = s?.service_name || s?.description || s?.name || (typeof s === 'string' ? s : '');
        const key = normalizeName(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const matched = byName.get(key);
        out.push({
          key,
          name,
          service: matched || null, // null = no catalog match (orphaned name)
        });
      }
    }
    return out;
  }, [data?.jobs, servicesCatalog]);

  const overridesByServiceId = useMemo(() => {
    const m = new Map();
    for (const o of overrides) m.set(o.service_id, o);
    return m;
  }, [overrides]);

  const servicesToRender = useMemo(() => {
    if (showAllServices) {
      // All catalog services for this detailer, with usage flag.
      const usedIds = new Set(servicesUsedHere.map(s => s.service?.id).filter(Boolean));
      return servicesCatalog.map(svc => ({
        key: normalizeName(svc.name),
        name: svc.name,
        service: svc,
        used: usedIds.has(svc.id),
      }));
    }
    // Default: only services ever performed on this tail.
    return servicesUsedHere.map(s => ({ ...s, used: true }));
  }, [showAllServices, servicesUsedHere, servicesCatalog]);

  const openOverrideEditor = (service) => {
    const existing = overridesByServiceId.get(service.id);
    setEditingOverrideFor(service);
    setOverrideForm({
      sop_url: existing?.sop_url || '',
      sop_summary: existing?.sop_summary || '',
    });
  };

  const saveOverride = async () => {
    if (!editingOverrideFor) return;
    if (!overrideForm.sop_url.trim()) { alert('SOP URL is required.'); return; }
    setSavingOverride(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/aircraft-service-sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tail_number: tailNumber,
          aircraft_id: aircraftId || undefined,
          service_id: editingOverrideFor.id,
          sop_url: overrideForm.sop_url.trim(),
          sop_summary: overrideForm.sop_summary || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      const out = await res.json();
      if (out?.override) {
        // Upsert into local state
        setOverrides(prev => {
          const next = prev.filter(o => o.service_id !== out.override.service_id);
          next.push(out.override);
          return next;
        });
        if (out.override.aircraft_id) setAircraftId(out.override.aircraft_id);
      }
      setEditingOverrideFor(null);
    } catch (e) {
      alert(`Save failed: ${e.message || e}`);
    } finally {
      setSavingOverride(false);
    }
  };

  const removeOverride = async (overrideId) => {
    if (!overrideId) return;
    if (!confirm('Remove this aircraft-specific SOP? The service default will still apply.')) return;
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/aircraft-service-sops?id=${overrideId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Delete failed (HTTP ${res.status})`);
        return;
      }
      setOverrides(prev => prev.filter(o => o.id !== overrideId));
    } catch (e) {
      alert(`Delete failed: ${e.message || e}`);
    }
  };

  if (loading) return <AppShell title="Aircraft"><div className="p-8 text-v-text-secondary">Loading...</div></AppShell>;
  if (!data) return <AppShell title="Aircraft"><div className="p-8 text-red-400">Aircraft not found</div></AppShell>;

  const beforePhotos = data.photos.filter(p => p.media_type === 'before_photo');
  const afterPhotos = data.photos.filter(p => p.media_type === 'after_photo');

  // Group photos by job
  const photosByJob = {};
  data.photos.forEach(p => {
    if (!photosByJob[p.quote_id]) photosByJob[p.quote_id] = { before: [], after: [] };
    if (p.media_type === 'before_photo') photosByJob[p.quote_id].before.push(p);
    else photosByJob[p.quote_id].after.push(p);
  });

  return (
    <AppShell title={`Aircraft — ${tailNumber}`}>
    <div className="px-6 md:px-10 py-8 pb-40 max-w-5xl">
      {/* Header */}
      <button onClick={() => router.back()} className="text-sm text-v-text-secondary hover:text-v-text-primary mb-4 block">&larr; Back</button>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-lg bg-v-gold/20 flex items-center justify-center text-2xl">&#9992;</div>
        <div>
          <h1 className="font-heading text-2xl text-v-text-primary">{tailNumber}</h1>
          <p className="text-v-text-secondary">{data.aircraft_model || 'Aircraft'} &middot; {data.customer || ''}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-v-surface border border-v-border rounded-lg p-4 text-center">
          <p className="text-xs text-v-text-secondary">Total Jobs</p>
          <p className="text-2xl font-bold text-v-text-primary mt-1">{data.job_count}</p>
        </div>
        <div className="bg-v-surface border border-v-border rounded-lg p-4 text-center">
          <p className="text-xs text-v-text-secondary">Total Revenue</p>
          <p className="text-2xl font-bold text-v-gold mt-1">{currencySymbol()}{formatPrice(data.total_revenue)}</p>
        </div>
        <div className="bg-v-surface border border-v-border rounded-lg p-4 text-center">
          <p className="text-xs text-v-text-secondary">Photos</p>
          <p className="text-2xl font-bold text-v-text-primary mt-1">{data.photos.length}</p>
        </div>
        <div className="bg-v-surface border border-v-border rounded-lg p-4 text-center">
          <p className="text-xs text-v-text-secondary">Last Service</p>
          <p className="text-lg font-medium text-v-text-primary mt-1">
            {data.last_service ? new Date(data.last_service).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      {/* Service SOPs (Stage 1: L1 default + L2 aircraft override).
          Internal-only surface; never rendered on customer-facing pages. */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider">Service SOPs</h2>
          <button
            onClick={() => setShowAllServices(v => !v)}
            className="text-xs text-v-gold hover:text-v-gold-dim uppercase tracking-wider"
          >
            {showAllServices ? 'Only services on this aircraft' : 'All services'}
          </button>
        </div>

        {servicesToRender.length === 0 ? (
          <p className="text-xs text-v-text-secondary italic">
            {showAllServices
              ? 'No services configured. Add services in Settings → Services.'
              : 'No services have been performed on this aircraft yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {servicesToRender.map(({ key, name, service, used }) => {
              const def = service?.sop_url
                ? { url: service.sop_url, summary: service.sop_summary || null }
                : null;
              const override = service?.id ? overridesByServiceId.get(service.id) : null;
              return (
                <div key={key || name} className="bg-v-surface border border-v-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-v-text-primary truncate">
                        {name}
                        {!used && <span className="ml-2 text-[10px] uppercase tracking-wider text-v-text-secondary">(not yet performed)</span>}
                        {!service && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">no catalog match</span>}
                      </p>
                      {/* Level 1 — service default SOP */}
                      {def ? (
                        <div className="mt-2">
                          <a href={def.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-v-gold hover:underline">
                            📖 Default SOP
                          </a>
                          {def.summary && <p className="text-[11px] text-v-text-secondary mt-1">{def.summary}</p>}
                        </div>
                      ) : (
                        <p className="text-[11px] text-v-text-secondary mt-2 italic">No default SOP set for this service.</p>
                      )}
                      {/* Level 2 — aircraft-specific override (flagged distinctly) */}
                      {override && (
                        <div className="mt-2 pl-3 border-l-2 border-amber-500/50">
                          <a href={override.sop_url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:underline">
                            ⚠️ Aircraft-specific SOP
                          </a>
                          {override.sop_summary && <p className="text-[11px] text-v-text-secondary mt-1">{override.sop_summary}</p>}
                          <button
                            onClick={() => removeOverride(override.id)}
                            className="text-[10px] text-red-400 hover:text-red-300 mt-1"
                          >
                            Remove override
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {service ? (
                        <button
                          onClick={() => openOverrideEditor(service)}
                          className="text-[11px] px-2.5 py-1 border border-v-border rounded-md text-v-text-primary hover:bg-white/5"
                        >
                          {override ? 'Edit aircraft SOP' : 'Add aircraft SOP'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Aircraft-specific SOP editor dialog */}
      {editingOverrideFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !savingOverride && setEditingOverrideFor(null)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-v-surface border border-v-border rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-base font-semibold text-v-text-primary mb-1">
              Aircraft SOP for {editingOverrideFor.name}
            </h3>
            <p className="text-xs text-v-text-secondary mb-4">
              Tail {tailNumber}. This SOP shows alongside the service default on crew job detail and in briefing emails.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">SOP URL</label>
                <input
                  type="url"
                  value={overrideForm.sop_url}
                  onChange={e => setOverrideForm(f => ({ ...f, sop_url: e.target.value }))}
                  placeholder="https://docs.google.com/document/d/…"
                  className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Summary (optional)</label>
                <textarea
                  rows={2}
                  value={overrideForm.sop_summary}
                  onChange={e => setOverrideForm(f => ({ ...f, sop_summary: e.target.value }))}
                  placeholder="Why this aircraft needs a different procedure"
                  className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingOverrideFor(null)}
                disabled={savingOverride}
                className="px-4 py-2 text-sm text-v-text-secondary border border-v-border rounded hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={saveOverride}
                disabled={savingOverride}
                className="px-4 py-2 text-sm bg-v-gold text-v-charcoal rounded font-semibold disabled:opacity-50"
              >
                {savingOverride ? 'Saving…' : 'Save SOP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Before/After Gallery */}
      {data.photos.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider mb-4">Before & After Gallery</h2>
          {Object.entries(photosByJob).map(([jobId, photos]) => {
            const job = data.jobs.find(j => j.id === jobId);
            if (!photos.before.length && !photos.after.length) return null;
            return (
              <div key={jobId} className="mb-6">
                <p className="text-xs text-v-text-secondary mb-2">
                  {job?.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : ''} &middot; {job?.services?.map(s => s.service_name).join(', ') || 'Detail'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {photos.before.slice(0, 4).map((b, i) => {
                    const a = photos.after[i];
                    return (
                      <div key={b.id} className="grid grid-cols-2 gap-1 col-span-2 sm:col-span-1">
                        <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-v-charcoal">
                          <img src={b.url} alt="Before" className="w-full h-full object-cover" />
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] bg-black/60 text-white rounded">BEFORE</span>
                        </div>
                        {a ? (
                          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-v-charcoal">
                            <img src={a.url} alt="After" className="w-full h-full object-cover" />
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] bg-green-600/80 text-white rounded">AFTER</span>
                          </div>
                        ) : <div className="aspect-[4/3] rounded-lg bg-v-charcoal flex items-center justify-center text-v-text-secondary text-xs">No after photo</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Service History Timeline */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider mb-4">Service History</h2>
        <div className="space-y-3">
          {data.jobs.map(job => {
            const statusColor = job.status === 'completed' ? 'bg-green-500' : job.status === 'in_progress' ? 'bg-yellow-500' : 'bg-blue-500';
            return (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="flex items-center gap-4 bg-v-surface border border-v-border rounded-lg p-4 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${statusColor} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-v-text-primary font-medium">
                    {job.services?.map(s => s.service_name).join(', ') || 'Detail Service'}
                  </p>
                  <p className="text-xs text-v-text-secondary">
                    {job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : new Date(job.created_at).toLocaleDateString()}
                    {job.completed_at && ` — Completed ${new Date(job.completed_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-v-gold font-medium">{currencySymbol()}{formatPrice(job.total_price)}</p>
                  <p className="text-xs text-v-text-secondary capitalize">{(job.status || '').replace('_', ' ')}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
