// Detailer website URL helpers (detailers.website_url, entered in
// Settings → Branding and also used to pull fonts/colors for the theme).
//
// Used to send customers back to the detailer's own site after they submit
// the public intake form. Only http(s) URLs are allowed; a missing scheme
// gets https:// prepended. Anything else (javascript:, data:, mailto:, the
// 'manual' sentinel the branding settings store, credentials in the URL,
// hosts without a dot) is rejected so we never redirect somewhere unsafe.

/**
 * @param {string|null|undefined} raw
 * @returns {string|null} absolute http(s) URL, or null when unusable
 */
export function normalizeWebsiteUrl(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || /^manual$/i.test(s) || /\s/.test(s)) return null;
  if (s.startsWith('//')) s = `https:${s}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let url;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname;
  if (!host || !host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null;
  return url.href;
}

/** Homepage (origin + "/") of the detailer's website, or null. */
export function websiteHomepage(raw) {
  const href = normalizeWebsiteUrl(raw);
  if (!href) return null;
  return `${new URL(href).origin}/`;
}

/**
 * Where the intake thank-you page should send the customer, if anywhere.
 * No redirect when the detailer has no usable website, or when the form is
 * embedded in an iframe (the customer is already on the detailer's site).
 */
export function intakeRedirectTarget(detailer, { embedded = false } = {}) {
  if (embedded || !detailer) return null;
  const href = websiteHomepage(detailer.website_url);
  if (!href) return null;
  const label = String(detailer.company || detailer.name || '').trim() || new URL(href).hostname.replace(/^www\./, '');
  return { href, label };
}

export const INTAKE_REDIRECT_SECONDS = 5;
