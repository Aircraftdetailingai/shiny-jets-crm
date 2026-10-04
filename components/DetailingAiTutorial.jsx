"use client";

import { useEffect, useRef, useState } from 'react';
import { TUTORIAL_SLIDES } from '@/lib/detailing-ai-tutorial';

const SWIPE_PX = 50;

/**
 * First-run tutorial: swipeable slides in a modal dialog (bottom sheet on phones).
 * Skippable (Skip / Escape / backdrop), keyboard arrows, focus trapped while open.
 */
export default function DetailingAiTutorial({ open, onClose, slides = TUTORIAL_SLIDES }) {
  const [index, setIndex] = useState(0);
  const panelRef = useRef(null);
  const nextRef = useRef(null);
  const swipe = useRef(null);
  const last = slides.length - 1;
  const slide = slides[index];

  useEffect(() => { if (open) setIndex(0); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => nextRef.current?.focus(), 0);
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose('skip'); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndex((i) => Math.min(last, i + 1)); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); return; }
      const el = panelRef.current;
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll('button:not([disabled])')];
        if (!f.length) return;
        if (e.shiftKey && (document.activeElement === f[0] || !el.contains(document.activeElement))) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, last, onClose]);

  if (!open) return null;

  const go = (i) => setIndex(Math.max(0, Math.min(last, i)));
  const onPointerDown = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" aria-hidden="true" onClick={() => onClose('skip')} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dai-tutorial-title"
        aria-describedby="dai-tutorial-lead"
        data-testid="dai-tutorial"
        className="relative w-full md:max-w-md bg-v-charcoal border border-v-border-subtle rounded-t-2xl md:rounded-2xl shadow-2xl px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-5 max-h-[92dvh] flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs uppercase tracking-widest text-v-text-secondary">
            Detailing AI tips <span className="sr-only">,</span> <span aria-hidden="true">·</span> {index + 1} of {slides.length}
          </p>
          <button
            type="button"
            onClick={() => onClose('skip')}
            className="min-h-[44px] px-3 -mr-2 rounded-xl text-sm text-v-text-primary underline underline-offset-4 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-v-gold"
          >
            Skip
          </button>
        </div>

        <div
          className="mt-2 flex-1 min-h-0 overflow-y-auto touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null; }}
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${slides.length}`}
          data-testid="dai-tutorial-slide"
        >
          <div key={slide.id} className="motion-safe:animate-[fadeIn_200ms_ease-out]">
            <div aria-hidden="true" className="mb-3 h-12 w-12 rounded-2xl bg-v-gold/15 border border-v-gold/40 flex items-center justify-center text-2xl">
              {['\u2708\uFE0F', '\uD83D\uDCAC', '\uD83D\uDCF7', '\uD83D\uDDC2\uFE0F', '\uD83E\uDDD1\u200D\uD83D\uDD27'][index] || '\u2728'}
            </div>
            <h2 id="dai-tutorial-title" className="font-heading text-v-text-primary text-xl font-light uppercase tracking-wider">{slide.title}</h2>
            <p id="dai-tutorial-lead" className="mt-2 text-base text-v-text-primary">{slide.lead}</p>
            <ul className="mt-3 space-y-2">
              {slide.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm leading-relaxed text-v-text-primary">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-v-gold" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">{`Tip ${index + 1} of ${slides.length}: ${slide.title}`}</p>

        <div className="mt-4 shrink-0">
          <div className="flex justify-center gap-1 mb-3" role="group" aria-label="Choose a tip">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Tip ${i + 1}: ${s.title}`}
                aria-current={i === index ? 'step' : undefined}
                className="h-6 w-6 flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-v-gold"
              >
                <span aria-hidden="true" className={`block rounded-full transition-all motion-reduce:transition-none ${i === index ? 'h-2.5 w-2.5 bg-v-gold' : 'h-2 w-2 bg-v-text-secondary'}`} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="h-12 flex-1 rounded-xl border border-v-border-subtle text-v-text-primary text-sm font-semibold disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-v-gold"
            >
              Back
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={() => (index === last ? onClose('done') : go(index + 1))}
              className="h-12 flex-[2] rounded-xl bg-v-gold text-v-charcoal text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {index === last ? 'Start asking' : 'Next'}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-v-text-secondary">Swipe or use the arrow keys. Reopen anytime with the ? button.</p>
        </div>
      </div>
    </div>
  );
}
