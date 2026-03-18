"use client";
import { useEffect } from 'react';
import { applyFullTheme } from '@/lib/theme';

/**
 * Global theme initializer — renders in root layout Providers so the
 * detailer's brand theme applies on EVERY page, not just those wrapped
 * in AppShell. Reads from localStorage first (instant, no flash), then
 * fetches the latest branding from the server.
 */
export default function ThemeInit() {
  useEffect(() => {
    // 1. Instant apply from localStorage (no network, no flash)
    try {
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.theme_primary || u.portal_theme) {
          applyFullTheme(u.portal_theme || 'dark', u.theme_primary || '#C9A84C');
        }
      }
    } catch {}

    // 2. Fetch latest from server and re-apply if different
    const token = localStorage.getItem('vector_token');
    if (token) {
      fetch('/api/user/branding', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const mode = data.portal_theme || 'dark';
          const primary = data.theme_primary || '#C9A84C';
          applyFullTheme(mode, primary);
          // Update localStorage so next page load is instant
          try {
            const u = JSON.parse(localStorage.getItem('vector_user') || '{}');
            u.theme_primary = primary;
            u.portal_theme = mode;
            u.theme_logo_url = data.theme_logo_url || data.logo_url || null;
            localStorage.setItem('vector_user', JSON.stringify(u));
          } catch {}
        })
        .catch(() => {});
    }
  }, []);

  return null;
}
