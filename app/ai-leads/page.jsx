"use client";
// AI Leads: visitors who asked the website AI chat bubble to have someone
// text them back. Kept separate from Requests. Spreadsheet-style table on
// desktop (sort, search, CSV), stacked cards on phones; a row opens the full
// chat transcript with Text back / Call / Convert to quote.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { aiLeadsToCsv, displayPhone, AI_STATUS_LABEL, AI_LEAD_STATUSES } from '@/lib/ai-chat';
import { hasFeature } from '@/lib/plans';

const STATUS_CLS = {
  new: 'border-sky-400/60 text-sky-200',
  contacted: 'border-amber-400/60 text-amber-200',
  converted: 'border-emerald-400/60 text-emerald-200',
};
const COLS = [
  ['created_at', 'Date / time'],
  ['name', 'Name'],
  ['phone', 'Phone'],
  ['question', 'Question asked'],
  ['status', 'Status'],
  ['page_url', 'Page'],
];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
const fmtPhone = displayPhone;
function pagePath(u) {
  try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, ''); } catch { return u || ''; }
}
function headers() {
  return { Authorization: `Bearer ${localStorage.getItem('vector_token')}`, 'Content-Type': 'application/json' };
}

function StatusChip({ status }) {
  return <span className={`inline-flex items-center px-2 py-0.5 border text-[11px] font-semibold uppercase tracking-wider ${STATUS_CLS[status] || ''}`}>{AI_STATUS_LABEL[status] || status}</span>;
}

export default function AiLeadsPage() {
  return <AppShell title="AI Leads"><Suspense fallback={null}><AiLeads /></Suspense></AppShell>;
}

function AiLeads() {
  const router = useRouter();
  const search = useSearchParams();
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [user, setUser] = useState(null);
  const openId = search.get('id');

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('vector_user') || 'null')); } catch {}
    fetch('/api/ai-leads', { headers: headers() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setLeads(d.leads || []))
      .catch(() => { setError('Could not load AI leads. Refresh to try again.'); setLeads([]); });
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = (leads || []).filter((l) => statusFilter === 'all' || l.status === statusFilter);
    if (term) list = list.filter((l) => [l.name, l.phone, fmtPhone(l.phone), l.question, l.page_url, AI_STATUS_LABEL[l.status]].some((v) => String(v || '').toLowerCase().includes(term)));
    const { key, dir } = sort;
    const order = { new: 0, contacted: 1, converted: 2 };
    return [...list].sort((a, b) => {
      const va = key === 'status' ? order[a.status] : String(a[key] || '').toLowerCase();
      const vb = key === 'status' ? order[b.status] : String(b[key] || '').toLowerCase();
      return (va < vb ? -1 : va > vb ? 1 : 0) * (dir === 'asc' ? 1 : -1);
    });
  }, [leads, q, statusFilter, sort]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'created_at' ? 'desc' : 'asc' }));
  const open = (id) => router.push(`/ai-leads?id=${id}`, { scroll: false });
  const close = () => router.push('/ai-leads', { scroll: false });

  const exportCsv = () => {
    const blob = new Blob([aiLeadsToCsv(shown)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const onUpdated = useCallback((lead) => setLeads((list) => (list || []).map((l) => (l.id === lead.id ? lead : l))), []);
  const counts = useMemo(() => Object.fromEntries(AI_LEAD_STATUSES.map((s) => [s, (leads || []).filter((l) => l.status === s).length])), [leads]);
  const eligible = user ? hasFeature(user, 'aiChatWidget', { isAdmin: !!user.is_admin }) : true;
  const selected = openId ? (leads || []).find((l) => l.id === openId) : null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl text-v-text-primary font-semibold md:hidden">AI Leads</h2>
          <p className="text-sm text-v-text-secondary max-w-2xl">Website visitors who asked your AI chat bubble to have someone text them back. Separate from Requests. <Link href="/settings/ai-chat" className="underline text-v-text-primary">Chat settings &amp; FAQs</Link></p>
        </div>
        <button type="button" onClick={exportCsv} disabled={!shown.length} className="inline-flex items-center justify-center min-h-[44px] px-4 border border-v-border text-v-text-primary text-xs font-semibold uppercase tracking-wider hover:bg-white/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Export CSV
        </button>
      </div>

      {!eligible && (
        <div className="mb-4 border border-v-gold/40 bg-v-gold/10 p-4 text-sm text-v-text-primary">The AI chat bubble and AI Leads are included with <strong>Business</strong>. <Link href="/upgrade?plan=business" className="underline font-semibold">Upgrade to Business</Link></div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <label htmlFor="ai-leads-search" className="sr-only">Search AI leads</label>
        <input id="ai-leads-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, question or page"
          className="flex-1 min-h-[44px] bg-v-surface border border-v-border px-3 text-sm text-v-text-primary placeholder:text-v-text-secondary outline-none focus:border-v-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" />
        <label htmlFor="ai-leads-status" className="sr-only">Filter by status</label>
        <select id="ai-leads-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ colorScheme: 'dark' }}
          className="min-h-[44px] bg-v-surface border border-v-border px-3 text-sm text-v-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <option value="all">All statuses ({(leads || []).length})</option>
          {AI_LEAD_STATUSES.map((s) => <option key={s} value={s}>{AI_STATUS_LABEL[s]} ({counts[s] || 0})</option>)}
        </select>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{leads ? `${shown.length} AI lead${shown.length === 1 ? '' : 's'} shown` : ''}</p>
      {error && <p role="alert" className="text-sm text-amber-300 mb-3">{error}</p>}
      {!leads && <p className="text-sm text-v-text-secondary" role="status">Loading…</p>}
      {leads && !leads.length && !error && (
        <div className="border border-v-border bg-v-surface p-6 text-sm text-v-text-secondary">
          No AI leads yet. When a visitor asks your website chat to have someone text them, they’ll show up here and you’ll get an email and a notification.
        </div>
      )}
      {leads && leads.length > 0 && !shown.length && <p className="text-sm text-v-text-secondary">No AI leads match your search.</p>}

      {/* Desktop / tablet: spreadsheet table */}
      {shown.length > 0 && (
        <div className="hidden md:block border border-v-border overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">AI leads. Column headers sort the table; select a name to open the chat.</caption>
            <thead className="bg-v-surface">
              <tr>
                {COLS.map(([key, label]) => (
                  <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="text-left font-semibold text-v-text-secondary border-b border-v-border p-0">
                    <button type="button" onClick={() => toggleSort(key)} className="w-full text-left px-3 py-2.5 min-h-[44px] flex items-center gap-1 text-xs uppercase tracking-wider hover:text-v-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white">
                      {label}
                      <span aria-hidden="true" className="text-[10px]">{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} onClick={() => open(l.id)} className={`border-b border-v-border/60 cursor-pointer hover:bg-white/5 ${l.status === 'new' ? 'bg-sky-400/[0.04]' : ''}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-v-text-secondary">{fmtDate(l.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); open(l.id); }} className="text-left font-medium text-v-text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{l.name || 'Visitor'}</button>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-v-text-primary">{fmtPhone(l.phone)}</td>
                  <td className="px-3 py-2.5 text-v-text-primary max-w-[420px]"><span className="line-clamp-2">{l.question}</span></td>
                  <td className="px-3 py-2.5"><StatusChip status={l.status} /></td>
                  <td className="px-3 py-2.5 text-v-text-secondary max-w-[220px] truncate" title={l.page_url}>{pagePath(l.page_url) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone: stacked cards */}
      {shown.length > 0 && (
        <div className="md:hidden">
          <label htmlFor="ai-leads-sort" className="block text-xs text-v-text-secondary mb-1">Sort by</label>
          <select id="ai-leads-sort" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir }); }} style={{ colorScheme: 'dark' }}
            className="w-full min-h-[44px] mb-3 bg-v-surface border border-v-border px-3 text-sm text-v-text-primary">
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="name:asc">Name A–Z</option>
            <option value="status:asc">Status (New first)</option>
          </select>
          <ul className="space-y-3">
            {shown.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => open(l.id)} className={`w-full text-left border border-v-border bg-v-surface p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${l.status === 'new' ? 'border-l-4 border-l-sky-400' : ''}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-v-text-primary text-base">{l.name || 'Visitor'}</span>
                    <StatusChip status={l.status} />
                  </span>
                  <span className="block text-sm text-v-text-primary mt-1">{fmtPhone(l.phone)}</span>
                  <span className="block text-sm text-v-text-primary mt-2 line-clamp-2">“{l.question}”</span>
                  <span className="block text-xs text-v-text-secondary mt-2">{fmtDate(l.created_at)}{l.page_url ? ` · ${pagePath(l.page_url)}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openId && <LeadDrawer lead={selected} loading={!leads} onClose={close} onUpdated={onUpdated} />}
    </div>
  );
}

function LeadDrawer({ lead, loading, onClose, onUpdated }) {
  const ref = useRef(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('a[href],button:not([disabled]),select,[tabindex="0"]');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); try { prev?.focus?.(); } catch {} };
  }, [onClose]);

  const setStatus = async (status) => {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/ai-leads', { method: 'PATCH', headers: headers(), body: JSON.stringify({ id: lead.id, status }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error || 'Could not update.'); return null; }
      onUpdated(d.lead); setMsg(`Marked ${AI_STATUS_LABEL[status]}.`);
      return d.lead;
    } finally { setSaving(false); }
  };

  const convert = async () => {
    const transcript = (lead.transcript || []).map((m) => `${m.role === 'user' ? 'Visitor' : 'Chat'}: ${m.content}`).join('\n');
    localStorage.setItem('quote_prefill', JSON.stringify({
      name: lead.name || '', email: '', phone: lead.phone || '',
      notes: `From AI chat lead (${fmtDate(lead.created_at)}).\nQuestion: ${lead.question}${lead.page_url ? `\nPage: ${lead.page_url}` : ''}${transcript ? `\n\nChat:\n${transcript}` : ''}`.slice(0, 4000),
      timestamp: Date.now(),
    }));
    await setStatus('converted');
    window.location.href = '/quotes/new';
  };

  const smsBody = encodeURIComponent(`Hi ${String(lead?.name || '').split(' ')[0]}, thanks for your question on our website. `);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="lead-title" className="relative w-full sm:max-w-lg h-full overflow-y-auto bg-v-charcoal border-l border-v-border outline-none">
        <div className="sticky top-0 bg-v-charcoal border-b border-v-border px-4 py-3 flex items-center justify-between gap-2">
          <h2 id="lead-title" className="text-base font-semibold text-v-text-primary truncate">{lead ? (lead.name || 'Visitor') : 'AI lead'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 flex items-center justify-center text-2xl text-v-text-secondary hover:text-v-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><span aria-hidden="true">×</span></button>
        </div>
        {!lead && <p className="p-4 text-sm text-v-text-secondary">{loading ? 'Loading…' : 'This AI lead was not found.'}</p>}
        {lead && (
          <div className="p-4 space-y-5">
            <section aria-label="Contact details" className="space-y-2">
              <div className="flex items-center gap-2"><StatusChip status={lead.status} /><span className="text-xs text-v-text-secondary">{fmtDate(lead.created_at)}</span></div>
              <p className="text-lg text-v-text-primary">{fmtPhone(lead.phone)}</p>
              <div className="grid grid-cols-2 gap-2">
                <a href={`sms:${lead.phone}?&body=${smsBody}`} onClick={() => { if (lead.status === 'new') setStatus('contacted'); }} className="inline-flex items-center justify-center min-h-[48px] bg-v-gold text-white text-sm font-semibold hover:bg-v-gold-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Text back</a>
                <a href={`tel:${lead.phone}`} className="inline-flex items-center justify-center min-h-[48px] border border-v-border text-v-text-primary text-sm font-semibold hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Call</a>
              </div>
              <p className="text-xs text-v-text-secondary">{lead.sms_consent ? `Agreed to texts${lead.consent_at ? ` on ${fmtDate(lead.consent_at)}` : ''}.` : 'No text consent recorded.'}{lead.consent_text ? ` “${lead.consent_text}”` : ''}</p>
              {lead.page_url && <p className="text-xs text-v-text-secondary break-all">Chatted from: <a href={lead.page_url} target="_blank" rel="noreferrer" className="underline text-v-text-primary">{pagePath(lead.page_url)}<span className="sr-only"> (opens in a new tab)</span></a></p>}
            </section>

            <section aria-labelledby="lead-q">
              <h3 id="lead-q" className="text-xs uppercase tracking-wider text-v-text-secondary mb-1">Question asked</h3>
              <p className="text-sm text-v-text-primary whitespace-pre-wrap">{lead.question}</p>
            </section>

            <section aria-labelledby="lead-status">
              <label id="lead-status" htmlFor="lead-status-select" className="block text-xs uppercase tracking-wider text-v-text-secondary mb-1">Status</label>
              <div className="flex flex-wrap gap-2">
                <select id="lead-status-select" value={lead.status} disabled={saving} onChange={(e) => setStatus(e.target.value)} style={{ colorScheme: 'dark' }}
                  className="min-h-[44px] bg-v-surface border border-v-border px-3 text-sm text-v-text-primary">
                  {AI_LEAD_STATUSES.map((s) => <option key={s} value={s}>{AI_STATUS_LABEL[s]}</option>)}
                </select>
                <button type="button" onClick={convert} disabled={saving} className="inline-flex items-center justify-center min-h-[44px] px-4 border border-v-gold text-v-text-primary text-sm font-semibold hover:bg-v-gold/15 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Convert to quote</button>
              </div>
              <p role="status" aria-live="polite" className="text-xs text-v-text-secondary mt-1">{msg}</p>
            </section>

            <section aria-labelledby="lead-chat">
              <h3 id="lead-chat" className="text-xs uppercase tracking-wider text-v-text-secondary mb-2">Full chat</h3>
              {(lead.transcript || []).length === 0 && <p className="text-sm text-v-text-secondary">No chat messages were saved.</p>}
              <ol className="space-y-2">
                {(lead.transcript || []).map((m, i) => (
                  <li key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-v-gold text-white' : 'bg-v-surface border border-v-border text-v-text-primary'}`}>
                      <span className="block text-[11px] font-semibold uppercase tracking-wider mb-0.5">{m.role === 'user' ? 'Visitor' : 'Chat'}</span>
                      {m.content}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
