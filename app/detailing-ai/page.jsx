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
          { role: 'assistant', content: data.reply || 'No response from Detailing AI.' },
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
