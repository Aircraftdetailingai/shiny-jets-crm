"use client";
import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'vector_tour_complete';

const TOUR_STEPS = [
  {
    target: '[data-tour="quote-builder"]',
    title: 'Create Your First Quote',
    description: 'Select an aircraft, choose services, and generate a professional quote in seconds. This is the heart of Vector.',
    position: 'bottom',
  },
  {
    target: '[data-tour="services-prompt"]',
    fallbackTarget: '[data-tour="nav-settings"]',
    title: 'Add Services & Rates',
    description: 'Set up the services you offer with your pricing. Head to Settings to configure your service menu, hourly rates, and packages.',
    position: 'bottom',
  },
  {
    target: '[data-tour="nav-calendar"]',
    title: 'View Your Calendar',
    description: 'See all your scheduled jobs at a glance. Paid quotes automatically appear on your calendar.',
    position: 'bottom',
  },
  {
    target: '[data-tour="nav-analytics"]',
    title: 'Track Your Performance',
    description: 'Monitor revenue trends, conversion rates, busiest days, and more with detailed analytics.',
    position: 'bottom',
  },
  {
    target: '[data-tour="quick-stats"]',
    title: 'Quick Stats & Activity',
    description: 'Your key metrics at a glance — weekly revenue, outstanding quotes, and recent activity all in one place.',
    position: 'top',
  },
];

function getRect(el) {
  const r = el.getBoundingClientRect();
  return {
    top: r.top + window.scrollY,
    left: r.left + window.scrollX,
    width: r.width,
    height: r.height,
    bottom: r.bottom + window.scrollY,
    right: r.right + window.scrollX,
  };
}

export default function DashboardTour({ onComplete }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const tooltipRef = useRef(null);

  // Check if tour should show
  useEffect(() => {
    const complete = localStorage.getItem(STORAGE_KEY);
    if (!complete) {
      // Small delay to let dashboard render
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const findTarget = useCallback((stepIndex) => {
    const s = TOUR_STEPS[stepIndex];
    let el = document.querySelector(s.target);
    if (!el && s.fallbackTarget) {
      el = document.querySelector(s.fallbackTarget);
    }
    return el;
  }, []);

  const updatePosition = useCallback(() => {
    const el = findTarget(step);
    if (el) {
      const rect = getRect(el);
      setTargetRect(rect);
      // Scroll element into view
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setTargetRect(null);
    }
  }, [step, findTarget]);

  const completeTour = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setActive(false);
    onComplete?.();
  }, [onComplete]);

  // Position update + safety: auto-skip steps with missing targets
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      updatePosition();
      // Safety: if no target found after render, skip this step or complete tour
      const el = findTarget(step);
      if (!el) {
        if (step < TOUR_STEPS.length - 1) {
          setStep(step + 1);
        } else {
          completeTour();
        }
      }
    }, 300);
    window.addEventListener('resize', updatePosition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
    };
  }, [active, step, updatePosition, findTarget, completeTour]);

  // Escape key dismisses the tour
  useEffect(() => {
    if (!active) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') completeTour();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, completeTour]);

  const nextStep = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!active) return null;

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  const padding = 8;

  // Calculate tooltip position
  let tooltipStyle = {};
  if (targetRect) {
    const pos = currentStep.position || 'bottom';
    if (pos === 'bottom') {
      tooltipStyle = {
        top: targetRect.top + targetRect.height + padding + 12,
        left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 340)),
      };
    } else if (pos === 'top') {
      tooltipStyle = {
        top: targetRect.top - padding - 12,
        left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 340)),
        transform: 'translateY(-100%)',
      };
    }
  } else {
    // Center on screen if no target found
    tooltipStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      {/* Overlay with cutout - pointer-events:none so clicks pass through to page */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0"
          width="100%"
          height="200%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Highlight ring */}
      {targetRect && (
        <div
          className="absolute border-2 border-amber-400 rounded-xl pointer-events-none animate-pulse"
          style={{
            top: targetRect.top - padding,
            left: targetRect.left - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            boxShadow: '0 0 0 4px rgba(245, 158, 11, 0.2)',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute w-[320px] bg-[#1e293b] border border-white/20 rounded-2xl shadow-2xl p-5"
        style={{ ...tooltipStyle, pointerEvents: 'auto', zIndex: 10000 }}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-3">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-amber-500' : i < step ? 'w-3 bg-amber-500/50' : 'w-3 bg-white/20'
              }`}
            />
          ))}
          <span className="text-[10px] text-gray-500 ml-auto">{step + 1}/{TOUR_STEPS.length}</span>
        </div>

        <h3 className="text-white font-bold text-base mb-1.5">{currentStep.title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed mb-4">{currentStep.description}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={completeTour}
            className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={prevStep}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={nextStep}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-400 transition-colors"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Restart the dashboard tour (call from settings/help page).
 */
export function restartTour() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if tour has been completed.
 */
export function isTourComplete() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}
