"use client";

import { useEffect, useState } from 'react';
import MarkdownLite from '@/components/MarkdownLite';

// Customer-facing stacked terms acceptance gate. Renders the active platform
// terms above the detailer's own terms (markdown OR a PDF iframe), plus a
// single "I agree to both" checkbox. Caller passes onAccept(versionId) which
// fires once the box is ticked AND the user clicks Continue. Caller is
// responsible for stamping the parent record (invoice or quote) and then
// proceeding to checkout.
//
// If the parent record already has customer_terms_version_id matching the
// currently-active platform version, the caller passes alreadyAccepted=true
// and we render a compact "Terms accepted on [date]" pill with a "View
// terms" expander instead of the full gate.
export default function StackedTermsAccept({
  detailerName,
  detailerTermsText,
  detailerTermsPdfUrl,
  alreadyAccepted = false,
  acceptedAt = null,
  onAccept,
  loading = false,
  ctaLabel = 'Continue',
}) {
  const [platformTerms, setPlatformTerms] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [showDetailer, setShowDetailer] = useState(false);
  const [showAcceptedDetail, setShowAcceptedDetail] = useState(false);

  useEffect(() => {
    fetch('/api/platform-terms/active')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.terms) setPlatformTerms(d.terms); })
      .catch(() => {});
  }, []);

  const handleContinue = () => {
    if (!agreed || loading) return;
    if (onAccept) onAccept(platformTerms?.id || null);
  };

  // Compact "already accepted" view. Customer can still expand to review.
  if (alreadyAccepted) {
    const acceptedDate = acceptedAt ? new Date(acceptedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    return (
      <div className="border border-[var(--brand-border,#1A2236)] bg-[var(--brand-surface,#111827)]/50 rounded p-3 mb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[var(--brand-text-secondary,#8A9BB0)]">
            Terms accepted{acceptedDate ? ` on ${acceptedDate}` : ''}
          </p>
          <button
            type="button"
            onClick={() => setShowAcceptedDetail(v => !v)}
            className="text-xs text-[var(--brand-primary,#007CB1)] hover:underline"
          >
            {showAcceptedDetail ? 'Hide terms' : 'View terms'}
          </button>
        </div>
        {showAcceptedDetail && (
          <div className="mt-3 space-y-3">
            {platformTerms && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--brand-text-secondary,#8A9BB0)] mb-1">Shiny Jets service terms (v{platformTerms.version})</p>
                <div className="p-3 bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border,#1A2236)] rounded max-h-64 overflow-y-auto text-[var(--brand-text,#F5F5F5)]">
                  <MarkdownLite source={platformTerms.body_md} />
                </div>
              </div>
            )}
            {(detailerTermsText || detailerTermsPdfUrl) && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--brand-text-secondary,#8A9BB0)] mb-1">{detailerName || 'Detailer'} service terms</p>
                {detailerTermsPdfUrl ? (
                  <iframe src={detailerTermsPdfUrl} title="Detailer Terms PDF" className="w-full h-96 border border-[var(--brand-border,#1A2236)] rounded bg-white" />
                ) : (
                  <div className="p-3 bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border,#1A2236)] rounded max-h-64 overflow-y-auto text-[var(--brand-text,#F5F5F5)]">
                    <MarkdownLite source={detailerTermsText} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full gate.
  return (
    <div className="border border-[var(--brand-border,#1A2236)] rounded p-4 mb-4 bg-[var(--brand-surface,#111827)]/50">
      <p className="text-[10px] tracking-[0.3em] uppercase text-[var(--brand-text-secondary,#8A9BB0)] mb-3">Terms and Conditions</p>

      {/* Platform terms section */}
      {platformTerms ? (
        <div className="border border-[var(--brand-border,#1A2236)] rounded mb-3 bg-[var(--brand-bg,#0A0E17)]/40">
          <button
            type="button"
            onClick={() => setShowPlatform(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="text-sm text-[var(--brand-text,#F5F5F5)]">Shiny Jets service terms <span className="text-[var(--brand-text-secondary,#8A9BB0)]">(v{platformTerms.version})</span></span>
            <span className="text-xs text-[var(--brand-primary,#007CB1)]">{showPlatform ? 'Hide' : 'View'}</span>
          </button>
          {showPlatform && (
            <div className="px-3 pb-3 max-h-64 overflow-y-auto text-[var(--brand-text,#F5F5F5)]">
              <MarkdownLite source={platformTerms.body_md} />
            </div>
          )}
        </div>
      ) : null}

      {/* Detailer terms section */}
      {(detailerTermsText || detailerTermsPdfUrl) && (
        <div className="border border-[var(--brand-border,#1A2236)] rounded mb-3 bg-[var(--brand-bg,#0A0E17)]/40">
          <button
            type="button"
            onClick={() => setShowDetailer(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="text-sm text-[var(--brand-text,#F5F5F5)]">{detailerName || 'Detailer'} service terms</span>
            <span className="text-xs text-[var(--brand-primary,#007CB1)]">{showDetailer ? 'Hide' : 'View'}</span>
          </button>
          {showDetailer && (
            <div className="px-3 pb-3 text-[var(--brand-text,#F5F5F5)]">
              {detailerTermsPdfUrl ? (
                <>
                  <a
                    href={detailerTermsPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-[var(--brand-primary,#007CB1)] hover:underline mb-2"
                  >
                    Open PDF in new tab
                  </a>
                  <iframe src={detailerTermsPdfUrl} title="Detailer Terms PDF" className="w-full h-96 border border-[var(--brand-border,#1A2236)] rounded bg-white" />
                </>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  <MarkdownLite source={detailerTermsText} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Agreement checkbox */}
      <label className="flex items-start gap-2 text-sm text-[var(--brand-text,#F5F5F5)] cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[var(--brand-primary,#007CB1)]"
        />
        <span>
          I have read both sets of terms above. I agree to the Shiny Jets service terms and the {detailerName || 'detailer'} service terms.
        </span>
      </label>

      <button
        type="button"
        onClick={handleContinue}
        disabled={!agreed || loading}
        className="w-full mt-3 py-3 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Processing...' : ctaLabel}
      </button>
    </div>
  );
}
