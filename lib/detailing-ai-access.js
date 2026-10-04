// Standalone Detailing AI (sold on aircraftdetailing.ai through the Shiny Jets
// Shopify store) → per-email AI access on the CRM, without a CRM plan.
//
// Pure helpers only (no Supabase / Next imports): `node scripts/test-detailing-ai-access.mjs`.
//
// Shopify product "Aircraft Detailing AI" (product 15410802557113, created Oct 3 2026, draft until published):
//   SJ-AI-STANDALONE          → 30 days of Detailing AI per unit   ($59.95/mo, variant 67640132174009)
//   SJ-AI-STANDALONE-YEARLY   → 365 days of Detailing AI per unit  ($599/yr, variant 67640132206777)
// Subscriptions renew through Seal Subscriptions; each paid renewal order fires orders/paid.
// Same dated model as CRM plans: every paid renewal order stacks days onto
// detailers.ai_access_until, so a cancelled subscription simply runs out.
export const AI_SKUS = {
  'SJ-AI-STANDALONE': { days: 30 },
  'SJ-AI-STANDALONE-YEARLY': { days: 365 },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AI_TITLE = /\baircraft\s+detailing\s+ai\b|\bdetailing\s+ai\b/i;

function isYearly(text) {
  return /\b(year|yearly|annual|annually|12[- ]?months?)\b/i.test(text || '');
}

export function isAiSku(sku) {
  return String(sku || '').toUpperCase().trim().startsWith('SJ-AI-');
}

// A line item is the standalone AI product when its SKU is SJ-AI-*, or (no SKU)
// its title is "Aircraft Detailing AI" / "Detailing AI" and it is not a CRM item.
export function isAiLineItem(item) {
  if (!item) return false;
  if (isAiSku(item.sku)) return true;
  const sku = String(item.sku || '').trim();
  const title = `${item.title || ''} ${item.name || ''}`;
  return !sku && AI_TITLE.test(title) && !/\bcrm\b/i.test(title);
}

// Days of AI access on one order (quantity honored). null when none.
export function aiPurchaseFromLineItems(lineItems) {
  let days = 0;
  const skus = [];
  for (const item of lineItems || []) {
    if (!isAiLineItem(item)) continue;
    const sku = String(item.sku || '').toUpperCase().trim();
    const titleText = `${item.title || ''} ${item.variant_title || ''} ${item.name || ''}`;
    let per = AI_SKUS[sku]?.days;
    if (!per) per = (sku.includes('YEAR') || sku.includes('ANNUAL') || isYearly(titleText)) ? 365 : 30;
    const qty = Math.max(1, parseInt(item?.quantity, 10) || 1);
    days += per * qty;
    skus.push(sku || null);
  }
  return days ? { days, skus } : null;
}

function toMs(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

// New ai_access_until: later(now, current) + days. Renewals stack, never reset.
export function computeAiAccessUntil({ current, days, now = new Date() }) {
  if (!days || days <= 0) return null;
  const base = Math.max(toMs(current) || 0, now.getTime());
  return new Date(base + days * DAY_MS).toISOString();
}

export function hasStandaloneAi(detailerOrUser, now = new Date()) {
  const until = toMs(detailerOrUser?.ai_access_until);
  return !!until && until > now.getTime();
}
