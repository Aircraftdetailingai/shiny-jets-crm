"use client";
import { useEffect } from 'react';

// Global session-expiry guard. The app issues custom 30-day JWTs (lib/auth.js);
// when one expires, API routes answer 401. Historically ~most authenticated
// client pages just rendered empty data or stray "not authorized" text on that
// 401 instead of re-authing. This wraps window.fetch once (mounted from the
// root layout) and turns any authenticated-session 401 into a clean redirect to
// the login page, killing that whole class of broken-page states.
//
// It fires ONLY when every condition holds, so it never touches flows that
// legitimately 401:
//   - the response is same-origin AND under /api/*        (our own API only)
//   - status === 401
//   - a vector_token exists in localStorage               (an authenticated
//     detailer session — NOT the crew portal, which uses crew_token, and NOT
//     public share pages, which carry no token)
//   - the URL is NOT under /api/auth/                      (login/signup 401 on
//     bad credentials — that's expected, leave it alone)
// Anything else passes through completely untouched.
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
        const urlStr = typeof input === 'string'
          ? input
          : (input instanceof Request ? input.url : String(input));
        const url = new URL(urlStr, window.location.origin);

        const isSameOriginApi =
          url.origin === window.location.origin && url.pathname.startsWith('/api/');
        const isAuthRoute = url.pathname.startsWith('/api/auth/');

        if (
          res.status === 401 &&
          isSameOriginApi &&
          !isAuthRoute &&
          localStorage.getItem('vector_token')
        ) {
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
