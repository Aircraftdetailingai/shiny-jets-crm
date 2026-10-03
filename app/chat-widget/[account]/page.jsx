"use client";
// AI chat bubble panel. Loaded in an iframe by /ai-chat.js on the detailer's
// website (or opened directly). Answers only from that shop's FAQs; when it
// can't, offers "Request a quote" and "Have someone text you".
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const DARK = '#111827';
const MUTED = '#4B5563'; // 7.5:1 on white

function postToParent(type) {
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'sj-ai-chat', type }, '*'); } catch {}
}

export default function ChatWidgetPage() {
  return <Suspense fallback={null}><ChatWidget /></Suspense>;
}

function ChatWidget() {
  const { account } = useParams();
  const search = useSearchParams();
  const pageUrl = search.get('page') || '';
  const embedded = search.get('embed') === '1';

  const [cfg, setCfg] = useState(null);
  const [cfgError, setCfgError] = useState(false);
  const [messages, setMessages] = useState([]); // {role, content, notCovered?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [handoff, setHandoff] = useState(null); // null | {name, phone, question, consent, errors, sending, done}
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const formHeadingRef = useRef(null);

  useEffect(() => {
    fetch(`/api/ai-chat/config?account=${encodeURIComponent(account)}`)
      .then((r) => r.json())
      .then((d) => {
        setCfg(d);
        if (d.available) setMessages([{ role: 'assistant', content: d.greeting }]);
      })
      .catch(() => setCfgError(true));
  }, [account]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, handoff]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') postToParent('close'); };
    const onMsg = (e) => { if (e?.data?.source === 'sj-ai-chat-host' && e.data.type === 'focus') inputRef.current?.focus(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('message', onMsg); };
  }, []);

  useEffect(() => { if (handoff && !handoff.done) formHeadingRef.current?.focus(); }, [handoff?.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = cfg?.colors || { bg: '#007CB1', fg: '#FFFFFF' };
  const company = cfg?.company || 'Our team';

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user', content: text.slice(0, 500) }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ai-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, messages: next.map(({ role, content }) => ({ role, content })), pageUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Something went wrong. Please try again.'); return; }
      setMessages((m) => [...m, { role: 'assistant', content: d.reply, notCovered: !d.covered }]);
    } catch {
      setError('Couldn’t reach us. Check your connection and try again.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const lastQuestion = () => [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const openHandoff = () => setHandoff({ open: Date.now(), name: '', phone: '', question: lastQuestion(), consent: false, errors: {}, sending: false, done: false });

  const submitHandoff = async (e) => {
    e.preventDefault();
    const h = handoff;
    const errors = {};
    if (!h.name.trim()) errors.name = 'Please enter your name.';
    if (h.phone.replace(/\D/g, '').length < 10) errors.phone = 'Please enter a valid mobile number, for example 555 123 4567.';
    if (!h.question.trim()) errors.question = 'Please tell us your question.';
    if (!h.consent) errors.consent = 'Please agree to receive text messages so we can text you back.';
    if (Object.keys(errors).length) {
      setHandoff({ ...h, errors });
      setTimeout(() => document.getElementById(`ho-${Object.keys(errors)[0]}`)?.focus(), 0);
      return;
    }
    setHandoff({ ...h, errors: {}, sending: true });
    try {
      const res = await fetch('/api/ai-chat/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, name: h.name, phone: h.phone, question: h.question, consent: h.consent, pageUrl, transcript: messages.map(({ role, content }) => ({ role, content })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fe = d.fields || {};
        setHandoff({ ...h, sending: false, errors: Object.keys(fe).length ? fe : { form: d.error || 'Couldn’t send. Please try again.' } });
        return;
      }
      setHandoff({ ...h, sending: false, done: true });
      setMessages((m) => [...m, { role: 'assistant', content: `Thanks, ${h.name.trim().split(' ')[0]}! Someone from ${company} will text you at ${h.phone.trim()} soon.` }]);
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      setHandoff({ ...h, sending: false, errors: { form: 'Couldn’t reach us. Check your connection and try again.' } });
    }
  };

  const btn = 'inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg text-[15px] font-semibold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2';
  const field = 'w-full min-h-[44px] rounded-lg border border-gray-500 bg-white px-3 py-2 text-[16px] text-gray-900 placeholder:text-gray-500 focus:outline focus:outline-[3px] focus:outline-offset-1';

  if (cfgError || (cfg && !cfg.available)) {
    return (
      <div className="fixed inset-0 bg-white text-gray-900 flex flex-col items-center justify-center p-6 text-center" style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        <p className="text-base mb-4">Chat isn’t available right now.</p>
        {cfg?.quoteUrl && <a href={cfg.quoteUrl} target="_blank" rel="noopener" className={btn} style={{ background: '#007CB1', color: '#fff', outlineColor: DARK }}>Request a quote<span className="sr-only"> (opens in a new tab)</span></a>}
        {embedded && <button type="button" onClick={() => postToParent('close')} className="mt-3 underline min-h-[44px] px-3" style={{ color: MUTED }}>Close</button>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white text-gray-900 flex flex-col" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: colors.bg, color: colors.fg }}>
        {cfg?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cfg.logo} alt="" className="h-8 w-8 rounded-full object-contain bg-white" />
        ) : (
          <span aria-hidden="true" className="h-8 w-8 rounded-full flex items-center justify-center font-bold" style={{ background: colors.fg, color: colors.bg }}>{company.charAt(0)}</span>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-semibold truncate">{company}</h1>
          <p className="text-[13px] opacity-95">Answers from our FAQs</p>
        </div>
        {embedded && (
          <button type="button" onClick={() => postToParent('close')} aria-label="Close chat" className="h-11 w-11 -mr-2 flex items-center justify-center rounded-lg text-2xl leading-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-3px]" style={{ outlineColor: colors.fg }}>
            <span aria-hidden="true">×</span>
          </button>
        )}
      </header>

      {/* Messages */}
      <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Chat messages" aria-busy={busy} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {!cfg && <p className="text-sm" style={{ color: MUTED }}>Loading…</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug whitespace-pre-wrap break-words ${m.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md bg-white border border-gray-300'}`}
              style={m.role === 'user' ? { background: colors.bg, color: colors.fg } : { color: DARK }}>
              <span className="sr-only">{m.role === 'user' ? 'You said: ' : `${company} assistant: `}</span>
              {m.content}
              {m.notCovered && i === messages.length - 1 && !handoff?.done && (
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <a href={cfg?.quoteUrl} target="_blank" rel="noopener" className={btn} style={{ background: colors.bg, color: colors.fg, outlineColor: DARK }}>
                    Request a quote<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {!handoff && (
                    <button type="button" onClick={openHandoff} className={`${btn} border-2`} style={{ borderColor: DARK, color: DARK, outlineColor: DARK }}>
                      Have someone text you
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm" style={{ color: MUTED }}><span aria-hidden="true">●●●</span><span className="sr-only">{company} is typing</span></p>}

        {/* Handoff form */}
        {handoff && !handoff.done && (
          <form onSubmit={submitHandoff} noValidate className="bg-white border border-gray-300 rounded-2xl p-4 space-y-3" aria-labelledby="ho-heading">
            <h2 id="ho-heading" ref={formHeadingRef} tabIndex={-1} className="text-[16px] font-semibold" style={{ color: DARK }}>Have someone text you</h2>
            <p className="text-[14px]" style={{ color: MUTED }}>Leave your details and someone from {company} will text you back.</p>
            {[
              ['name', 'Your name', 'text', 'name'],
              ['phone', 'Mobile number', 'tel', 'tel'],
            ].map(([k, label, type, ac]) => (
              <div key={k}>
                <label htmlFor={`ho-${k}`} className="block text-[14px] font-medium mb-1" style={{ color: DARK }}>{label}</label>
                <input id={`ho-${k}`} type={type} autoComplete={ac} inputMode={k === 'phone' ? 'tel' : undefined} value={handoff[k]} required
                  onChange={(e) => setHandoff({ ...handoff, [k]: e.target.value })}
                  aria-invalid={!!handoff.errors[k]} aria-describedby={handoff.errors[k] ? `ho-${k}-err` : undefined}
                  className={field} style={{ outlineColor: colors.bg === '#FFFFFF' ? DARK : DARK }} />
                {handoff.errors[k] && <p id={`ho-${k}-err`} className="mt-1 text-[14px] text-red-700">{handoff.errors[k]}</p>}
              </div>
            ))}
            <div>
              <label htmlFor="ho-question" className="block text-[14px] font-medium mb-1" style={{ color: DARK }}>Your question</label>
              <textarea id="ho-question" rows={3} value={handoff.question} required maxLength={1000}
                onChange={(e) => setHandoff({ ...handoff, question: e.target.value })}
                aria-invalid={!!handoff.errors.question} aria-describedby={handoff.errors.question ? 'ho-question-err' : undefined}
                className={field} style={{ outlineColor: DARK }} />
              {handoff.errors.question && <p id="ho-question-err" className="mt-1 text-[14px] text-red-700">{handoff.errors.question}</p>}
            </div>
            <div>
              <div className="flex items-start gap-3">
                <input id="ho-consent" type="checkbox" checked={handoff.consent} required
                  onChange={(e) => setHandoff({ ...handoff, consent: e.target.checked })}
                  aria-invalid={!!handoff.errors.consent} aria-describedby={handoff.errors.consent ? 'ho-consent-err' : undefined}
                  className="mt-1 h-6 w-6 shrink-0" style={{ accentColor: colors.bg }} />
                <label htmlFor="ho-consent" className="text-[14px] leading-snug" style={{ color: DARK }}>{cfg?.consentText}</label>
              </div>
              {handoff.errors.consent && <p id="ho-consent-err" className="mt-1 text-[14px] text-red-700">{handoff.errors.consent}</p>}
            </div>
            {handoff.errors.form && <p role="alert" className="text-[14px] text-red-700">{handoff.errors.form}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={handoff.sending} className={`${btn} flex-1 disabled:opacity-60`} style={{ background: colors.bg, color: colors.fg, outlineColor: DARK }}>
                {handoff.sending ? 'Sending…' : 'Text me back'}
              </button>
              <button type="button" onClick={() => { setHandoff(null); setTimeout(() => inputRef.current?.focus(), 0); }} className={`${btn} border border-gray-500`} style={{ color: DARK, outlineColor: DARK }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-gray-300 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && <p role="alert" className="text-[14px] text-red-700 mb-2">{error}</p>}
        <form onSubmit={send} className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">Type your question</label>
          <input id="chat-input" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} autoComplete="off"
            placeholder="Type your question…" disabled={!cfg} className={`${field} flex-1`} style={{ outlineColor: DARK }} />
          <button type="submit" disabled={busy || !input.trim()} className={`${btn} disabled:opacity-60`} style={{ background: colors.bg, color: colors.fg, outlineColor: DARK }}>
            Send
          </button>
        </form>
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-[12px] leading-snug" style={{ color: MUTED }}>{cfg?.holdHarmless}</p>
          {cfg?.quoteUrl && (
            <a href={cfg.quoteUrl} target="_blank" rel="noopener" className="shrink-0 text-[13px] font-semibold underline min-h-[24px] inline-flex items-center" style={{ color: DARK }}>
              Request a quote<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
