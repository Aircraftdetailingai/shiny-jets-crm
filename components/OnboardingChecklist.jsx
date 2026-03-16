"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const DISMISS_KEY = 'vector_checklist_dismissed';
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export default function OnboardingChecklist({ user }) {
  const router = useRouter();
  const modalRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Hidden if permanently completed
    if (user.onboarding_completed) return;

    // Hidden if account age > 7 days
    if (user.created_at) {
      const accountAge = Date.now() - new Date(user.created_at).getTime();
      if (accountAge > 7 * 24 * 60 * 60 * 1000) return;
    }

    // Hidden if dismissed less than 24h ago (or permanently)
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt === 'permanent') return;
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < DISMISS_DURATION) return;

    // Fetch checklist status
    const token = localStorage.getItem('vector_token');
    if (!token) return;

    fetch('/api/onboarding/checklist', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        setSteps(data.steps);
        setCompletedCount(data.completedCount);
        setLoading(false);
        setVisible(true);
      })
      .catch(() => {});
  }, [user]);

  const handleSkip = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  const handleDontShowAgain = async () => {
    // Set localStorage immediately so it's instant
    localStorage.setItem(DISMISS_KEY, 'permanent');
    setVisible(false);
    // Persist to DB
    const token = localStorage.getItem('vector_token');
    if (token) {
      await fetch('/api/onboarding/checklist', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  };

  const handleGetStarted = async () => {
    localStorage.setItem(DISMISS_KEY, 'permanent');
    setVisible(false);
    const token = localStorage.getItem('vector_token');
    if (token) {
      await fetch('/api/onboarding/checklist', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  };

  const handleOverlayClick = (e) => {
    // Click on backdrop (outside modal) = skip for now
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      handleSkip();
    }
  };

  const allComplete = completedCount === steps.length && steps.length > 0;

  if (!visible || loading) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div ref={modalRef} className="bg-v-surface border border-v-border rounded-sm modal-glow max-w-lg w-full max-h-[90vh] overflow-y-auto relative">
        {/* X close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-v-text-secondary hover:text-v-text-primary transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="p-6 pb-4 text-center">
          <p className="text-v-gold text-2xl mb-2">&#9992;</p>
          <h2 className="font-heading text-v-gold text-xl tracking-wide">Welcome to Vector</h2>
          <p className="text-v-text-secondary text-sm mt-1">Complete these steps to get the most out of your account</p>
        </div>

        {/* Progress bar */}
        <div className="px-6 mb-4">
          <div className="flex items-center justify-between text-xs text-v-text-secondary mb-1.5">
            <span>{completedCount} of {steps.length} complete</span>
            <span>{Math.round((completedCount / steps.length) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-v-charcoal rounded-full overflow-hidden">
            <div
              className="h-full bg-v-gold rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 space-y-2">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3 rounded border ${
                step.complete
                  ? 'border-v-gold/20 bg-v-gold/5'
                  : 'border-v-border bg-v-charcoal/50'
              }`}
            >
              {/* Step indicator */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
                step.complete
                  ? 'bg-v-gold text-v-charcoal'
                  : 'border border-v-border text-v-text-secondary'
              }`}>
                {step.complete ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.complete ? 'text-v-gold' : 'text-v-text-primary'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-v-text-secondary">{step.description}</p>
              </div>

              {/* CTA */}
              {step.complete ? (
                <span className="text-xs text-v-gold font-medium shrink-0 px-2 py-1 rounded bg-v-gold/10">Done</span>
              ) : (
                <button
                  onClick={() => router.push(step.cta)}
                  className="text-xs font-medium px-3 py-1.5 rounded bg-v-gold text-v-charcoal hover:bg-v-gold-dim shrink-0 transition-colors"
                >
                  {step.ctaLabel}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Bottom buttons */}
        <div className="p-6 pt-5 flex flex-col gap-2">
          {allComplete ? (
            <button
              onClick={handleGetStarted}
              className="w-full py-3 rounded bg-v-gold text-v-charcoal font-medium hover:bg-v-gold-dim transition-colors"
            >
              Get Started
            </button>
          ) : (
            <>
              <button
                onClick={handleSkip}
                className="w-full py-2.5 rounded border border-v-border text-v-text-secondary text-sm hover:text-v-text-primary hover:border-v-gold/50 transition-colors"
              >
                Skip for now
              </button>
              <button
                onClick={handleDontShowAgain}
                className="w-full py-2 text-xs text-v-text-secondary hover:text-v-text-primary transition-colors"
              >
                Don&apos;t show again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
