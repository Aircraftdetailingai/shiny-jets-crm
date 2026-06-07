'use client';
import { useEffect } from 'react';

// Rewrites the <link rel="manifest"> and <link rel="apple-touch-icon"> hrefs
// on mount so enterprise-tier detailers get their own logo when they "Add
// to Home Screen." Free/Pro/Business keep the static Shiny Jets icons.
//
// The plan check is enforced server-side by /manifest.webmanifest using the
// detailer id from the query param — passing an id here only opens the
// possibility of a custom manifest; the server still gates on plan='enterprise'
// AND a real logo URL.
export default function BrandedHomescreen() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem('vector_user');
      const user = stored ? JSON.parse(stored) : null;
      if (!user?.id || (user.plan !== 'business' && user.plan !== 'enterprise')) return;

      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        manifestLink.href = `/manifest.webmanifest?d=${encodeURIComponent(user.id)}`;
      }

      // Fetch the canonical logo from the server (vector_user may be stale
      // or lack logo_url). If a logo exists, point apple-touch-icon to it.
      const token = localStorage.getItem('vector_token');
      if (!token) return;
      fetch('/api/detailers/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const detailer = data?.detailer || data;
          if (!detailer || (detailer.plan !== 'business' && detailer.plan !== 'enterprise')) return;
          const logo = detailer.logo_url || detailer.logo_dark_url || detailer.logo_light_url;
          if (!logo) return;
          document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(el => { el.href = logo; });
        })
        .catch(() => {});
    } catch {
      // localStorage / DOM access failures are non-critical — fall back to
      // the static Shiny Jets icons that ship in the head.
    }
  }, []);

  return null;
}
