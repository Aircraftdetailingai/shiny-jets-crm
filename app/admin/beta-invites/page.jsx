"use client";

import { useState, useEffect, useCallback } from 'react';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Redemptions', href: '/admin/redemptions' },
  { label: 'Aircraft', href: '/admin/aircraft' },
  { label: 'Vendors', href: '/admin/vendors' },
  { label: 'Beta Invites', href: '/admin/beta-invites' },
];

const STATUS_BADGE = {
  pending: 'bg-v-gold/20 text-v-gold border-v-gold/30',
  used: 'bg-green-500/20 text-green-400 border-green-500/30',
  revoked: 'bg-red-500/20 text-red-400 border-red-500/30',
  new: 'bg-v-text-secondary/20 text-v-text-secondary border-v-border',
  invited: 'bg-v-gold/20 text-v-gold border-v-gold/30',
  signed_up: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BetaInvitesPage() {
  const [activeTab, setActiveTab] = useState('invites');

  return (
    <div className="min-h-screen bg-v-charcoal">
      {/* Nav */}
      <nav className="bg-v-surface border-b border-v-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="text-v-text-secondary hover:text-v-text-primary text-sm">&larr; App</a>
            <span className="font-heading text-v-text-primary">Admin</span>
            {ADMIN_NAV.map(nav => (
              <a
                key={nav.href}
                href={nav.href}
                className={`text-sm ${nav.href === '/admin/beta-invites' ? 'text-v-gold font-medium' : 'text-v-text-secondary hover:text-v-text-primary'}`}
              >
                {nav.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Title */}
        <h1 className="text-2xl font-heading text-v-text-primary section-heading mb-8">Beta Invites & Prospects</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {[{ key: 'invites', label: 'Invites' }, { key: 'prospects', label: 'Prospects' }].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium rounded-sm transition-colors ${
                activeTab === tab.key
                  ? 'bg-v-gold text-v-charcoal'
                  : 'bg-v-surface text-v-text-secondary hover:text-v-text-primary border border-v-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'invites' ? <InvitesTab /> : <ProspectsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   INVITES TAB
   ═══════════════════════════════════════════ */
function InvitesTab() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', plan: 'pro', duration_days: 30, note: '' });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : '';

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/beta-invites', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setInvites(data.invites || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return;
    setSending(true);
    setMessage('');

    try {
      const res = await fetch('/api/admin/beta-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${data.error}`);
        return;
      }
      setMessage(data.emailSent ? `Invite sent to ${form.email}` : `Invite created (email may have failed)`);
      setForm({ email: '', plan: 'pro', duration_days: 30, note: '' });
      fetchInvites();
    } catch {
      setMessage('Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id) => {
    try {
      await fetch('/api/admin/beta-invites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      fetchInvites();
    } catch {}
  };

  const stats = {
    total: invites.length,
    pending: invites.filter(i => i.status === 'pending').length,
    used: invites.filter(i => i.status === 'used').length,
    rate: invites.length > 0 ? Math.round((invites.filter(i => i.status === 'used').length / invites.length) * 100) : 0,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Invites', value: stats.total },
          { label: 'Pending', value: stats.pending },
          { label: 'Used', value: stats.used },
          { label: 'Conversion', value: `${stats.rate}%` },
        ].map(s => (
          <div key={s.label} className="bg-v-surface border border-v-border rounded-sm p-5 border-l-2 border-l-v-gold">
            <p className="text-xs text-v-text-secondary uppercase tracking-widest">{s.label}</p>
            <p className="text-3xl font-mono text-v-text-primary mt-2 tracking-wide">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Invite Form */}
      <form onSubmit={handleSend} className="bg-v-surface border border-v-border rounded-sm p-6">
        <h3 className="text-sm font-heading text-v-text-primary mb-4 uppercase tracking-widest">Send New Invite</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs text-v-text-secondary mb-1">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              required
              placeholder="prospect@email.com"
              className="w-full bg-v-surface-light border border-v-border rounded-sm px-3 py-2.5 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
            />
          </div>
          <div>
            <label className="block text-xs text-v-text-secondary mb-1">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm(f => ({ ...f, plan: e.target.value }))}
              className="w-full bg-v-surface-light border border-v-border rounded-sm px-3 py-2.5 text-sm text-v-text-primary outline-none focus:border-v-gold/50"
            >
              <option value="pro">Pro</option>
              <option value="business">Business</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-v-text-secondary mb-1">Duration</label>
            <select
              value={form.duration_days}
              onChange={(e) => setForm(f => ({ ...f, duration_days: Number(e.target.value) }))}
              className="w-full bg-v-surface-light border border-v-border rounded-sm px-3 py-2.5 text-sm text-v-text-primary outline-none focus:border-v-gold/50"
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-v-text-secondary mb-1">Note (optional)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Personal message..."
              className="w-full bg-v-surface-light border border-v-border rounded-sm px-3 py-2.5 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4">
          <button
            type="submit"
            disabled={sending}
            className="px-6 py-2.5 bg-v-gold text-v-charcoal rounded-sm font-medium text-sm hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending...' : 'Send Invite'}
          </button>
          {message && (
            <p className={`text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{message}</p>
          )}
        </div>
      </form>

      {/* Invites Table */}
      <div className="bg-v-surface rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-v-border/30">
              <th className="text-left px-5 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Email</th>
              <th className="text-left px-5 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Plan</th>
              <th className="text-left px-5 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Duration</th>
              <th className="text-left px-5 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Status</th>
              <th className="text-left px-5 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Sent</th>
              <th className="text-left px-5 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Used</th>
              <th className="text-right px-5 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-v-border/20">
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-v-text-secondary">Loading...</td></tr>
            ) : invites.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-v-text-secondary">No invites yet. Send your first one above.</td></tr>
            ) : invites.map(inv => (
              <tr key={inv.id} className="hover:bg-v-surface-light transition-colors">
                <td className="px-5 py-4 text-v-text-primary">{inv.email}</td>
                <td className="px-5 py-4">
                  <span className="text-v-gold capitalize font-medium">{inv.plan}</span>
                </td>
                <td className="px-5 py-4 text-v-text-secondary font-mono">{inv.duration_days}d</td>
                <td className="px-5 py-4">
                  <span className={`px-2.5 py-1 rounded-sm text-xs font-medium border capitalize ${STATUS_BADGE[inv.status] || ''}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-v-text-secondary text-xs">{formatDate(inv.created_at)}</td>
                <td className="px-5 py-4 text-v-text-secondary text-xs">{formatDate(inv.used_at)}</td>
                <td className="px-5 py-4 text-right">
                  {inv.status === 'pending' && (
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="text-xs text-red-400 hover:text-red-300 font-medium"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PROSPECTS TAB
   ═══════════════════════════════════════════ */
function ProspectsTab() {
  const [prospects, setProspects] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({});
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [enriching, setEnriching] = useState(false);

  // Filters
  const [filterState, setFilterState] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Bulk selection
  const [selected, setSelected] = useState(new Set());
  const [bulkPlan, setBulkPlan] = useState('pro');
  const [bulkDuration, setBulkDuration] = useState(30);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : '';

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterState) params.set('state', filterState);
      if (filterStatus) params.set('status', filterStatus);
      if (search.length >= 2) params.set('search', search);
      params.set('limit', '200');

      const res = await fetch(`/api/admin/prospects?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProspects(data.prospects || []);
      setTotal(data.total || 0);
      setStats(data.stats || {});
      setStates(data.states || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [token, filterState, filterStatus, search]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  const handleImport = async () => {
    setImporting(true);
    setImportMsg('Fetching FAA data... this may take a minute.');
    try {
      const res = await fetch('/api/admin/prospects/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(`Error: ${data.error}`);
      } else {
        setImportMsg(`Imported ${data.imported} airports`);
        fetchProspects();
      }
    } catch {
      setImportMsg('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleEnrich = async (prospectIds) => {
    setEnriching(true);
    try {
      const res = await fetch('/api/admin/prospects/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prospect_ids: prospectIds }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchProspects();
      }
    } catch {} finally {
      setEnriching(false);
    }
  };

  const handleBulkInvite = async () => {
    if (selected.size === 0) return;
    setBulkSending(true);
    setBulkMsg('');
    try {
      const res = await fetch('/api/admin/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prospect_ids: Array.from(selected),
          plan: bulkPlan,
          duration_days: bulkDuration,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBulkMsg(`Sent: ${data.results.sent}, Skipped: ${data.results.skipped}${data.results.errors?.length ? `, Errors: ${data.results.errors.length}` : ''}`);
        setSelected(new Set());
        fetchProspects();
      } else {
        setBulkMsg(`Error: ${data.error}`);
      }
    } catch {
      setBulkMsg('Bulk invite failed');
    } finally {
      setBulkSending(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === prospects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(prospects.map(p => p.id)));
    }
  };

  const conversionRate = stats.total > 0 ? Math.round(((stats.signed_up || 0) / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Prospects', value: stats.total || 0 },
          { label: 'Invited', value: stats.invited || 0 },
          { label: 'Signed Up', value: stats.signed_up || 0 },
          { label: 'Conversion', value: `${conversionRate}%` },
          { label: 'Top State', value: stats.top_state || '—' },
        ].map(s => (
          <div key={s.label} className="bg-v-surface border border-v-border rounded-sm p-5 border-l-2 border-l-v-gold">
            <p className="text-xs text-v-text-secondary uppercase tracking-widest">{s.label}</p>
            <p className="text-3xl font-mono text-v-text-primary mt-2 tracking-wide">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-5 py-2.5 bg-v-gold text-v-charcoal rounded-sm font-medium text-sm hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
        >
          {importing ? 'Importing...' : 'Import FAA Data'}
        </button>
        {importMsg && <p className={`text-sm ${importMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{importMsg}</p>}

        <div className="flex-1" />

        {/* Filters */}
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          className="bg-v-surface-light border border-v-border rounded-sm px-3 py-2 text-sm text-v-text-primary outline-none focus:border-v-gold/50"
        >
          <option value="">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-v-surface-light border border-v-border rounded-sm px-3 py-2 text-sm text-v-text-primary outline-none focus:border-v-gold/50"
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="invited">Invited</option>
          <option value="signed_up">Signed Up</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search airports..."
          className="bg-v-surface-light border border-v-border rounded-sm px-3 py-2 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 w-48"
        />
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="bg-v-surface border border-v-gold/30 rounded-sm p-4 flex flex-wrap items-center gap-4">
          <span className="text-sm text-v-text-primary font-medium">{selected.size} selected</span>

          <select
            value={bulkPlan}
            onChange={(e) => setBulkPlan(e.target.value)}
            className="bg-v-surface-light border border-v-border rounded-sm px-3 py-2 text-sm text-v-text-primary outline-none"
          >
            <option value="pro">Pro</option>
            <option value="business">Business</option>
          </select>

          <select
            value={bulkDuration}
            onChange={(e) => setBulkDuration(Number(e.target.value))}
            className="bg-v-surface-light border border-v-border rounded-sm px-3 py-2 text-sm text-v-text-primary outline-none"
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>

          <button
            onClick={handleBulkInvite}
            disabled={bulkSending}
            className="px-5 py-2 bg-v-gold text-v-charcoal rounded-sm font-medium text-sm hover:bg-v-gold-dim disabled:opacity-50"
          >
            {bulkSending ? 'Sending...' : 'Send Invites'}
          </button>

          <button
            onClick={() => handleEnrich(Array.from(selected))}
            disabled={enriching}
            className="px-5 py-2 border border-v-gold/30 text-v-text-primary rounded-sm text-sm hover:border-v-gold disabled:opacity-50"
          >
            {enriching ? 'Enriching...' : 'Enrich Selected'}
          </button>

          <button onClick={() => setSelected(new Set())} className="text-xs text-v-text-secondary hover:text-v-text-primary ml-auto">
            Clear Selection
          </button>

          {bulkMsg && <p className="text-sm text-green-400 w-full">{bulkMsg}</p>}
        </div>
      )}

      {/* Prospects Table */}
      <div className="bg-v-surface rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-v-border/30">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={prospects.length > 0 && selected.size === prospects.length}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded accent-v-gold"
                />
              </th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Airport</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">ICAO</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">City</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">State</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">FBO</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Email</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Phone</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Rwys</th>
              <th className="text-left px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Status</th>
              <th className="text-right px-4 py-3 text-xs text-v-text-secondary uppercase tracking-widest font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-v-border/20">
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-v-text-secondary">Loading prospects...</td></tr>
            ) : prospects.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-v-text-secondary">No prospects. Click &quot;Import FAA Data&quot; to get started.</td></tr>
            ) : prospects.map(p => (
              <tr key={p.id} className="hover:bg-v-surface-light transition-colors">
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="w-4 h-4 rounded accent-v-gold"
                  />
                </td>
                <td className="px-4 py-4 text-v-text-primary font-medium max-w-[200px] truncate">{p.airport_name || '—'}</td>
                <td className="px-4 py-4 text-v-text-secondary font-mono text-xs">{p.icao || p.faa_id || '—'}</td>
                <td className="px-4 py-4 text-v-text-secondary">{p.city || '—'}</td>
                <td className="px-4 py-4 text-v-text-secondary font-mono">{p.state || '—'}</td>
                <td className="px-4 py-4 text-v-text-secondary max-w-[160px] truncate">{p.fbo_name || '—'}</td>
                <td className="px-4 py-4 text-v-text-secondary text-xs max-w-[160px] truncate">{p.email || '—'}</td>
                <td className="px-4 py-4 text-v-text-secondary text-xs">{p.phone || '—'}</td>
                <td className="px-4 py-4 text-v-text-secondary font-mono text-center">{p.runway_count || '—'}</td>
                <td className="px-4 py-4">
                  <span className={`px-2.5 py-1 rounded-sm text-xs font-medium border capitalize ${STATUS_BADGE[p.status] || ''}`}>
                    {p.status === 'signed_up' ? 'signed up' : p.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  {p.status === 'new' && !p.email && (
                    <button
                      onClick={() => handleEnrich([p.id])}
                      disabled={enriching}
                      className="text-xs text-v-gold hover:text-v-gold-dim font-medium disabled:opacity-50"
                    >
                      Enrich
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        {total > 0 && (
          <div className="px-5 py-3 border-t border-v-border/30 text-xs text-v-text-secondary">
            Showing {prospects.length} of {total} prospects
          </div>
        )}
      </div>
    </div>
  );
}
