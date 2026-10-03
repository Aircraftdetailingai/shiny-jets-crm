"use client";
// Settings → AI Chat & FAQs: turn the website AI chat bubble on/off, the
// phone number for chat handoffs, and the FAQ list the chat answers from.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const btnPrimary = 'inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-v-gold text-white text-xs font-semibold uppercase tracking-wider hover:bg-v-gold-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const btnSecondary = 'inline-flex items-center justify-center min-h-[44px] px-3 py-2 border border-v-border text-v-text-primary text-xs font-semibold uppercase tracking-wider hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const input = 'w-full bg-v-charcoal border border-v-border px-3 py-2 min-h-[44px] text-sm text-v-text-primary placeholder:text-v-text-secondary outline-none focus:border-v-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

function authHeaders() {
  const t = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : '';
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}

export default function AiChatSettingsPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState('');
  const [greeting, setGreeting] = useState('');
  const [faqs, setFaqs] = useState([]);
  const [usingStarters, setUsingStarters] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [slug, setSlug] = useState('');
  const listRef = useRef(null);

  const apply = (d) => {
    setData(d);
    setEnabled(!!d.settings?.enabled);
    setPhone(d.settings?.handoff_phone || '');
    setGreeting(d.settings?.greeting || '');
    if (!d.hasSavedFaqs || !d.faqs?.length) { setFaqs((d.starter || []).map((f) => ({ ...f }))); setUsingStarters(true); }
    else { setFaqs(d.faqs); setUsingStarters(false); }
  };

  useEffect(() => {
    try { const u = JSON.parse(localStorage.getItem('vector_user') || 'null'); setSlug(u?.slug || u?.id || ''); } catch {}
    fetch('/api/ai-chat/settings', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(apply)
      .catch(() => setLoadError('Could not load your chat settings. Refresh to try again.'));
    fetch('/api/detailers/me', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.slug || d?.id) setSlug(d.slug || d.id); }).catch(() => {});
  }, []);

  const update = (i, k, v) => setFaqs((list) => list.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const move = (i, d) => setFaqs((list) => {
    const j = i + d; if (j < 0 || j >= list.length) return list;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const remove = (i) => { setFaqs((list) => list.filter((_, j) => j !== i)); setStatus('FAQ removed. Save to keep the change.'); };
  const add = () => {
    setFaqs((list) => [...list, { question: '', answer: '' }]);
    setTimeout(() => { const els = listRef.current?.querySelectorAll('input[data-faq-q]'); els?.[els.length - 1]?.focus(); }, 0);
  };
  const addStarters = () => {
    const have = new Set(faqs.map((f) => f.question.trim().toLowerCase()));
    const extra = (data?.starter || []).filter((f) => !have.has(f.question.toLowerCase()));
    setFaqs((list) => [...list, ...extra.map((f) => ({ ...f }))]);
    setStatus(extra.length ? `${extra.length} starter FAQ${extra.length === 1 ? '' : 's'} added. Edit them, then save.` : 'All starter FAQs are already in your list.');
  };

  const save = async () => {
    setSaving(true); setError(''); setStatus('');
    const clean = faqs.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));
    const incomplete = clean.findIndex((f) => (f.question && !f.answer) || (!f.question && f.answer));
    if (incomplete >= 0) {
      setSaving(false);
      setError(`FAQ ${incomplete + 1} needs both a question and an answer.`);
      document.getElementById(`faq-${incomplete}-${clean[incomplete].question ? 'a' : 'q'}`)?.focus();
      return;
    }
    try {
      const body = { faqs: clean.filter((f) => f.question && f.answer), settings: { handoff_phone: phone, greeting } };
      if (data?.eligible) body.settings.enabled = enabled;
      const res = await fetch('/api/ai-chat/settings', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'Could not save.');
        if (d.field === 'handoff_phone') document.getElementById('handoff-phone')?.focus();
        return;
      }
      apply(d);
      setStatus('Saved.');
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <p className="text-sm text-amber-300" role="alert">{loadError}</p>;
  if (!data) return <p className="text-sm text-v-text-secondary" role="status">Loading…</p>;

  const eligible = data.eligible;
  return (
    <div className="space-y-6 max-w-3xl pb-24">
      <div>
        <h2 className="text-base font-semibold text-v-text-primary pb-2 border-b border-v-gold/40">AI Chat &amp; FAQs</h2>
        <p className="text-sm text-v-text-secondary mt-2">An AI chat bubble for your website that answers visitors’ questions <strong className="text-v-text-primary font-semibold">only from the FAQs below</strong>. When a question isn’t covered, it says so and offers <em>Request a quote</em> or <em>Have someone text you</em>. Those requests show up in <Link href="/ai-leads" className="underline text-v-text-primary">AI Leads</Link>.</p>
      </div>

      {!eligible && (
        <div className="border border-v-gold/40 bg-v-gold/10 p-4 text-sm text-v-text-primary">
          The AI chat bubble is included with <strong>Business</strong> ($89.95/mo or $899/yr). You can write your FAQs now; they also power your request form.{' '}
          <Link href="/upgrade?plan=business" className="underline font-semibold">Upgrade to Business</Link>
        </div>
      )}

      <section aria-labelledby="chat-on" className="border border-v-border p-4 sm:p-5 bg-v-surface space-y-4">
        <h3 id="chat-on" className="text-sm font-semibold text-v-text-primary">Chat bubble</h3>
        <label className={`flex items-start gap-3 ${eligible ? 'cursor-pointer' : 'opacity-60'}`}>
          <input type="checkbox" className="mt-0.5 h-6 w-6 accent-[#007CB1]" checked={enabled} disabled={!eligible} onChange={(e) => setEnabled(e.target.checked)} aria-describedby="chat-on-help" />
          <span>
            <span className="block text-sm text-v-text-primary font-medium">Turn on the AI chat bubble</span>
            <span id="chat-on-help" className="block text-xs text-v-text-secondary">Then copy the AI chat bubble code from <Link href="/settings/developer" className="underline">Share &amp; Embed</Link> onto your website.</span>
          </span>
        </label>
        <div>
          <label htmlFor="chat-greeting" className="block text-xs text-v-text-secondary mb-1">Greeting (optional)</label>
          <input id="chat-greeting" className={input} maxLength={300} value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="Hi! I can answer common questions about our detailing services." />
        </div>
        {enabled && slug && (
          <a href={`/chat-widget/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer" className={btnSecondary}>Try your chat<span className="sr-only"> (opens in a new tab)</span></a>
        )}
      </section>

      <section aria-labelledby="handoff" className="border border-v-border p-4 sm:p-5 bg-v-surface space-y-3">
        <h3 id="handoff" className="text-sm font-semibold text-v-text-primary">Chat handoffs</h3>
        <div>
          <label htmlFor="handoff-phone" className="block text-xs text-v-text-secondary mb-1">Phone number for chat handoffs</label>
          <input id="handoff-phone" type="tel" autoComplete="tel" inputMode="tel" className={`${input} max-w-xs`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={data.accountPhone || '555 123 4567'} aria-describedby="handoff-help" />
          <p id="handoff-help" className="text-xs text-v-text-secondary mt-1">
            When a visitor asks someone to text them, you get an email and a notification in the CRM right away.{' '}
            {data.twilio
              ? 'We’ll also text this number (or your account phone if it’s blank).'
              : 'Texting this number turns on once Twilio texting is connected for your account.'}
          </p>
        </div>
      </section>

      <section aria-labelledby="faqs" className="border border-v-border p-4 sm:p-5 bg-v-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 id="faqs" className="text-sm font-semibold text-v-text-primary">FAQs <span className="text-v-text-secondary font-normal">({faqs.length})</span></h3>
          <button type="button" onClick={addStarters} className={btnSecondary}>Add starter FAQs</button>
        </div>
        {usingStarters && (
          <p className="text-xs text-v-text-primary bg-white/5 border border-v-border p-3 mb-3">These are starter FAQs. Edit them to match your shop, delete any that don’t apply, then save.</p>
        )}
        <ol ref={listRef} className="space-y-4">
          {faqs.map((f, i) => (
            <li key={i} className="border border-v-border p-3 bg-v-charcoal/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-v-text-secondary">FAQ {i + 1}</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={btnSecondary} aria-label={`Move FAQ ${i + 1} up`}><span aria-hidden="true">↑</span></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === faqs.length - 1} className={btnSecondary} aria-label={`Move FAQ ${i + 1} down`}><span aria-hidden="true">↓</span></button>
                  <button type="button" onClick={() => remove(i)} className={`${btnSecondary} text-red-300`} aria-label={`Delete FAQ ${i + 1}`}>Delete</button>
                </div>
              </div>
              <label htmlFor={`faq-${i}-q`} className="block text-xs text-v-text-secondary mb-1">Question</label>
              <input id={`faq-${i}-q`} data-faq-q className={input} maxLength={300} value={f.question} onChange={(e) => update(i, 'question', e.target.value)} />
              <label htmlFor={`faq-${i}-a`} className="block text-xs text-v-text-secondary mt-2 mb-1">Answer</label>
              <textarea id={`faq-${i}-a`} rows={3} className={`${input} resize-y`} maxLength={1500} value={f.answer} onChange={(e) => update(i, 'answer', e.target.value)} />
            </li>
          ))}
        </ol>
        <button type="button" onClick={add} className={`${btnSecondary} mt-4`}>+ Add FAQ</button>
        <p className="text-xs text-v-text-secondary mt-3">The chat only repeats what’s written here. It never makes up prices, timelines or methods. Don’t put anything private in your FAQs; website visitors can see the answers.</p>
      </section>

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-v-charcoal/95 border-t border-v-border flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save chat settings'}</button>
        <p role="status" aria-live="polite" className="text-xs text-v-text-secondary">{status}</p>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}
