// Standalone Detailing AI (sold on aircraftdetailing.ai through the Shiny Jets
// Shopify store) → per-email AI access on the CRM, without a CRM plan.
//
// Pure helpers only (no Supabase / Next imports): `node scripts/test-detailing-ai-access.mjs`.
//
// Shopify product "Aircraft Detailing AI" (product 15410802557113, created Oct 3 2026, draft until published):
//   variant 67640132174009 (Seal plan 5903843513) → 30 days per unit   ($59.95/mo)
//   variant 67640132206777 (Seal plan 5903876281) → 365 days per unit  ($599/yr)
// The variants have no SKU; SJ-AI-STANDALONE / SJ-AI-STANDALONE-YEARLY are honored if ever set,
// and a title / selling-plan-name fallback tells monthly from yearly (see aiTermForLineItem).
// Subscriptions renew through Seal Subscriptions; each paid renewal order fires orders/paid.
// Same dated model as CRM plans: every paid renewal order stacks days onto
// detailers.ai_access_until, so a cancelled subscription simply runs out.
import { hasFeature, planRank } from './plans.js';

export const AI_SKUS = {
  'SJ-AI-STANDALONE': { days: 30 },
  'SJ-AI-STANDALONE-YEARLY': { days: 365 },
};

// The live Shopify product (handle aircraft-detailing-ai). Its variants carry NO SKU,
// so the variant ID is the primary signal. Seal selling plans are a second ID signal.
export const AI_PRODUCT_IDS = new Set(['15410802557113']);
export const AI_VARIANTS = {
  '67640132174009': { days: 30, term: 'monthly' },  // $59.95/mo (Seal selling plan 5903843513)
  '67640132206777': { days: 365, term: 'yearly' },  // $599/yr  (Seal selling plan 5903876281)
};
export const AI_SELLING_PLANS = {
  '5903843513': { days: 30, term: 'monthly' },
  '5903876281': { days: 365, term: 'yearly' },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AI_TITLE = /\baircraft\s+detailing\s+ai\b|\bdetailing\s+ai\b/i;
const YEARLY_PRICE_MIN = 300; // $599/yr vs $59.95/mo: anything this high is the annual plan

function isYearly(text) {
  return /\b(year|years|yearly|annual|annually|12[- ]?months?|365[- ]?days?)\b|\/\s*(yr|year)\b/i.test(text || '');
}

function isMonthly(text) {
  return /\b(month|monthly|30[- ]?days?)\b|\/\s*mo\b/i.test(text || '');
}

// "67640132174009", 67640132174009, or "gid://shopify/ProductVariant/67640132174009" → "67640132174009"
function idOf(v) {
  if (v === null || v === undefined || v === '') return '';
  const m = String(v).match(/(\d+)\s*$/);
  return m ? m[1] : '';
}

function sellingPlanOf(item) {
  const sp = item?.selling_plan_allocation?.selling_plan || item?.selling_plan || null;
  return {
    id: idOf(sp?.id ?? item?.selling_plan_allocation?.selling_plan_id ?? item?.selling_plan_id),
    name: String(sp?.name || item?.selling_plan_name || ''),
  };
}

function propertiesText(item) {
  const props = item?.properties;
  if (!props) return '';
  const pairs = Array.isArray(props)
    ? props.map((p) => [p?.name, p?.value])
    : Object.entries(props);
  return pairs
    .filter(([k]) => !/terms/i.test(String(k || ''))) // "Terms accepted/version" must not read as a term length
    .map(([k, v]) => `${k || ''} ${v ?? ''}`)
    .join(' ');
}

export function isAiSku(sku) {
  return String(sku || '').toUpperCase().trim().startsWith('SJ-AI-');
}

// A line item is the standalone AI product when (any one is enough):
//   its variant ID is one of AI_VARIANTS, or its product ID is the AI product,
//   its SKU is SJ-AI-*, or
//   (no SKU) its title is "Aircraft Detailing AI" / "Detailing AI" and it is not a CRM item.
export function isAiLineItem(item) {
  if (!item) return false;
  if (AI_VARIANTS[idOf(item.variant_id)]) return true;
  if (AI_PRODUCT_IDS.has(idOf(item.product_id))) return true;
  if (isAiSku(item.sku)) return true;
  const sku = String(item.sku || '').trim();
  const title = `${item.title || ''} ${item.name || ''}`;
  return !sku && AI_TITLE.test(title) && !/\bcrm\b/i.test(title);
}

// Days per unit for one AI line item, plus which signal decided it.
// Order of trust: variant ID → SKU → selling plan ID → text (selling plan name,
// variant title, title/name, line-item properties) → price. A yearly signal from
// any ID-based source wins over a monthly one, so a yearly purchase never gets 30 days.
export function aiTermForLineItem(item) {
  if (!isAiLineItem(item)) return null;
  const sku = String(item.sku || '').toUpperCase().trim();
  const sp = sellingPlanOf(item);
  const idHits = [];
  const v = AI_VARIANTS[idOf(item.variant_id)];
  if (v) idHits.push({ days: v.days, source: 'variant_id' });
  if (AI_SKUS[sku]) idHits.push({ days: AI_SKUS[sku].days, source: 'sku' });
  else if (isAiSku(sku)) idHits.push({ days: (sku.includes('YEAR') || sku.includes('ANNUAL')) ? 365 : 30, source: 'sku' });
  const p = AI_SELLING_PLANS[sp.id];
  if (p) idHits.push({ days: p.days, source: 'selling_plan_id' });
  if (idHits.length) return idHits.reduce((a, b) => (b.days > a.days ? b : a));

  const planText = `${sp.name} ${item.variant_title || ''}`;
  const allText = `${planText} ${item.title || ''} ${item.name || ''} ${propertiesText(item)}`;
  if (isYearly(planText) || isYearly(allText)) return { days: 365, source: 'title' };
  if (isMonthly(planText) || isMonthly(allText)) return { days: 30, source: 'title' };
  const price = parseFloat(item.price);
  if (Number.isFinite(price) && price >= YEARLY_PRICE_MIN) return { days: 365, source: 'price' };
  return { days: 30, source: 'default' };
}

// Days of AI access on one order (quantity honored). null when none.
// Works the same for the first order and for Seal renewal orders (each renewal
// is a new paid order with the same variant, so it stacks another term).
export function aiPurchaseFromLineItems(lineItems) {
  let days = 0;
  const skus = [];
  const variants = [];
  const sources = [];
  for (const item of lineItems || []) {
    const term = aiTermForLineItem(item);
    if (!term) continue;
    const qty = Math.max(1, parseInt(item?.quantity, 10) || 1);
    days += term.days * qty;
    skus.push(String(item.sku || '').toUpperCase().trim() || null);
    variants.push(idOf(item.variant_id) || null);
    sources.push(term.source);
  }
  return days ? { days, skus, variants, sources } : null;
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

// ─── Who can use Detailing AI (Business-only since Oct 3 2026) ───
// 1. Business (incl. legacy enterprise) or admin: included.
// 2. Standalone buyers (aircraftdetailing.ai): ai_access_until in the future, any plan.
// 3. Grandfathered Lite: accounts that were paying for Lite before the change keep
//    it while they stay on Lite or higher (detailers.detailing_ai_grandfathered_at,
//    set once by supabase/migrations/20261004_detailing_ai_business_only.sql).
//
// `detailing_ai_grandfathered` is true / false, or null/undefined when unknown
// (column not migrated yet, or the client hasn't loaded plan-status). Unknown on a
// Lite account means the old rule (Lite includes AI), so deploying this before the
// migration never cuts off a paying Lite customer.
export function hasDetailingAiAccess(account, now = new Date()) {
  if (!account) return false;
  if (account.is_admin === true || account.isAdmin === true) return true;
  if (hasFeature(account.plan, 'detailingAi')) return true;
  if (hasStandaloneAi(account, now)) return true;
  if (planRank(account.plan) >= planRank('lite')) {
    const g = account.detailing_ai_grandfathered;
    if (g === true || g === null || g === undefined) return true;
  }
  return false;
}
