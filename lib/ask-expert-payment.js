// Paid "Ask a Shiny Jets expert" button (Brett, Oct 3 2026): $4.99 buys exactly ONE question
// answered by a Shiny Jets expert. A follow-up needs a new payment.
//   * Only the detailer's own button tap is paid. When Detailing AI itself can't answer, the
//     automatic Ask Brett escalation (lib/ask-brett.js) stays FREE and unchanged.
//   * Tap -> confirm step showing $4.99 -> question saved as status 'awaiting_payment' (Brett is
//     NOT notified) -> Shopify cart permalink on shinyjets.com with the escalation id as a cart
//     attribute and a line-item property -> Shopify orders/paid webhook (HMAC-verified,
//     /api/webhooks/shopify) marks it 'open' and only then emails Brett + the admin queue.
//   * Unpaid questions expire after 24 h ('expired'; photos deleted) and never reach Brett.
//   * Until ASK_EXPERT_VARIANT_ID is set the button says "Coming soon" and sends nothing.
// Pure helpers only (no DB / network), so they're unit-tested in scripts/test-ask-expert-payment.mjs.

export const ASK_EXPERT_PRICE = '4.99';
export const ASK_EXPERT_PRICE_LABEL = '$4.99';
export const ASK_EXPERT_ONE_QUESTION = '$4.99 for one question answered by a Shiny Jets expert';
export const ASK_EXPERT_FOLLOW_UP = 'A follow-up question needs a new payment.';
export const PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;
export const ORDER_ATTRIBUTE = 'ask_expert_id';
export const DEFAULT_STORE_URL = 'https://shinyjets.com';
export const STATUS_AWAITING_PAYMENT = 'awaiting_payment';
export const STATUS_EXPIRED = 'expired';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isEscalationId = (v) => UUID.test(String(v || '').trim());

/** Shopify variant ids are numeric; anything else (unset, placeholder, gid) means "Coming soon". */
export function askExpertVariantId(env = process.env) {
  const raw = String(env?.ASK_EXPERT_VARIANT_ID || '').trim();
  const gid = raw.match(/^gid:\/\/shopify\/ProductVariant\/(\d+)$/);
  const id = gid ? gid[1] : raw;
  return /^\d{5,20}$/.test(id) ? id : null;
}

export function isAskExpertEnabled(env = process.env) {
  return !!askExpertVariantId(env);
}

export function storeUrl(env = process.env) {
  const s = String(env?.ASK_EXPERT_STORE_URL || DEFAULT_STORE_URL).trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+$/i.test(s) ? s : DEFAULT_STORE_URL;
}

/** Public config for the page (never exposes anything secret). */
export function askExpertConfig(env = process.env) {
  const enabled = isAskExpertEnabled(env);
  return { enabled, price: ASK_EXPERT_PRICE, price_label: ASK_EXPERT_PRICE_LABEL, status: enabled ? 'available' : 'coming_soon' };
}

export function paymentExpiry(now = Date.now()) {
  return new Date(now + PAYMENT_TTL_MS).toISOString();
}

/**
 * Shopify cart permalink: /cart/<variant>:1 straight to checkout. The escalation id rides as a
 * cart attribute (order note_attributes) AND a line-item property, so either survives.
 * Shopify permalinks can't redirect after payment, so the chat link is passed as an attribute
 * (visible on the order) and the page tells the detailer to come back to the chat.
 */
export function buildCheckoutUrl({ variantId, escalationId, email = '', returnUrl = '', store = DEFAULT_STORE_URL }) {
  if (!/^\d{5,20}$/.test(String(variantId || '')) || !isEscalationId(escalationId)) return null;
  const q = new URLSearchParams();
  q.append(`attributes[${ORDER_ATTRIBUTE}]`, escalationId);
  q.append(`properties[${ORDER_ATTRIBUTE}]`, escalationId);
  if (returnUrl && /^https?:\/\//.test(returnUrl)) q.append('attributes[ask_expert_return]', returnUrl);
  q.append('note', `Ask a Shiny Jets expert: one question (${escalationId})`);
  q.append('ref', 'detailing-ai-ask-expert');
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) q.append('checkout[email]', email);
  return `${String(store).replace(/\/+$/, '')}/cart/${variantId}:1?${q.toString()}`;
}

const pairs = (list) => (Array.isArray(list) ? list : []).map((p) => ({ name: String(p?.name ?? p?.key ?? ''), value: String(p?.value ?? '') }));

/**
 * From a Shopify orders/paid payload: the ONE escalation this order pays for, if any.
 * Needs a line item for the Ask-expert variant; the id comes from that line item's property,
 * else the cart attribute (note_attributes). One payment = one question, so only one id.
 */
export function askExpertFromOrder(payload, variantId) {
  if (!payload || !variantId) return null;
  const items = Array.isArray(payload.line_items) ? payload.line_items : [];
  const item = items.find((li) => String(li?.variant_id ?? '') === String(variantId));
  if (!item) return null;
  const prop = pairs(item.properties).find((p) => p.name === ORDER_ATTRIBUTE && isEscalationId(p.value));
  const attr = pairs(payload.note_attributes).find((p) => p.name === ORDER_ATTRIBUTE && isEscalationId(p.value));
  const id = (prop || attr)?.value?.trim().toLowerCase();
  if (!id) return { orderId: String(payload.id || ''), escalationId: null, error: 'no_escalation_id' };
  const financial = String(payload.financial_status || 'paid').toLowerCase();
  if (!['paid', 'partially_refunded'].includes(financial)) return { orderId: String(payload.id || ''), escalationId: id, error: `financial_status_${financial}` };
  return { orderId: String(payload.id || ''), orderName: payload.name ? String(payload.name) : null, escalationId: id, error: null };
}

/** Only these move to 'open' on payment. A late payment on an expired question is still honored. */
export function canMarkPaid(status) {
  return status === STATUS_AWAITING_PAYMENT || status === STATUS_EXPIRED;
}

export function isPaymentExpired(row, now = Date.now()) {
  if (!row || row.status !== STATUS_AWAITING_PAYMENT) return false;
  const t = new Date(row.payment_expires_at || 0).getTime();
  return Number.isFinite(t) && t > 0 && t <= now;
}

/** The detailer typed "talk to an expert" instead of using the button: point to the paid button. */
export function askExpertPointerText(enabled) {
  return enabled
    ? `To get a person on this, tap \u201cAsk a Shiny Jets expert\u201d below: ${ASK_EXPERT_ONE_QUESTION}.`
    : 'Paid questions to a Shiny Jets expert are coming soon. Until then, tell me more (aircraft, area, surface, what you see) and I\u2019ll keep helping.';
}
