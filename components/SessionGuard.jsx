"use client";
import { useEffect } from 'react';
import { crmSessionExpired } from '@/lib/session-expiry';

// Global session-expiry guard. The app issues custom 30-day JWTs (lib/auth.js);
// when one expires, API routes answer 401. This wraps window.fetch once
// (mounted from the root layout) and turns that 401 into a login redirect.
//
// It fires only when the request presented the CRM bearer token and the
// server rejected that token. A 401 from the customer portal, vendor app,
// crew app, or a cookie-only poll is not a CRM logout — those used to wipe
// vector_token and bounce people to /login?expired=1 during normal navigation.
export default function SessionGuard() {
  useEffect(() => {
    // Guard against double-installation (e.g. Strict Mode remounts) so we never
    // wrap an already-wrapped fetch and stack behavior.
    if (typeof window === 'undefined' || window.__sessionGuardInstalled) return;
    window.__sessionGuardInstalled = true;

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const res = await originalFetch.apply(this, args);
      try {
        const input = args[0];
        const init = args[1] || {};
        const urlStr = typeof input === 'string'
          ? input
          : (input instanceof Request ? input.url : String(input));
        const url = new URL(urlStr, window.location.origin);
        if (url.origin !== window.location.origin) return res;

        const headerBag = input instanceof Request ? input.headers : null;
        const initHeaders = new Headers(init.headers || undefined);
        const authorization = initHeaders.get('authorization')
          || headerBag?.get?.('authorization')
          || '';
        const crmToken = localStorage.getItem('vector_token') || '';

        if (crmSessionExpired({
          status: res.status,
          pathname: url.pathname,
          authorization,
          crmToken,
        })) {
          localStorage.removeItem('vector_token');
          localStorage.removeItem('vector_user');
          // Already on /login: just clear, don't redirect into a loop.
          if (window.location.pathname !== '/login') {
            window.location.href = '/login?expired=1';
          }
        }
      } catch {
        // URL parsing / storage access must never break the original fetch.
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
      window.__sessionGuardInstalled = false;
    };
  }, []);

  return null;
}
