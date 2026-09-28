// Pure decision helpers for Shopify → CRM plan grants (no Supabase / Next
// imports; unit-tested by scripts/test-crm-plan-grants.mjs).
//
// SKUs (per unit; quantity multiplies days):
//   SJ-CRM-FREE              → free
//   SJ-CRM-LITE              → lite      30 days
//   SJ-CRM-BUSINESS          → business  30 days
//   SJ-CRM-BUSINESS-YEARLY   → business  365 days
//   SJ-CRM-PRO        (legacy) → lite     30 days
//   SJ-CRM-ENTERPRISE (legacy) → business 30 days
//   PRICING-QUARTERLY (paid)  → ALSO Lite 90 days (stacked; never downgrades)
//   PRICING-MONTHLY           → Pricing Tool only (no CRM plan)
import { normalizePlan, planRank } from './plans';
import { isPricingSku } from './pricing-tool-access';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const CRM_SKUS = {
  'SJ-CRM-FREE': { plan: 'free', days: 0 },
  'SJ-CRM-LITE': { plan: 'lite', days: 30 },
  'SJ-CRM-BUSINESS': { plan: 'business', days: 30 },
  'SJ-CRM-BUSINESS-YEARLY': { plan: 'business', days: 365 },
  // Legacy SKUs (still accepted until Shopify products are updated)
  'SJ-CRM-PRO': { plan: 'lite', days: 30 },
  'SJ-CRM-ENTERPRISE': { plan: 'business', days: 30 },
};

export const QUARTERLY_LITE_SKU = 'PRICING-QUARTERLY';
export const QUARTERLY_LITE_DAYS = 90;

// Price fallback — only exact current (and legacy) list prices, ±$0.50.
// No wide ranges: a $79.95 Pricing Tool order must never read as a CRM plan.
const PRICE_POINTS = [
  { price: 39.95, plan: 'lite', days: 30 },
  { price: 89.95, plan: 'business', days: 30 },
  { price: 899, plan: 'business', days: 365 },
  { price: 79, plan: 'lite', days: 30 },       // legacy Pro $79
  { price: 149, plan: 'business', days: 30 },  // legacy Business $149
];

function priceFallback(price) {
  const p = parseFloat(price);
  if (!Number.isFinite(p)) return null;
  if (p === 0) return { plan: 'free', days: 0 };
  const hit = PRICE_POINTS.find((pt) => Math.abs(pt.price - p) <= 0.5);
  return hit ? { plan: hit.plan, days: hit.days } : null;
}

function isYearly(text) {
  return /\b(year|yearly|annual|annually|12[- ]?months?)\b/i.test(text || '');
}

// Resolve one Shopify line item to { plan, days, sku, source } or null.
export function resolveCrmLineItem(item) {
  if (!item) return null;
  if (isPricingSku(item.sku)) return null; // Pricing Tool SKUs are never CRM plans
  const sku = String(item.sku || '').toUpperCase().trim();
  const titleText = `${item.title || ''} ${item.variant_title || ''} ${item.name || ''}`;

  // 1. Exact SKU. The legacy Enterprise product was listed at $899; treat an
  //    annual-priced (>= $800) or annual-titled Enterprise line as a year.
  if (CRM_SKUS[sku]) {
    if (sku === 'SJ-CRM-ENTERPRISE' && (parseFloat(item.price) >= 800 || isYearly(titleText))) {
      return { plan: 'business', days: 365, sku, source: 'sku' };
    }
    return { ...CRM_SKUS[sku], sku, source: 'sku' };
  }

  // 2. Partial SKU (e.g. SJ-CRM-LITE-MONTHLY, SJ-CRM-BUSINESS-ANNUAL)
  if (sku.includes('SJ-CRM-')) {
    if (sku.includes('SJ-CRM-BUSINESS') && (sku.includes('YEAR') || sku.includes('ANNUAL'))) {
      return { ...CRM_SKUS['SJ-CRM-BUSINESS-YEARLY'], sku, source: 'sku_partial' };
    }
    for (const key of ['SJ-CRM-FREE', 'SJ-CRM-LITE', 'SJ-CRM-BUSINESS', 'SJ-CRM-ENTERPRISE', 'SJ-CRM-PRO']) {
      if (sku.includes(key)) {
        const def = CRM_SKUS[key];
        const yearly = def.plan === 'business' && isYearly(titleText);
        return { plan: def.plan, days: yearly ? 365 : def.days, sku, source: 'sku_partial' };
      }
    }
  }

  // 3. Title keywords (only for Shiny Jets CRM products). Free/starter first;
  //    word boundaries so "product"/"professional" never read as "pro".
  const title = titleText.toLowerCase();
  if (/\bcrm\b/.test(title)) {
    if (/\bfree\b/.test(title) || title.includes('starter')) return { plan: 'free', days: 0, sku, source: 'title' };
    if (/\b(business|enterprise)\b/.test(title)) {
      return { plan: 'business', days: isYearly(title) ? 365 : 30, sku, source: 'title' };
    }
    if (/\b(lite|pro)\b/.test(title)) return { plan: 'lite', days: 30, sku, source: 'title' };
  }

  // 4. Exact list-price fallback (only when the line item looks like a CRM item
  //    or carries no SKU at all).
  if (!sku || /\bcrm\b/.test(title)) {
    const hit = priceFallback(item.price);
    if (hit) return { ...hit, sku, source: 'price' };
  }
  return null;
}

// Highest plan on the order wins; days are summed for that plan (quantity ×).
export function crmPurchaseFromLineItems(lineItems) {
  let best = null;
  for (const item of lineItems || []) {
    const r = resolveCrmLineItem(item);
    if (!r) continue;
    const qty = Math.max(1, parseInt(item?.quantity, 10) || 1);
    const days = r.days * qty;
    if (!best || planRank(r.plan) > planRank(best.plan)) {
      best = { plan: r.plan, days, skus: [r.sku || null], source: r.source };
    } else if (r.plan === best.plan) {
      best.days += days;
      best.skus.push(r.sku || null);
    }
  }
  return best;
}

// Paid PRICING-QUARTERLY units on the order → Lite days (90 per unit).
export function quarterlyLiteDaysFromLineItems(lineItems) {
  let days = 0;
  for (const item of lineItems || []) {
    const sku = String(item?.sku || '').toUpperCase().trim();
    if (sku !== QUARTERLY_LITE_SKU) continue;
    const qty = Math.max(1, parseInt(item?.quantity, 10) || 1);
    days += QUARTERLY_LITE_DAYS * qty;
  }
  return days;
}

function toMs(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

const COMP_SOURCES = new Set(['comp_invite', 'course_bundle']);

export function isCompedDetailer(d) {
  if (!d) return false;
  return COMP_SOURCES.has(d.subscription_source) ||
    d.subscription_status === 'comped' ||
    d.subscription_status === 'complimentary';
}

// Does the detailer's current (non-free) plan still have time on it?
// null plan_expires_at = open-ended (paid legacy subscription or permanent comp).
export function planIsActive(d, now = new Date()) {
  if (!d) return false;
  if (normalizePlan(d.plan) === 'free') return false;
  if (d.subscription_status === 'cancelled' && !d.plan_expires_at) return false;
  const exp = toMs(d.plan_expires_at);
  return exp === null || exp > now.getTime();
}

// Decide the detailers update for a dated plan grant.
//   plan: target plan ('lite' | 'business'), days: > 0
// Rules:
//   • never downgrade while a higher plan is still active → mode 'skip_higher_plan'
//   • same plan with time left → stack onto plan_expires_at
//   • same plan, open-ended paid/comp (null expiry) → keep open-ended
//     (comps) or start dated billing (paid shopify renewals)
//   • upgrade / free / lapsed → plan = target, expires = now + days
// Returns { mode, update } where update may be null (no change).
export function computeCrmPlanGrant({ detailer, plan, days, now = new Date(), source = 'shopify' }) {
  const target = normalizePlan(plan);
  const nowMs = now.getTime();
  const current = normalizePlan(detailer?.plan);
  const active = planIsActive(detailer, now);
  const expMs = toMs(detailer?.plan_expires_at);

  if (target === 'free' || !days || days <= 0) {
    return { mode: 'noop', update: null };
  }

  if (active && planRank(current) > planRank(target)) {
    return { mode: 'skip_higher_plan', update: null };
  }

  if (active && current === target) {
    if (expMs === null) {
      if (isCompedDetailer(detailer)) return { mode: 'keep_open_ended_comp', update: null };
      if (source !== 'shopify') return { mode: 'keep_open_ended', update: null };
      // Paid Shopify subscriber on the pre-dated model: start the dated term now.
      return {
        mode: 'renew_start_dated',
        update: {
          plan: target,
          plan_expires_at: new Date(nowMs + days * DAY_MS).toISOString(),
          subscription_status: 'active',
        },
      };
    }
    return {
      mode: 'stack',
      update: {
        plan: target,
        plan_expires_at: new Date(Math.max(expMs, nowMs) + days * DAY_MS).toISOString(),
        subscription_status: 'active',
      },
    };
  }

  return {
    mode: active ? 'upgrade' : (current === 'free' ? 'grant' : 'reactivate'),
    update: {
      plan: target,
      plan_expires_at: new Date(nowMs + days * DAY_MS).toISOString(),
      subscription_status: 'active',
    },
  };
}

// Business → Pricing Tool: keep an ACTIVE app_access row through accessEnd
// without clobbering a longer existing row or another product's identity.
export function computeBusinessPricingAccess({ existing, email, orderId, accessEnd, now = new Date() }) {
  const nowISO = now.toISOString();
  const endMs = toMs(accessEnd);
  if (!endMs || endMs <= now.getTime()) return { mode: 'noop', row: null };
  const exEnd = toMs(existing?.access_end);
  const exActive = existing && existing.status === 'active' && exEnd && exEnd > now.getTime();

  if (exActive && exEnd >= endMs) return { mode: 'keep_longer', row: null };
  if (exActive) {
    return {
      mode: 'extend_preserve_type',
      row: {
        email,
        product_type: existing.product_type,
        shopify_order_id: existing.shopify_order_id ?? null,
        access_start: existing.access_start || nowISO,
        access_end: new Date(endMs).toISOString(),
        status: 'active',
        updated_at: nowISO,
      },
    };
  }
  return {
    mode: existing ? 'reactivate' : 'create',
    row: {
      email,
      product_type: 'crm_business',
      shopify_order_id: orderId ? String(orderId) : null,
      access_start: nowISO,
      access_end: new Date(endMs).toISOString(),
      status: 'active',
      updated_at: nowISO,
    },
  };
}

// Which product does a subscription webhook (cancel / update / billing
// attempt) belong to? Looks at every item array Seal / Shopify might send.
export function subscriptionItems(payload) {
  if (!payload) return [];
  for (const key of ['line_items', 'items', 'lines', 'subscription_lines', 'products']) {
    const v = payload[key];
    if (Array.isArray(v) && v.length) return v;
    if (v && Array.isArray(v.edges)) return v.edges.map((e) => e?.node).filter(Boolean);
  }
  return [];
}

export function classifySubscriptionItems(items) {
  const list = items || [];
  let crmPlan = null;
  let hasPricing = false;
  for (const it of list) {
    if (isPricingSku(it?.sku)) { hasPricing = true; continue; }
    const r = resolveCrmLineItem(it);
    if (r && (!crmPlan || planRank(r.plan) > planRank(crmPlan))) crmPlan = r.plan;
  }
  return {
    known: list.length > 0 && (hasPricing || !!crmPlan),
    hasCrm: !!crmPlan,
    crmPlan,
    hasPricing,
    pricingOnly: hasPricing && !crmPlan,
  };
}

// Decide what a CRM-affecting cancellation should do.
//   classification: output of classifySubscriptionItems (or null if unknown)
//   hasActivePricingRow: the email has an active monthly/quarterly app_access row
// Returns one of:
//   'ignore_pricing_only'   — cancelled product is the Pricing Tool
//   'ignore_unresolved'     — can't tell which product; Pricing sub exists → don't touch CRM
//   'ignore_comped'         — comp / course entitlement, cron handles dated expiry
//   'ignore_higher_plan'    — cancelled a lower CRM plan than the one they're on
//   'ignore_already_free'   — nothing to downgrade
//   'keep_until_expiry'     — paid through plan_expires_at; cron downgrades later
//   'downgrade_now'         — legacy open-ended subscription → free now
export function decideCancellation({ detailer, classification, hasActivePricingRow, now = new Date() }) {
  if (!detailer) return 'ignore_unresolved';
  const c = classification && classification.known ? classification : null;
  if (c && c.pricingOnly) return 'ignore_pricing_only';
  if (!c && hasActivePricingRow) return 'ignore_unresolved';
  if (isCompedDetailer(detailer)) return 'ignore_comped';
  const current = normalizePlan(detailer.plan);
  if (current === 'free') return 'ignore_already_free';
  if (c && c.crmPlan && planRank(c.crmPlan) < planRank(current)) return 'ignore_higher_plan';
  const exp = toMs(detailer.plan_expires_at);
  if (exp && exp > now.getTime()) return 'keep_until_expiry';
  return 'downgrade_now';
}

// Billing-attempt failure/success should only touch the CRM account when the
// subscription is (or could be) the CRM subscription.
export function billingAffectsCrm({ classification, hasActivePricingRow }) {
  const c = classification && classification.known ? classification : null;
  if (c) return c.hasCrm;
  return !hasActivePricingRow;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
