import { redirect } from 'next/navigation';

/**
 * Legacy /settings/integrations → /settings/connections.
 * Preserve OAuth/query params (gcal=, quickbooks=, stripe=, message=) so
 * success/error toasts on Connections still fire after redirects from
 * Google / QuickBooks / Stripe callbacks that still hit this old path.
 */
export default function IntegrationsRedirect({ searchParams }) {
  const qs = new URLSearchParams();
  if (searchParams && typeof searchParams === 'object') {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const v of value) qs.append(key, String(v));
      } else {
        qs.set(key, String(value));
      }
    }
  }
  const suffix = qs.toString();
  redirect(suffix ? `/settings/connections?${suffix}` : '/settings/connections');
}
