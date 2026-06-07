"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';

// Canonical pipeline — matches the intake_leads CHECK constraint
// (new, reviewed, quoted, won, lost, archived). Badge shape mirrors
// Quotes/Jobs (px-2.5 py-0.5 text-[10px] uppercase tracking-wider).
const STATUS_STYLES = {
  new:      { label: 'New',      cls: 'border border-blue-500/30 text-blue-400' },
  reviewed: { label: 'Reviewed', cls: 'border border-amber-500/30 text-amber-400' },
  quoted:   { label: 'Quoted',   cls: 'border border-purple-500/30 text-purple-300' },
  won:      { label: 'Won',      cls: 'border border-emerald-500/30 text-emerald-400' },
  lost:     { label: 'Lost',     cls: 'border border-red-500/30 text-red-400' },
  archived: { label: 'Archived', cls: 'border border-gray-500/30 text-gray-400' },
};

const FILTER_TABS = [
  { key: 'open', label: 'Open' },          // 'new' + 'reviewed' (default)
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'archived', label: 'Archived' },
];

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export default function RequestsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind, ids, label, description }
  const [statusMenuOpen, setStatusMenuOpen] = useState(null); // lead.id

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetch('/api/lead-intake/leads', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { leads: [] })
      .then(d => setLeads(d.leads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router, token]);

  // ── Filtering + search
  const filteredLeads = useMemo(() => {
    let result = leads;
    if (filter === 'open') {
      result = result.filter(l => l.status === 'new' || l.status === 'reviewed');
    } else if (filter !== 'all') {
      result = result.filter(l => l.status === filter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(l => {
        return (
          (l.name || '').toLowerCase().includes(q)
          || (l.customer_name || '').toLowerCase().includes(q)
          || (l.email || '').toLowerCase().includes(q)
          || (l.aircraft_model || '').toLowerCase().includes(q)
          || (l.tail_number || '').toLowerCase().includes(q)
          || (l.airport || '').toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [leads, filter, search]);

  // ── Stats
  const stats = useMemo(() => {
    const newCount = leads.filter(l => l.status === 'new').length;
    const reviewedCount = leads.filter(l => l.status === 'reviewed').length;
    const lostCount = leads.filter(l => l.status === 'lost').length;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const quotedThisMonth = leads.filter(l => {
      if (l.status !== 'quoted') return false;
      if (!l.created_at) return false;
      try { return new Date(l.created_at) >= startOfMonth; } catch { return false; }
    }).length;
    return { newCount, reviewedCount, quotedThisMonth, lostCount };
  }, [leads]);

  const tabCounts = useMemo(() => {
    return {
      open: leads.filter(l => l.status === 'new' || l.status === 'reviewed').length,
      all: leads.length,
      new: leads.filter(l => l.status === 'new').length,
      reviewed: leads.filter(l => l.status === 'reviewed').length,
      quoted: leads.filter(l => l.status === 'quoted').length,
      won: leads.filter(l => l.status === 'won').length,
      lost: leads.filter(l => l.status === 'lost').length,
      archived: leads.filter(l => l.status === 'archived').length,
    };
  }, [leads]);

  // ── Selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (filteredLeads.length === 0) return;
    if (selectedIds.size === filteredLeads.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredLeads.map(l => l.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  // ── Status / delete actions
  const updateStatus = async (leadId, status) => {
    try {
      const res = await fetch('/api/lead-intake/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'update_status', lead_id: leadId, status }),
      });
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const deleteOne = async (leadId) => {
    try {
      const res = await fetch(`/api/lead-intake/leads?id=${encodeURIComponent(leadId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== leadId));
        setSelectedIds(prev => { const n = new Set(prev); n.delete(leadId); return n; });
      }
    } catch (err) {
      console.error('Failed to delete lead:', err);
    }
  };

  const bulkAction = async (kind) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkProcessing(true);
    try {
      if (kind === 'delete') {
        // Fire deletes in parallel (small N — 1–20 typical).
        const results = await Promise.allSettled(ids.map(id =>
          fetch(`/api/lead-intake/leads?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        ));
        const deletedSet = new Set();
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value.ok) deletedSet.add(ids[i]);
        });
        setLeads(prev => prev.filter(l => !deletedSet.has(l.id)));
      } else if (kind === 'archive' || kind === 'reviewed') {
        const status = kind === 'archive' ? 'archived' : 'reviewed';
        const results = await Promise.allSettled(ids.map(id =>
          fetch('/api/lead-intake/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'update_status', lead_id: id, status }),
          })
        ));
        const updatedSet = new Set();
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value.ok) updatedSet.add(ids[i]);
        });
        setLeads(prev => prev.map(l => updatedSet.has(l.id) ? { ...l, status } : l));
      }
      clearSelection();
    } finally {
      setBulkProcessing(false);
      setConfirm(null);
    }
  };

  // ── Create Quote: stash lead data + lead_id in quote_prefill, push to /quotes/new.
  // The quote builder reads quote_prefill on mount (commit f305335 wired this).
  // The post-create POST in /quotes/new will set the lead's status to 'quoted'
  // when leadContext.leadId is present — see app/quotes/new/page.jsx.
  const createQuoteFromLead = (lead) => {
    if (!lead) return;
    const prefill = {
      leadId: lead.id,
      name: lead.name || lead.customer_name || '',
      email: lead.email || lead.customer_email || '',
      phone: lead.phone || lead.customer_phone || '',
      aircraft: lead.aircraft_model || '',
      tail: lead.tail_number || '',
      airport: lead.airport || '',
      service: lead.services_requested || '',
      notes: lead.notes || '',
      photos: lead.photo_urls || [],
      intake_responses: lead.intake_responses || null,
      timestamp: Date.now(),
    };
    try { localStorage.setItem('quote_prefill', JSON.stringify(prefill)); } catch {}
    router.push('/quotes/new');
  };

  if (loading) return <LoadingSpinner message="Loading requests..." />;

  return (
    <AppShell title="Requests">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
          <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>
            REQUESTS
          </h1>
          <div className="relative w-full md:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requests..."
              className="w-full bg-transparent border border-[#1A2236] text-white placeholder-[#8A9BB0] text-sm pl-4 pr-4 py-2 focus:outline-none focus:border-v-gold/40 transition-colors"
            />
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'New', value: stats.newCount, color: 'text-blue-400' },
            { label: 'Reviewed', value: stats.reviewedCount, color: 'text-amber-400' },
            { label: 'Quoted this month', value: stats.quotedThisMonth, color: 'text-purple-300' },
            { label: 'Lost', value: stats.lostCount, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-v-surface border border-v-border-subtle rounded-lg p-4">
              <p className="text-v-text-secondary text-[10px] uppercase tracking-[0.15em]">{s.label}</p>
              <p className={`text-2xl font-light mt-1 font-data ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs — pill style matches Jobs/Invoices */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {FILTER_TABS.map(f => {
            const count = tabCounts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.key
                    ? 'bg-v-gold text-v-charcoal'
                    : 'bg-v-surface text-v-text-secondary border border-v-border hover:text-v-text-primary hover:border-v-gold/50'
                }`}
              >
                {f.label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Bulk toolbar — Gmail-style, mirrors Quotes */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2.5 mb-3 bg-v-surface border border-v-border rounded-md flex items-center gap-4 flex-wrap">
            <span className="text-white text-sm font-medium">{selectedIds.size} selected</span>
            <button onClick={clearSelection} className="text-v-text-secondary hover:text-white text-xs uppercase tracking-wider transition-colors">Clear</button>
            <div className="w-px h-4 bg-[#2A3A50]" />
            <button
              onClick={() => setConfirm({ kind: 'reviewed', ids: Array.from(selectedIds), label: `Mark ${selectedIds.size} request(s) as reviewed?`, description: 'Status changes to "reviewed" — they move out of the New tab.' })}
              disabled={bulkProcessing}
              className="text-v-text-secondary hover:text-white text-xs uppercase tracking-wider transition-colors disabled:opacity-40"
            >
              Mark Reviewed
            </button>
            <button
              onClick={() => setConfirm({ kind: 'archive', ids: Array.from(selectedIds), label: `Archive ${selectedIds.size} request(s)?`, description: 'Status changes to "archived" — they hide from the default view.' })}
              disabled={bulkProcessing}
              className="text-v-text-secondary hover:text-white text-xs uppercase tracking-wider transition-colors disabled:opacity-40"
            >
              Archive
            </button>
            <button
              onClick={() => setConfirm({ kind: 'delete', ids: Array.from(selectedIds), label: `Delete ${selectedIds.size} request(s)?`, description: 'This cannot be undone.' })}
              disabled={bulkProcessing}
              className="text-red-400/70 hover:text-red-400 text-xs uppercase tracking-wider transition-colors disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        )}

        {/* Empty state */}
        {filteredLeads.length === 0 ? (
          <div className="bg-v-surface border border-v-border rounded-sm p-12 text-center">
            <p className="text-v-text-secondary text-sm mb-2">
              {search
                ? 'No requests match your search.'
                : filter === 'all' || filter === 'open'
                ? 'No quote requests yet.'
                : `No ${filter} requests.`}
            </p>
            {!search && (
              <p className="text-xs mt-2 text-v-text-secondary/60">
                Requests from your website widget and direct links will appear here.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Mobile card layout */}
            <div className="sm:hidden space-y-2">
              {filteredLeads.map(lead => {
                const style = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
                const isSelected = selectedIds.has(lead.id);
                return (
                  <div key={lead.id}
                    className={`bg-v-surface border ${isSelected ? 'border-v-gold/40' : 'border-v-border'} rounded-sm p-4`}>
                    <div className="flex items-start justify-between mb-2 gap-3">
                      <label className="flex items-start gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id)}
                          className="w-3.5 h-3.5 mt-0.5 rounded-sm border-v-border bg-transparent accent-v-gold cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{lead.name || lead.customer_name || 'Customer'}</p>
                          <p className="text-v-text-secondary text-xs truncate">
                            {lead.aircraft_model || 'Aircraft not specified'}
                            {lead.tail_number ? ` · ${lead.tail_number}` : ''}
                            {lead.airport ? ` · ${lead.airport}` : ''}
                          </p>
                        </div>
                      </label>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className={`px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${style.cls}`}>{style.label}</span>
                        <div className="flex items-center gap-1">
                          {lead.draft_quote_id && lead.status === 'reviewed' && (
                            <span className="text-[9px] uppercase tracking-wider text-v-gold/80 border border-v-gold/20 px-1.5 py-px rounded-sm">Draft</span>
                          )}
                          {Array.isArray(lead.photo_urls) && lead.photo_urls.length > 0 && (
                            <span className="text-[9px] uppercase tracking-wider text-v-text-secondary border border-v-border px-1.5 py-px rounded-sm">
                              {lead.photo_urls.length}&nbsp;photo{lead.photo_urls.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-v-text-secondary text-xs">{formatDate(lead.created_at)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => createQuoteFromLead(lead)}
                          className="px-2 py-1 text-[10px] uppercase tracking-wider text-v-gold border border-v-gold/30 rounded hover:bg-v-gold/10"
                        >
                          Quote
                        </button>
                        <a href={`/requests/${lead.id}`}
                          className="px-2 py-1 text-[10px] uppercase tracking-wider text-v-text-secondary border border-v-border rounded hover:text-white">
                          View
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block bg-v-surface border border-v-border rounded-sm overflow-x-auto">
              {/* Header row */}
              <div className="grid grid-cols-[40px_1fr_1fr_180px_110px_90px_140px] min-w-[900px] px-6 py-3 border-b border-[#1A2236] text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && selectedIds.size === filteredLeads.length}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded-sm border-v-border bg-transparent accent-v-gold cursor-pointer"
                  />
                </div>
                <div>Customer</div>
                <div>Aircraft</div>
                <div>Services</div>
                <div className="text-center">Status</div>
                <div className="text-right">Date</div>
                <div></div>
              </div>

              {filteredLeads.map(lead => {
                const style = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
                const isSelected = selectedIds.has(lead.id);
                return (
                  <div
                    key={lead.id}
                    onClick={() => router.push(`/requests/${lead.id}`)}
                    className={`group grid grid-cols-[40px_1fr_1fr_180px_110px_90px_140px] min-w-[900px] px-6 items-center border-b border-[#1A2236] transition-colors cursor-pointer ${isSelected ? 'bg-v-gold/[0.04]' : 'hover:bg-white/[0.02]'}`}
                    style={{ height: '56px' }}
                  >
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(lead.id)}
                        className={`w-3.5 h-3.5 rounded-sm border-v-border bg-transparent accent-v-gold cursor-pointer transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      />
                    </div>
                    <div className="truncate pr-4">
                      <span className="text-white text-sm">{lead.name || lead.customer_name || 'Customer'}</span>
                      {lead.email && <span className="text-v-text-secondary text-xs ml-2 truncate">{lead.email}</span>}
                    </div>
                    <div className="truncate pr-4">
                      <span className="text-v-text-secondary text-sm">{lead.aircraft_model || '—'}</span>
                      {lead.tail_number && <span className="text-v-text-secondary/60 text-xs ml-2">{lead.tail_number}</span>}
                    </div>
                    <div className="truncate pr-4">
                      <span className="text-v-text-secondary text-sm" title={lead.services_requested || ''}>{lead.services_requested || '—'}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={() => setStatusMenuOpen(statusMenuOpen === lead.id ? null : lead.id)}
                          className={`px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${style.cls} hover:opacity-80 transition-opacity`}
                        >
                          {style.label}
                        </button>
                        {statusMenuOpen === lead.id && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-10 bg-v-surface border border-v-border rounded-md shadow-lg py-1 min-w-[120px]">
                            {Object.entries(STATUS_STYLES).map(([key, s]) => (
                              <button
                                key={key}
                                onClick={() => { updateStatus(lead.id, key); setStatusMenuOpen(null); }}
                                className="w-full text-left px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-white/5 text-v-text-secondary hover:text-white"
                              >
                                {s.label}
                                {lead.status === key && <span className="ml-2 text-v-gold">✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Sub-badges: draft-in-progress and photo count */}
                      <div className="flex items-center gap-1 mt-0.5">
                        {lead.draft_quote_id && lead.status === 'reviewed' && (
                          <span className="text-[9px] uppercase tracking-wider text-v-gold/80 border border-v-gold/20 px-1.5 py-px rounded-sm"
                            title="A draft quote is in progress for this lead">
                            Draft
                          </span>
                        )}
                        {Array.isArray(lead.photo_urls) && lead.photo_urls.length > 0 && (
                          <span className="text-[9px] uppercase tracking-wider text-v-text-secondary border border-v-border px-1.5 py-px rounded-sm">
                            {lead.photo_urls.length}&nbsp;photo{lead.photo_urls.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-v-text-secondary text-xs">{formatDate(lead.created_at)}</span>
                    </div>
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => createQuoteFromLead(lead)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[10px] uppercase tracking-wider text-v-gold border border-v-gold/30 rounded hover:bg-v-gold/10"
                      >
                        Quote
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: 'delete', ids: [lead.id], label: 'Delete this request?', description: 'This cannot be undone.' })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[10px] uppercase tracking-wider text-red-400/70 border border-red-500/30 rounded hover:bg-red-500/10 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="px-6 py-3 text-v-text-secondary text-xs">
                {filteredLeads.length} of {leads.length} requests{filter !== 'all' && ' (filtered)'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirm modal — single or bulk */}
      {confirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !bulkProcessing && setConfirm(null)}>
          <div className="bg-v-surface border border-v-border rounded-md max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">{confirm.label}</h3>
            {confirm.description && <p className="text-v-text-secondary text-sm mb-4">{confirm.description}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={bulkProcessing}
                className="px-3 py-1.5 text-xs uppercase tracking-wider text-v-text-secondary border border-v-border rounded hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (confirm.ids.length === 1 && confirm.kind === 'delete') {
                    setBulkProcessing(true);
                    await deleteOne(confirm.ids[0]);
                    setBulkProcessing(false);
                    setConfirm(null);
                  } else {
                    setSelectedIds(new Set(confirm.ids));
                    await bulkAction(confirm.kind);
                  }
                }}
                disabled={bulkProcessing}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded disabled:opacity-50 ${
                  confirm.kind === 'delete'
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-v-gold text-v-charcoal hover:bg-v-gold-dim'
                }`}
              >
                {bulkProcessing ? 'Working...' : (confirm.kind === 'delete' ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
