// Copy-paste snippets for Settings → Share & Embed (formerly "Developer").
// Pure functions so they can be unit-tested (scripts/test-share-snippets.mjs).

export const DEFAULT_APP_URL = 'https://crm.shinyjets.com';
// Brand blue. White text on it is 4.65:1 (WCAG AA for normal text);
// the hover shade is 5.91:1.
export const QUOTE_BUTTON_COLOR = '#007CB1';
export const QUOTE_BUTTON_HOVER = '#006A9E';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanBase(appUrl) {
  const s = String(appUrl || '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+$/i.test(s) ? s : DEFAULT_APP_URL;
}

// Identifier used in /request/<id>: the detailer's slug, else their id
// (/api/detailers/resolve accepts both). Never guessed from the company name.
export function requestIdentifier(detailer) {
  const slug = String(detailer?.slug || '').trim();
  if (/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return slug;
  const id = String(detailer?.id || '').trim();
  return id || null;
}

export function publicRequestUrl(appUrl, detailer) {
  const id = requestIdentifier(detailer);
  if (!id) return null;
  return `${cleanBase(appUrl)}/request/${encodeURIComponent(id)}`;
}

export function embedCode(appUrl, detailer) {
  const url = publicRequestUrl(appUrl, detailer);
  if (!url) return null;
  const company = String(detailer?.company || detailer?.name || '').trim();
  const title = company ? `Request a quote from ${company}` : 'Request a quote';
  return `<iframe src="${escapeHtml(url)}?embed=1" title="${escapeHtml(title)}" width="100%" height="800" loading="lazy" style="border:none;max-width:100%;"></iframe>`;
}

// Sticky Request a Quote button: a plain HTML link + CSS that floats in the
// corner of the detailer's own website and opens their quote form.
// No script, so it works on site builders that strip <script>.
// position: 'right' | 'left'
export function stickyQuoteButtonSnippet(appUrl, detailer, { position = 'right', label = 'Request a Quote' } = {}) {
  const url = publicRequestUrl(appUrl, detailer);
  if (!url) return null;
  const side = position === 'left' ? 'left' : 'right';
  const text = escapeHtml(String(label || '').trim() || 'Request a Quote');
  return [
    '<!-- Sticky Request a Quote button (Shiny Jets CRM) -->',
    '<style>',
    `.sj-quote-btn{position:fixed;${side}:max(16px,env(safe-area-inset-${side}));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:12px 22px;border-radius:999px;background:${QUOTE_BUTTON_COLOR};color:#fff;font:600 16px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.25)}`,
    `.sj-quote-btn:hover{background:${QUOTE_BUTTON_HOVER};color:#fff}`,
    '.sj-quote-btn:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #0D1B2A}',
    '.sj-quote-btn svg{width:20px;height:20px;flex-shrink:0}',
    '@media print{.sj-quote-btn{display:none}}',
    '</style>',
    `<a class="sj-quote-btn" href="${escapeHtml(url)}">`,
    '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M9 12h6M9 16h6M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>',
    `  <span>${text}</span>`,
    '</a>',
  ].join('\n');
}

// AI chat bubble (alternative to the sticky button): loads /ai-chat.js,
// which shows a "Questions?" bubble that answers from the shop's FAQs.
export function aiChatSnippet(appUrl, detailer, { position = 'right' } = {}) {
  const id = requestIdentifier(detailer);
  if (!id) return null;
  const pos = position === 'left' ? ' data-position="left"' : '';
  return [
    '<!-- AI chat bubble (Shiny Jets CRM): answers from your FAQs -->',
    `<script src="${escapeHtml(cleanBase(appUrl))}/ai-chat.js" data-account="${escapeHtml(id)}"${pos} async></script>`,
  ].join('\n');
}
