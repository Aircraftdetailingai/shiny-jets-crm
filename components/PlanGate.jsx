"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from './AppShell.jsx';
import {
  hasFeature, normalizePlan, requiredPlanFor, upgradeUrlFor, upgradeMessage,
  PLAN_NAMES, PLAN_MARKETING, FEATURE_LABELS, STANDALONE_AI,
} from '@/lib/plans';
import { hasDetailingAiAccess } from '@/lib/detailing-ai-access';

export function readStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('vector_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Client-side plan check. The server enforces the same gates (lib/plan-gate.js);
// this only decides whether to show the page or an upgrade prompt.
export function userHasFeature(user, feature) {
  if (!user) return true; // not signed in — let the page's own auth redirect run
  if (user.is_admin) return true;
  // Team members signed into the owner's CRM inherit the owner's plan; the
  // server is authoritative for them.
  if (user.detailer_id && user.id && user.detailer_id !== user.id) return true;
  // Detailing AI: Business, standalone buyers (aircraftdetailing.ai) and grandfathered Lite.
  if (feature === 'detailingAi') return hasDetailingAiAccess(user);
  return hasFeature(normalizePlan(user.plan), feature);
}

// The stored user may not show current Detailing AI access yet: standalone
// (detailers.ai_access_until, bought after login) or grandfathered Lite status.
// Ask the server once before showing an upgrade prompt for Detailing AI.
async function refreshDetailingAiAccess() {
  try {
    const res = await fetch('/api/user/plan-status', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    const stored = readStoredUser();
    if (!stored) return false;
    const merged = {
      ...stored,
      ...(data?.plan ? { plan: normalizePlan(data.plan) } : {}),
      ai_access_until: data?.ai_access_until || null,
      detailing_ai_grandfathered: data?.detailing_ai_grandfathered ?? null,
    };
    window.localStorage.setItem('vector_user', JSON.stringify(merged));
    return hasDetailingAiAccess(merged);
  } catch {
    return false;
  }
}

export function usePlanFeature(feature) {
  const [state, setState] = useState({ ready: false, allowed: true, plan: 'free' });
  useEffect(() => {
    let cancelled = false;
    let verified = false;
    const check = () => {
      const u = readStoredUser();
      const allowed = userHasFeature(u, feature);
      if (!allowed && feature === 'detailingAi' && !verified) {
        verified = true;
        refreshDetailingAiAccess().then(() => { if (!cancelled) check(); });
        return; // stay "not ready" (blank shell) until the server answers
      }
      setState({ ready: true, allowed, plan: normalizePlan(u?.plan) });
    };
    check();
    window.addEventListener('vector-user-updated', check);
    window.addEventListener('storage', check);
    return () => {
      cancelled = true;
      window.removeEventListener('vector-user-updated', check);
      window.removeEventListener('storage', check);
    };
  }, [feature]);
  return state;
}

export function UpgradePrompt({ feature, compact = false, className = '' }) {
  const req = requiredPlanFor(feature);
  const tier = PLAN_MARKETING[req] || PLAN_MARKETING.lite;
  const href = upgradeUrlFor(feature);
  if (compact) {
    return (
      <div className={`rounded-lg border border-v-gold/30 bg-v-gold/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
        <p className="text-sm text-v-text-secondary flex-1">{upgradeMessage(feature)}</p>
        <Link href={href} className="inline-flex items-center justify-center min-h-[44px] px-4 rounded bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim transition-colors whitespace-nowrap">
          See {PLAN_NAMES[req]} plan
        </Link>
        {feature === 'detailingAi' && (
          <a href={STANDALONE_AI.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center min-h-[44px] px-4 rounded border border-v-gold/60 text-v-text-primary text-xs font-semibold uppercase tracking-widest hover:bg-v-gold/10 transition-colors whitespace-nowrap">
            AI only — {STANDALONE_AI.priceLabel}<span className="sr-only"> (opens aircraftdetailing.ai in a new tab)</span>
          </a>
        )}
      </div>
    );
  }
  return (
    <div className={`max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-16 ${className}`}>
      <div className="rounded-xl border border-v-gold/30 bg-white/[0.03] p-6 sm:p-8 text-center">
        <p className="text-[10px] uppercase tracking-widest text-v-gold mb-2">{PLAN_NAMES[req]} feature</p>
        <h2 className="text-xl sm:text-2xl font-light text-v-text-primary mb-3">{FEATURE_LABELS[feature] || 'Upgrade required'}</h2>
        <p className="text-sm text-v-text-secondary mb-6">{upgradeMessage(feature)}</p>
        <ul className="text-left text-sm text-v-text-secondary space-y-1.5 mb-6 max-w-sm mx-auto">
          {tier.features.slice(1, 7).map((f) => (
            <li key={f} className="flex gap-2"><span className="text-v-gold">&#10003;</span><span>{f}</span></li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={href} className="inline-flex items-center justify-center min-h-[44px] px-6 rounded bg-v-gold text-v-charcoal text-sm font-semibold hover:bg-v-gold-dim transition-colors">
            Upgrade to {PLAN_NAMES[req]} — {tier.priceLabel}{tier.cadence}
          </Link>
          {feature === 'detailingAi' && (
            <a href={STANDALONE_AI.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center min-h-[44px] px-6 rounded border border-v-gold/60 text-v-text-primary text-sm font-semibold hover:bg-v-gold/10 transition-colors">
              Get Detailing AI only — {STANDALONE_AI.priceLabel}<span className="sr-only"> (opens aircraftdetailing.ai in a new tab)</span>
            </a>
          )}
          <Link href="/dashboard" className="inline-flex items-center justify-center min-h-[44px] px-6 rounded border border-v-border text-v-text-secondary text-sm hover:text-v-text-primary transition-colors">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

// Segment-layout wrapper: shows the page when the plan includes `feature`,
// otherwise an upgrade prompt inside the normal app shell.
export default function PlanGate({ feature, title, children }) {
  const { ready, allowed } = usePlanFeature(feature);
  if (!ready) {
    return <div className="min-h-screen bg-v-charcoal" aria-busy="true" />;
  }
  if (!allowed) {
    return (
      <AppShell title={title}>
        <UpgradePrompt feature={feature} />
      </AppShell>
    );
  }
  return children;
}
