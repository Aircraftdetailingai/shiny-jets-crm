"use client";
// Settings → AI Chat & FAQs: "Import from your FAQ page" (review before
// saving) and "Linked FAQ pages" (Keep in sync + change review).
// Nothing found on a page reaches the chat bubble until the detailer saves
// it into their FAQ list.
import { useRef, useState } from 'react';
import { MAX_FAQS } from '@/lib/ai-chat';
import { faqKey, shortUrl, METHOD_LABEL, MAX_IMPORT_URLS } from '@/lib/faq-import';

const btnPrimary = 'inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-v-gold text-white text-xs font-semibold uppercase tracking-wider hover:bg-v-gold-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const btnSecondary = 'inline-flex items-center justify-center min-h-[44px] px-3 py-2 border border-v-border text-v-text-primary text-xs font-semibold uppercase tracking-wider hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const input = 'w-full bg-v-charcoal border border-v-border px-3 py-2 min-h-[44px] text-sm text-v-text-primary placeholder:text-v-text-secondary outline-none focus:border-v-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

function authHeaders() {
  const t = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : '';
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ── Import + review ───────────────────────────────────────────────────────
export function FaqImportPanel({ eligible, faqCount, usingStarters, onAdd }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [results, setResults] = useState(null);
  const [items, setItems] = useState([]);
  const [sync, setSync] = useState({});
  const [adding, setAdding] = useState(false);
  const reviewRef = useRef(null);

  const find = async () => {
    setError(''); setNote(''); setBusy(true);
    try {
      const res = await fetch('/api/ai-chat/faq-import', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ urls: text }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Could not read those pages.'); if (d.field === 'urls') document.getElementById('faq-import-urls')?.focus(); return; }
      setResults(d.results || []);
      setItems((d.pairs || []).map((p) => ({ ...p, include: !p.duplicateOf })));
      setSync({});
      const found = (d.pairs || []).length;
      const dups = (d.pairs || []).filter((p) => p.duplicateOf).length;
      const extra = [d.invalid?.length ? `${plural(d.invalid.length, 'link')} skipped (not a web page).` : '', d.tooMany ? `Only the first ${d.maxUrls || MAX_IMPORT_URLS} links were read.` : ''].filter(Boolean).join(' ');
      setNote(found ? `${plural(found, 'FAQ')} found${dups ? `, ${dups} already in your list` : ''}. Review them below, then add. ${extra}` : `No FAQs found. ${extra}`);
      if (found) setTimeout(() => reviewRef.current?.focus(), 50);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  const upd = (id, patch) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const selected = items.filter((x) => x.include);
  const base = usingStarters ? 0 : faqCount;
  const over = base + selected.length - MAX_FAQS;
  const okSources = (results || []).filter((r) => r.ok);

  const add = async () => {
    setError('');
    const bad = selected.find((x) => !x.question.trim() || !x.answer.trim());
    if (bad) { setError('Each FAQ you add needs a question and an answer.'); document.getElementById(`imp-${bad.id}-${bad.question.trim() ? 'a' : 'q'}`)?.focus(); return; }
    if (over > 0) { setError(`You can have up to ${MAX_FAQS} FAQs. Uncheck ${over} to continue.`); return; }
    setAdding(true);
    const usedUrls = new Set(selected.map((x) => x.source_url));
    const sourcesAdd = okSources.filter((r) => usedUrls.has(r.url)).map((r) => ({ url: r.url, keep_in_sync: !!sync[r.url], snapshot: r.snapshot, method: r.method }));
    const ok = await onAdd(selected.map((x) => ({ question: x.question.trim(), answer: x.answer.trim(), source_url: x.source_url })), sourcesAdd);
    setAdding(false);
    if (ok) { setItems([]); setResults(null); setText(''); setNote(''); setTimeout(() => document.getElementById('faqs')?.focus(), 100); }
  };

  return (
    <section aria-labelledby="faq-import-h" className="border border-v-border p-4 sm:p-5 bg-v-surface space-y-3">
      <h3 id="faq-import-h" className="text-sm font-semibold text-v-text-primary">Import from your FAQ page</h3>
      <p className="text-xs text-v-text-secondary">Already have FAQs on your website? Paste the link and we’ll pull out the questions and answers. Nothing is added until you review it, and the chat only ever answers from the FAQs you save.</p>
      {!eligible && (
        <p className="text-xs text-v-text-primary border border-v-gold/40 bg-v-gold/10 p-3">Importing from your website is included with <strong>Business</strong>. <a href="/upgrade?plan=business" className="underline font-semibold">Upgrade to Business</a></p>
      )}
      <div>
        <label htmlFor="faq-import-urls" className="block text-xs text-v-text-secondary mb-1">Links to your FAQ page (one per line, up to {MAX_IMPORT_URLS})</label>
        <textarea id="faq-import-urls" rows={2} className={`${input} resize-y`} value={text} onChange={(e) => setText(e.target.value)} disabled={!eligible}
          placeholder="https://yourshop.com/faq" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" aria-describedby="faq-import-help" />
        <p id="faq-import-help" className="text-xs text-v-text-secondary mt-1">We read only the pages you paste: questions and answers are copied from the page, never written for you.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={find} disabled={!eligible || busy || !text.trim()} className={btnPrimary} aria-describedby="faq-import-status">{busy ? 'Reading pages…' : 'Find FAQs'}</button>
        <p id="faq-import-status" role="status" aria-live="polite" className="text-xs text-v-text-secondary">{busy ? 'Reading your pages. This can take a few seconds.' : note}</p>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}

      {results && results.length > 0 && (
        <ul className="space-y-2" aria-label="Pages read">
          {results.map((r) => (
            <li key={r.url} className="border border-v-border bg-v-charcoal/40 p-3 text-xs">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span aria-hidden="true" className={r.ok ? 'text-emerald-300' : 'text-amber-300'}>{r.ok ? '✓' : '!'}</span>
                <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-v-text-primary underline break-all">{shortUrl(r.url)}<span className="sr-only"> (opens in a new tab)</span></a>
                <span className="text-v-text-secondary">{r.ok ? `${plural(r.count, 'FAQ')} found · ${METHOD_LABEL[r.method] || ''}` : ''}</span>
              </div>
              {!r.ok && <p className="text-amber-200 mt-1">{r.error}</p>}
              {r.ok && (
                <label className="mt-2 flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-6 w-6 accent-[#007CB1]" checked={!!sync[r.url]} onChange={(e) => setSync((s) => ({ ...s, [r.url]: e.target.checked }))} />
                  <span><span className="text-v-text-primary font-medium">Keep in sync</span><span className="block text-v-text-secondary">Re-check this page weekly and flag changes for you to review. Your FAQs are never overwritten.</span></span>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 ref={reviewRef} tabIndex={-1} className="text-sm font-semibold text-v-text-primary focus:outline-none">Review before adding <span className="font-normal text-v-text-secondary">({selected.length} of {items.length} selected)</span></h4>
            <div className="flex gap-2">
              <button type="button" className={btnSecondary} onClick={() => setItems((l) => l.map((x) => ({ ...x, include: true })))}>Select all</button>
              <button type="button" className={btnSecondary} onClick={() => setItems((l) => l.map((x) => ({ ...x, include: false })))}>Select none</button>
            </div>
          </div>
          {usingStarters && <p className="text-xs text-v-text-primary bg-white/5 border border-v-border p-3">You haven’t saved FAQs yet, so the FAQs you add here replace the starter FAQs.</p>}
          <ol className="space-y-3">
            {items.map((x, i) => (
              <li key={x.id} className={`border p-3 ${x.include ? 'border-v-gold/60 bg-v-charcoal/40' : 'border-v-border bg-v-charcoal/20'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                    <input type="checkbox" className="h-6 w-6 accent-[#007CB1]" checked={x.include} onChange={(e) => upd(x.id, { include: e.target.checked })} aria-describedby={x.duplicateOf ? `imp-${x.id}-dup` : undefined} />
                    <span className="text-sm text-v-text-primary font-medium">Add<span className="sr-only"> FAQ {i + 1}: {x.question}</span></span>
                  </label>
                  <span className="text-xs text-v-text-secondary">{shortUrl(x.source_url)} · {METHOD_LABEL[x.method] || ''}</span>
                </div>
                {x.duplicateOf && <p id={`imp-${x.id}-dup`} className="text-xs text-amber-200 mb-2">Already in your FAQs as “{x.duplicateOf}”, so it’s unchecked.</p>}
                <label htmlFor={`imp-${x.id}-q`} className="block text-xs text-v-text-secondary mb-1">Question</label>
                <input id={`imp-${x.id}-q`} className={input} maxLength={300} value={x.question} onChange={(e) => upd(x.id, { question: e.target.value })} />
                <label htmlFor={`imp-${x.id}-a`} className="block text-xs text-v-text-secondary mt-2 mb-1">Answer</label>
                <textarea id={`imp-${x.id}-a`} rows={3} className={`${input} resize-y`} maxLength={1500} value={x.answer} onChange={(e) => upd(x.id, { answer: e.target.value })} />
              </li>
            ))}
          </ol>
          {over > 0 && <p className="text-xs text-amber-200">You can have up to {MAX_FAQS} FAQs. Uncheck {over} to continue.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={add} disabled={adding || !selected.length || over > 0} className={btnPrimary}>{adding ? 'Adding…' : `Add ${plural(selected.length, 'FAQ')}`}</button>
            <button type="button" onClick={() => { setItems([]); setResults(null); setNote('Import cancelled. Nothing was added.'); }} className={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Linked pages + change review ──────────────────────────────────────────
const TYPE_LABEL = { added: 'New on the page', changed: 'Answer changed on the page', removed: 'No longer on the page' };

export function LinkedFaqPages({ sources, eligible, faqs, onSources, saveFaqs }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  if (!sources?.length) return null;

  const call = async (body, label) => {
    setBusy(`${body.action}:${body.url}`); setErr(''); setMsg('');
    try {
      const res = await fetch('/api/ai-chat/faq-sources', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Could not update.'); return null; }
      onSources(d.sources || []);
      if (label) setMsg(typeof label === 'function' ? label(d) : label);
      return d;
    } catch { setErr('Could not reach the server.'); return null; } finally { setBusy(''); }
  };

  const savedIndex = (q) => faqs.findIndex((f) => faqKey(f.question) === faqKey(q));
  const apply = async (src, item, how) => {
    let next = null;
    const i = savedIndex(item.question);
    if (how === 'add') next = [...faqs, { question: item.question, answer: item.answer, source_url: src.url }];
    if (how === 'use') next = i >= 0 ? faqs.map((f, j) => (j === i ? { ...f, answer: item.answer, source_url: f.source_url || src.url } : f)) : [...faqs, { question: item.question, answer: item.answer, source_url: src.url }];
    if (how === 'delete' && i >= 0) next = faqs.filter((_, j) => j !== i);
    if (next) {
      if (next.length > MAX_FAQS) { setErr(`You can have up to ${MAX_FAQS} FAQs. Delete one first.`); return; }
      const ok = await saveFaqs(next);
      if (!ok) return;
    }
    await call({ action: 'resolve', url: src.url, keys: [item.key] }, how === 'keep' ? 'Kept your saved FAQ.' : 'FAQs updated and saved.');
  };

  return (
    <section id="faq-sources" aria-labelledby="faq-sources-h" className="border border-v-border p-4 sm:p-5 bg-v-surface space-y-3">
      <h3 id="faq-sources-h" className="text-sm font-semibold text-v-text-primary">Linked FAQ pages</h3>
      <p className="text-xs text-v-text-secondary">Pages your FAQs were imported from. With <strong className="text-v-text-primary">Keep in sync</strong> on, we re-check the page weekly and list any changes here for you to accept or ignore. The chat keeps using your saved FAQs until you do.</p>
      <p role="status" aria-live="polite" className="text-xs text-v-text-secondary min-h-[1em]">{busy.startsWith('check:') ? 'Checking the page…' : msg}</p>
      {err && <p role="alert" className="text-xs text-red-300">{err}</p>}
      <ul className="space-y-3">
        {sources.map((s) => (
          <li key={s.url} className="border border-v-border bg-v-charcoal/40 p-3 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-sm text-v-text-primary underline break-all">{shortUrl(s.url)}<span className="sr-only"> (opens in a new tab)</span></a>
              <span className="text-xs text-v-text-secondary">
                {s.last_checked_at ? `Checked ${fmtWhen(s.last_checked_at)}` : 'Not checked yet'}{s.count ? ` · ${plural(s.count, 'FAQ')} on the page` : ''}
              </span>
            </div>
            {s.last_status && s.last_status !== 'ok' && s.last_error && <p className="text-xs text-amber-200">{s.last_error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <label className={`flex items-center gap-2 min-h-[44px] pr-2 ${eligible || s.keep_in_sync ? 'cursor-pointer' : 'opacity-60'}`}>
                <input type="checkbox" className="h-6 w-6 accent-[#007CB1]" checked={s.keep_in_sync} disabled={!!busy || (!eligible && !s.keep_in_sync)}
                  onChange={(e) => call({ action: 'toggle', url: s.url, keep_in_sync: e.target.checked }, e.target.checked ? `Keep in sync is on for ${shortUrl(s.url)}.` : `Keep in sync is off for ${shortUrl(s.url)}.`)} />
                <span className="text-xs text-v-text-primary font-medium">Keep in sync (weekly)</span>
              </label>
              <button type="button" className={btnSecondary} disabled={!!busy || !eligible} onClick={() => call({ action: 'check', url: s.url }, (d) => (d.newItems ? `${plural(d.newItems, 'change')} found on ${shortUrl(s.url)}. Review them below.` : `No changes on ${shortUrl(s.url)}.`))}>
                Check now<span className="sr-only"> {shortUrl(s.url)}</span>
              </button>
              <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => call({ action: 'remove', url: s.url }, `${shortUrl(s.url)} unlinked. Your saved FAQs weren’t changed.`)}>
                Unlink<span className="sr-only"> {shortUrl(s.url)}</span>
              </button>
            </div>
            {s.pending?.length > 0 && (
              <div className="border-t border-v-border pt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-v-text-primary">{plural(s.pending.length, 'change')} to review</h4>
                  <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => call({ action: 'dismiss', url: s.url }, 'Changes dismissed. Your FAQs weren’t changed.')}>Dismiss all<span className="sr-only"> changes for {shortUrl(s.url)}</span></button>
                </div>
                <ul className="space-y-3">
                  {s.pending.map((p) => {
                    const i = savedIndex(p.question);
                    const saved = i >= 0 ? faqs[i] : null;
                    const same = saved && faqKey(saved.answer) === faqKey(p.answer);
                    const compare = saved && !same && (p.type === 'changed' || p.type === 'added');
                    return (
                      <li key={p.key} className="border border-v-border p-3 bg-v-surface">
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-v-text-secondary">{TYPE_LABEL[p.type]}</p>
                        <p className="text-sm text-v-text-primary font-medium mt-1">{p.question}</p>
                        {compare && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
                            <div><p className="text-v-text-secondary mb-0.5">Your saved answer</p><p className="text-v-text-primary whitespace-pre-line">{saved.answer}</p></div>
                            <div><p className="text-v-text-secondary mb-0.5">The page now says</p><p className="text-v-text-primary whitespace-pre-line">{p.answer}</p></div>
                          </div>
                        )}
                        {(p.type === 'added' || p.type === 'changed') && !saved && <p className="text-xs text-v-text-primary whitespace-pre-line mt-1">{p.answer}</p>}
                        {(p.type === 'added' || p.type === 'changed') && same && <p className="text-xs text-v-text-secondary mt-1">Your saved FAQ already says the same thing.</p>}
                        {p.type === 'removed' && <p className="text-xs text-v-text-secondary mt-1">{saved ? 'It’s still in your saved FAQs.' : 'It isn’t in your saved FAQs.'}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {p.type === 'added' && !saved && <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => apply(s, p, 'add')}>Add to my FAQs</button>}
                          {(compare || (p.type === 'changed' && !saved)) && <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => apply(s, p, 'use')}>Use the page’s answer</button>}
                          {p.type === 'removed' && saved && <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => apply(s, p, 'delete')}>Delete from my FAQs</button>}
                          <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => apply(s, p, 'keep')}>{same ? 'OK' : saved ? 'Keep mine' : 'Ignore'}</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
