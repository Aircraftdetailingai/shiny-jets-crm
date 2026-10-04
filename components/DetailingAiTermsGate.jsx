"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { TERMS, TERMS_VERSION, TERMS_LABEL } from '@/lib/detailing-ai-terms';

function authHeaders(json = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : '';
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` };
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Aircraft Detailing AI Terms gate (Brett, Oct 3 2026). At a user's first Detailing AI visit, and
 * again whenever TERMS_VERSION changes, the terms open in a modal that can't be dismissed: no close
 * button, Escape does nothing, focus stays inside. Detailing AI (chat, tutorial, history) is not
 * rendered until the user clicks "I agree" and the server records it. The chat API enforces the
 * same check (lib/detailing-ai-terms-server.js), so the page can't be bypassed.
 */
export default function DetailingAiTermsGate({ children }) {
  // checking | needed | accepted | signed_out
  const [state, setState] = useState('checking');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/detailing-ai/terms', { headers: authHeaders(), cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 401) return setState('signed_out'); // the page's own login redirect runs
        if (res.status === 403) return setState('signed_out'); // crew / plan: the page shows its own message
        const data = await res.json().catch(() => ({}));
        setState(res.ok && data.accepted && data.terms_version === TERMS_VERSION ? 'accepted' : 'needed');
      } catch {
        if (!cancelled) setState('needed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Modal behavior: lock page scroll, move focus into the dialog, trap Tab, ignore Escape.
  useEffect(() => {
    if (state !== 'needed') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    headingRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); return; }
      if (e.key !== 'Tab') return;
      const el = panelRef.current;
      if (!el) return;
      const f = Array.from(el.querySelectorAll(FOCUSABLE));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [state]);

  const agree = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/detailing-ai/terms', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ terms_version: TERMS_VERSION }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.accepted) {
        setState('accepted');
        return;
      }
      setError(data.error || 'We couldn\u2019t save your agreement. Check your connection and try again.');
    } catch {
      setError('We couldn\u2019t save your agreement. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, []);

  if (state === 'accepted' || state === 'signed_out') return children;

  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center" aria-busy="true">
        <p role="status" className="text-sm text-v-text-secondary">Loading Detailing AI&hellip;</p>
      </div>
    );
  }

  const title = 'Aircraft Detailing AI Terms of Service';
  return (
    <div className="fixed inset-0 z-[70] bg-v-charcoal md:bg-black/80 flex items-stretch md:items-center justify-center md:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dai-terms-title"
        aria-describedby="dai-terms-lead"
        data-testid="dai-terms"
        className="relative flex w-full flex-col bg-v-charcoal md:max-w-2xl md:max-h-[88dvh] md:rounded-2xl md:border md:border-v-border md:shadow-2xl h-[100dvh] md:h-auto"
      >
        <div className="shrink-0 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-6 pb-3 border-b border-v-border">
          <h2
            id="dai-terms-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl md:text-2xl font-semibold text-v-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
          >
            {title}
          </h2>
          <p id="dai-terms-lead" className="mt-2 text-base text-v-text-primary">
            Please read and agree to the {TERMS_LABEL} to use Detailing AI. We record the date and time you agree.
          </p>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label={`${TERMS_LABEL}, version ${TERMS_VERSION}`}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 text-base leading-relaxed text-v-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        >
          <p className="text-sm text-v-text-secondary">{TERMS.company}</p>
          <p className="mt-1 text-sm text-v-text-secondary">Version <time dateTime={TERMS_VERSION}>{TERMS_VERSION}</time></p>
          <ol className="mt-4 space-y-4">
            {TERMS.sections.map((s) => (
              <li key={s.n || s.body}>
                {s.heading ? <h3 className="font-semibold text-v-text-primary">{s.n}. {s.heading}</h3> : null}
                <p className="mt-1">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="shrink-0 border-t border-v-border px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-5">
          {error ? (
            <p role="alert" className="mb-3 rounded-lg border border-red-400/60 bg-red-950/60 px-3 py-2 text-sm text-red-100">{error}</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm text-v-text-primary underline underline-offset-4 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Leave Detailing AI
            </a>
            <button
              type="button"
              onClick={agree}
              disabled={saving}
              aria-describedby="dai-terms-lead"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-v-gold px-6 text-base font-semibold text-white hover:bg-v-gold-dim disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-v-charcoal sm:min-w-[12rem]"
            >
              {saving ? 'Saving\u2026' : 'I agree'}
            </button>
          </div>
          <p className="sr-only" aria-live="polite">{saving ? 'Saving your agreement' : ''}</p>
        </div>
      </div>
    </div>
  );
}
