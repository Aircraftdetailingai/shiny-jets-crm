'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  MUST_CHANGE_PASSWORD_STORAGE_KEY,
  passwordChangeDecision,
  readTokenPasswordChangeFlag,
} from '@/lib/password-change';

// Sends a temp-password session back to /set-password on client navigations.
// Middleware does the same from the auth_token cookie. This covers a session
// that only exists in localStorage (the login cookie write can fail).
export default function PasswordChangeGuard() {
  const pathname = usePathname();

  useEffect(() => {
    let token = null;
    let flagged = false;
    try {
      token = localStorage.getItem('vector_token');
      flagged = localStorage.getItem(MUST_CHANGE_PASSWORD_STORAGE_KEY) === '1'
        || readTokenPasswordChangeFlag(token);
    } catch {
      return;
    }
    const decision = passwordChangeDecision({
      pathname,
      mustChangePassword: flagged,
      destination: 'document',
    });
    if (decision.type === 'redirect') {
      window.location.replace(decision.location);
    }
  }, [pathname]);

  return null;
}
