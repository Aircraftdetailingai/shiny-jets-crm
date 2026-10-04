// Which Shopify "Order payment" registration provisions? (see app/api/webhooks/shopify/route.js)
// /api/shopify/webhook = the original registration: full orders/paid processing (plans, course,
// Pricing Tool, accounts, emails) plus the ask-expert step.
// Anything else (the canonical /api/webhooks/shopify, registered Oct 3 2026 for the $4.99 expert
// question) = ask-expert step only, so one paid order is never provisioned twice.
export const PROVISIONING_PATH = '/api/shopify/webhook';

export function orderPaidMode(requestUrl) {
  let path = '';
  try {
    path = new URL(requestUrl).pathname.replace(/\/+$/, '');
  } catch {}
  return path === PROVISIONING_PATH ? 'full' : 'ask_expert_only';
}
