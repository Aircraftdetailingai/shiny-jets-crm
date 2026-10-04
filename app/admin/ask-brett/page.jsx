"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

const REASON_LABELS = {
  unclear_photo: 'Unclear photo',
  white_paint: 'White / light paint',
  not_in_knowledge: 'Not in AI knowledge',
  user_asked: 'Asked for an expert',
  other: 'Other',
};

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function QuestionCard({ item, onAnswered, highlight }) {
  const [answer, setAnswer] = useState('');
  const [addToKnowledge, setAddToKnowledge] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef(null);
  const a = item.account || {};
  const answered = item.status === 'answered';
  const headingId = `q-${item.id}`;

  useEffect(() => {
    if (highlight && ref.current) { ref.current.scrollIntoView({ block: 'start' }); ref.current.focus(); }
  }, [highlight]);

  const send = async (e) => {
    e.preventDefault();
    if (!answer.trim() || sending) return;
    setSending(true);
    setErr('');
    try {
      const res = await fetch(`/api/admin/ask-brett/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('vector_token')}` },
        body: JSON.stringify({ answer: answer.trim(), add_to_knowledge: addToKnowledge }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || 'Could not send the answer.'); setSending(false); return; }
      onAnswered(item, data);
    } catch {
      setErr('Network error. Try again.');
      setSending(false);
    }
  };

  return (
    <article ref={ref} tabIndex={-1} aria-labelledby={headingId} className={`rounded-2xl border p-4 bg-v-surface/40 focus:outline-none ${highlight ? 'border-v-gold' : 'border-v-border-subtle'}`}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-v-text-secondary">
        <span className="px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-200">{REASON_LABELS[item.reason] || 'Other'}</span>
        <span>{when(item.created_at)}</span>
        {item.photo_urls?.length > 0 && <span>· {item.photo_urls.length} photo{item.photo_urls.length === 1 ? '' : 's'}</span>}
      </header>
      <h2 id={headingId} className="mt-2 text-base text-v-text-primary font-medium leading-snug">{item.summary || item.question.slice(0, 140)}</h2>
      <p className="mt-1 text-xs text-v-text-secondary break-words">
        {[a.company, a.name, a.email || item.user_email].filter(Boolean).join(' · ') || 'Unknown account'}{a.plan ? ` · ${a.plan}` : ''}
      </p>

      <h3 className="mt-3 text-[10px] uppercase tracking-widest text-v-text-secondary">Question</h3>
      <p className="mt-1 text-sm text-v-text-primary whitespace-pre-wrap">{item.question}</p>

      {item.photo_urls?.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Photos">
          {item.photo_urls.map((u, i) => (
            <li key={i}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-v-border-subtle focus:outline-none focus:ring-2 focus:ring-v-gold">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Photo ${i + 1} from the detailer (opens full size in a new tab)`} className="w-full aspect-square object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {item.ai_reply && (
        <details className="mt-3 rounded-lg border border-v-border-subtle">
          <summary className="cursor-pointer min-h-[44px] flex items-center px-3 text-xs text-v-text-primary">What the AI said</summary>
          <p className="px-3 pb-3 text-xs text-v-text-secondary whitespace-pre-wrap">{item.ai_reply}</p>
        </details>
      )}
      {item.conversation?.messages?.length > 0 && (
        <details className="mt-2 rounded-lg border border-v-border-subtle">
          <summary className="cursor-pointer min-h-[44px] flex items-center px-3 text-xs text-v-text-primary">Full chat: {item.conversation.title}</summary>
          <ol className="px-3 pb-3 space-y-2">
            {item.conversation.messages.map((m, i) => (
              <li key={i} className="text-xs">
                <span className="font-semibold text-v-text-primary">{m.role === 'user' ? 'Detailer' : 'Detailing AI'}:</span>{' '}
                <span className="text-v-text-secondary whitespace-pre-wrap">{m.photo_count ? `[${m.photo_count} photo${m.photo_count === 1 ? '' : 's'}] ` : ''}{m.text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {answered ? (
        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3">
          <p className="text-[10px] uppercase tracking-widest text-emerald-300">Answered {when(item.answered_at)}{item.added_to_knowledge ? ' · in AI knowledge' : ''}</p>
          <p className="mt-1 text-sm text-v-text-primary whitespace-pre-wrap">{item.answer}</p>
        </div>
      ) : (
        <form onSubmit={send} className="mt-4 space-y-3">
          <div>
            <label htmlFor={`answer-${item.id}`} className="block text-xs font-semibold text-v-text-primary">Your answer</label>
            <p id={`answer-help-${item.id}`} className="text-[11px] text-v-text-secondary">Shows in their chat and is emailed to them.</p>
            <textarea
              id={`answer-${item.id}`}
              aria-describedby={`answer-help-${item.id}`}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              maxLength={6000}
              required
              className="mt-1 w-full rounded-xl bg-v-charcoal border border-v-border-subtle px-3 py-3 text-base md:text-sm text-v-text-primary focus:outline-none focus:border-v-gold/60"
            />
          </div>
          <div className="flex items-start gap-3">
            <input
              id={`kb-${item.id}`}
              type="checkbox"
              checked={addToKnowledge}
              onChange={(e) => setAddToKnowledge(e.target.checked)}
              aria-describedby={`kb-help-${item.id}`}
              className="mt-0.5 h-6 w-6 shrink-0 accent-[#007cb1]"
            />
            <div>
              <label htmlFor={`kb-${item.id}`} className="text-sm text-v-text-primary">Add to AI knowledge</label>
              <p id={`kb-help-${item.id}`} className="text-[11px] text-v-text-secondary">Saves the question and your answer as Brett-approved knowledge so Detailing AI can answer it next time, for everyone. No account details or photos are saved.</p>
            </div>
          </div>
          {err && <p role="alert" className="text-xs text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={sending || !answer.trim()}
            className="w-full md:w-auto min-h-[48px] px-6 rounded-xl bg-v-gold text-v-charcoal text-sm font-semibold uppercase tracking-wider disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send answer'}
          </button>
        </form>
      )}
    </article>
  );
}

export default function AskBrettQueuePage() {
  const [tab, setTab] = useState('open');
  const [items, setItems] = useState([]);
  const [openCount, setOpenCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [status, setStatus] = useState('');
  const [focusId, setFocusId] = useState(null);

  const load = useCallback(async (which) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/ask-brett?status=${which}`, { headers: { Authorization: `Bearer ${localStorage.getItem('vector_token')}` } });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) { setError(data.error || 'Could not load the queue.'); setItems([]); return; }
      setItems(data.items || []);
      if (data.open_count != null) setOpenCount(data.open_count);
    } catch {
      setError('Network error loading the queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('vector_token')) { window.location.href = '/login'; return; }
    setFocusId(new URLSearchParams(window.location.search).get('id'));
    load('open');
  }, [load]);

  const switchTab = (t) => { setTab(t); setStatus(''); load(t); };

  const onAnswered = (item, data) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setOpenCount((n) => (n != null ? Math.max(0, n - 1) : n));
    const kb = data.knowledge === 'saved' ? ' Added to AI knowledge.' : data.knowledge === 'failed' ? ' (Could not add to AI knowledge.)' : '';
    setStatus(`Answer sent${data.emailed ? ' and emailed' : ''}.${kb}`);
  };

  if (forbidden) {
    return (
      <main className="min-h-screen bg-v-charcoal text-v-text-primary p-6">
        <h1 className="text-lg font-heading uppercase tracking-wider">Ask Brett</h1>
        <p className="mt-2 text-sm text-v-text-secondary">This page is for Shiny Jets admins only.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-v-charcoal text-v-text-primary">
      <div className="max-w-2xl mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
        <nav aria-label="Admin" className="text-xs"><a href="/admin" className="inline-flex min-h-[44px] items-center text-v-text-secondary underline underline-offset-2">← Admin</a></nav>
        <h1 className="text-xl font-heading uppercase tracking-wider">Ask Brett</h1>
        <p className="mt-1 text-sm text-v-text-secondary">Questions Detailing AI couldn&apos;t answer confidently. Your answer shows in the detailer&apos;s chat and is emailed to them.</p>

        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Show">
          {[['open', `Open${openCount != null ? ` (${openCount})` : ''}`], ['answered', 'Answered']].map(([t, label]) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => switchTab(t)}
              className={`min-h-[44px] rounded-xl border text-sm font-semibold ${tab === t ? 'bg-v-gold text-v-charcoal border-v-gold' : 'border-v-border-subtle text-v-text-primary'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <p role="status" aria-live="polite" className="mt-3 text-sm text-emerald-300 min-h-[1.25rem]">{status}</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}

        {loading ? (
          <p className="mt-4 text-sm text-v-text-secondary">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-v-text-secondary">{tab === 'open' ? 'No open questions. Nice.' : 'No answered questions yet.'}</p>
        ) : (
          <div className="mt-3 space-y-4">
            {items.map((item) => (
              <QuestionCard key={item.id} item={item} onAnswered={onAnswered} highlight={focusId === item.id} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
