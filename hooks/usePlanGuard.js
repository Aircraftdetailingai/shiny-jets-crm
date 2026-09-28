"use client";
import { useEffect, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { normalizePlan, planRank, PLAN_NAMES } from '@/lib/plans';

// How often the hook will re-poll /api/user/plan-status while the tab is
// focused. 60s matches the spec; the debounce below (10s minimum between
// any two fetches) prevents focus/visibility/mount thrashing on top.
const POLL_INTERVAL_MS = 60 * 1000;
const MIN_FETCH_INTERVAL_MS = 10 * 1000;


function readStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('vector_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredUser(nextUser) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('vector_user', JSON.stringify(nextUser));
  } catch {}
}

// Mount exactly once. The hook is called from components/Sidebar.jsx which
// is rendered on every authenticated page, so every logged-in tab runs it.
export function usePlanGuard() {
  const { success } = useToast();
  const lastFetchRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;

    const refreshPlan = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastFetchRef.current < MIN_FETCH_INTERVAL_MS) return; // debounce
      if (inFlightRef.current) return; // dedupe concurrent triggers

      inFlightRef.current = true;
      lastFetchRef.current = now;

      try {
        const res = await fetch('/api/user/plan-status', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.status === 401) return; // not authenticated yet — silent skip
        if (!res.ok) {
          console.warn('[usePlanGuard] plan-status non-OK response:', res.status);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const stored = readStoredUser();
        if (!stored) return;

        // Legacy values (pro/enterprise) compare as lite/business.
        const previousPlan = normalizePlan(stored.plan);
        const nextPlan = normalizePlan(data.plan);
        const previousStamp = stored.plan_updated_at || null;
        const nextStamp = data.plan_updated_at || null;

        const planChanged = previousPlan !== nextPlan || stored.plan !== nextPlan;
        const stampChanged = previousStamp !== nextStamp;
        const statusChanged = stored.subscription_status !== data.subscription_status;

        if (!planChanged && !stampChanged && !statusChanged) return; // hot path: no re-render

        // Partial merge — preserve every other field (branding, theme, etc.)
        // that pages rely on from localStorage.
        const merged = {
          ...stored,
          plan: nextPlan,
          subscription_status: data.subscription_status,
          subscription_source: data.subscription_source,
          plan_updated_at: nextStamp,
        };
        writeStoredUser(merged);

        window.dispatchEvent(new CustomEvent('vector-user-updated', {
          detail: {
            plan: nextPlan,
            previousPlan,
            subscription_status: data.subscription_status,
            subscription_source: data.subscription_source,
          },
        }));

        // Toast only on a true upgrade — not on replays, status-only changes,
        // or downgrades (downgrades get an email + admin SMS already).
        const prevRank = planRank(previousPlan);
        const nextRank = planRank(nextPlan);
        if (planChanged && nextRank > prevRank) {
          const label = PLAN_NAMES[nextPlan] || nextPlan;
          try {
            success(`Your plan has been updated to ${label}. New features unlocked.`);
          } catch {}
        }
      } catch (err) {
        console.warn('[usePlanGuard] plan-status network error:', err?.message || err);
        // retry on next tick (focus/interval/visibility)
      } finally {
        inFlightRef.current = false;
      }
    };

    // Kick one off on mount.
    refreshPlan();

    const onFocus = () => { refreshPlan(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshPlan();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const intervalId = window.setInterval(() => {
      // Only poll while tab is in the foreground to avoid waking up
      // background tabs for a status that won't be seen anyway.
      if (document.visibilityState === 'visible') refreshPlan();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(intervalId);
    };
  }, [success]);
}

export default usePlanGuard;
