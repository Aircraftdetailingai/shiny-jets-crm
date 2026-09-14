"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

const STARTERS = [
  'Paint looks chalky on a G550 top — oxidation or clearcoat failure?',
  'Acrylic windows hazed after an FBO wipe. What do I ask / sell?',
  'Customer wants leading edges restored. How do I set cut level & hours?',
  'Ceramic from another shop stopped beading after 6 months. Next steps?',
];

function buildPrefillFromSuggestions(suggestions, diagnosisText) {
  const services = Array.isArray(suggestions?.services) ? suggestions.services : [];
  const matchedIds = services.map((s) => s.service_id).filter(Boolean);
  const names = services.map((s) => s.name).filter(Boolean);
  const customHours = {};
  for (const s of services) {
    if (s.service_id && s.hours != null && !Number.isNaN(Number(s.hours))) {
      customHours[s.service_id] = Number(s.hours);
    }
  }

  const lineNotes = services
    .filter((s) => s.notes)
    .map((s) => `${s.name}: ${s.notes}`)
    .join('\n');

  const notesParts = [];
  if (suggestions?.notes) notesParts.push(suggestions.notes);
  if (lineNotes) notesParts.push(lineNotes);
  if (diagnosisText) {
    const clipped = diagnosisText.length > 1200 ? `${diagnosisText.slice(0, 1200)}…` : diagnosisText;
    notesParts.push(`— Detailing AI diagnosis —\n${clipped}`);
  }

  return {
    source: 'detailing-ai',
    aircraft: suggestions?.aircraft || '',
    service: names.join(', '),
    selected_services: matchedIds,
    custom_hours: Object.keys(customHours).length ? customHours : undefined,
    notes: notesParts.filter(Boolean).join('\n\n'),
    timestamp: Date.now(),
  };
}

export default function DetailingAiPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I'm Detailing AI — diagnostic help for exterior, interior, brightwork, and ceramic. Describe the jet and what you're seeing, and I'll help you diagnose and align services. I don't replace manufacturer specs.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creatingDraft, setCreatingDraft] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) router.push('/login');
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setError('');
    setInput('');
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/detailing-ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.reply) {
        setError(data.error || 'Request failed');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.error || 'Something went wrong. Try again.' },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply || 'No response from Detailing AI.',
            suggestions: data.suggestions || null,
          },
        ]);
      }
    } catch (err) {
      setError(err.message || 'Network error');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network error talking to Detailing AI. Check your connection and try again.' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const createQuoteDraft = (messageIndex) => {
    const msg = messages[messageIndex];
    if (!msg?.suggestions?.services?.length) return;
    setCreatingDraft(messageIndex);
    try {
      const prefill = buildPrefillFromSuggestions(msg.suggestions, msg.content);
      localStorage.setItem('quote_prefill', JSON.stringify(prefill));
      router.push('/quotes/new');
    } catch (err) {
      setError(err.message || 'Could not open quote draft');
      setCreatingDraft(null);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send();
  };

  return (
    <AppShell title="Detailing AI">
      <div className="flex flex-col h-[calc(100vh-3.5rem)] max-w-3xl mx-auto px-4 md:px-8 py-4">
        <div className="mb-4">
          <h2 className="font-heading text-v-text-primary text-lg font-light uppercase tracking-widest">
            Detailing AI
          </h2>
          <p className="text-sm text-v-text-secondary mt-1">
            Aircraft detailing diagnosis for your shop — exterior, interior, brightwork, ceramic.
            Suggested services can open a draft quote (never auto-sent).
          </p>
        </div>

        <div className="flex-1 overflow-y-auto rounded-xl border border-v-border-subtle bg-v-surface/40 p-4 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-v-gold/20 text-v-text-primary border border-v-gold/30'
                    : 'bg-v-charcoal text-v-text-primary border border-v-border-subtle'
                }`}
              >
                {m.role === 'assistant' && (
                  <p className="text-[10px] uppercase tracking-widest text-v-gold mb-1.5">Detailing AI</p>
                )}
                {m.content}

                {m.role === 'assistant' && m.suggestions?.services?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-v-border-subtle space-y-2 whitespace-normal">
                    <p className="text-[10px] uppercase tracking-widest text-v-text-secondary">
                      Suggested quote lines
                    </p>
                    <ul className="space-y-1.5">
                      {m.suggestions.services.map((s, si) => (
                        <li
                          key={`${s.name}-${si}`}
                          className="flex items-start justify-between gap-3 text-xs text-v-text-primary"
                        >
                          <span>
                            <span className="font-medium">{s.name}</span>
                            {!s.matched && (
                              <span className="ml-1.5 text-v-text-secondary">(name match in wizard)</span>
                            )}
                            {s.notes ? (
                              <span className="block text-v-text-secondary mt-0.5">{s.notes}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-v-gold tabular-nums">
                            {s.hours != null ? `${Number(s.hours).toFixed(1)}h` : '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {m.suggestions.notes && (
                      <p className="text-xs text-v-text-secondary">{m.suggestions.notes}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => createQuoteDraft(i)}
                      disabled={creatingDraft === i}
                      className="mt-1 inline-flex items-center px-3 py-2 rounded-lg bg-v-gold text-v-charcoal text-[11px] font-semibold uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition"
                    >
                      {creatingDraft === i ? 'Opening…' : 'Create quote draft'}
                    </button>
                    <p className="text-[10px] text-v-text-secondary">
                      Opens /quotes/new prefilled — draft only, nothing is sent.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 text-sm border border-v-border-subtle bg-v-charcoal text-v-text-secondary">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length <= 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={loading}
                className="text-left text-xs px-3 py-2 rounded-lg border border-v-border-subtle text-v-text-secondary hover:text-v-text-primary hover:border-v-gold/40 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-400">{error}</p>
        )}

        <form onSubmit={onSubmit} className="mt-3 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Describe the aircraft and the issue…"
            className="flex-1 resize-none rounded-xl bg-v-charcoal border border-v-border-subtle px-4 py-3 text-sm text-v-text-primary placeholder:text-v-text-secondary/60 focus:outline-none focus:border-v-gold/50"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 px-5 rounded-xl bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition"
          >
            Send
          </button>
        </form>
      </div>
    </AppShell>
  );
}
