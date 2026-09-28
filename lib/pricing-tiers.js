// Pricing tiers for Shiny Jets CRM — thin compatibility layer over lib/plans.js
// (the single source of truth for the Free / Lite / Business model).
// Legacy plan values are aliased: pro → lite, enterprise → business.
import {
  normalizePlan,
  PLAN_PRICES,
  PLAN_PLATFORM_FEES,
  PLAN_MARKETING,
  FREE_QUOTES_PER_MONTH,
  hasFeature,
  quotesPerMonth,
} from './plans';

export const TIERS = {
  free: {
    name: 'Free',
    price: 0,
    quotesPerMonth: FREE_QUOTES_PER_MONTH,
    features: PLAN_MARKETING.free.features,
    stripePriceId: null,
  },
  lite: {
    name: 'Lite',
    price: PLAN_PRICES.lite.monthly,
    quotesPerMonth: Infinity,
    features: PLAN_MARKETING.lite.features,
    // Optional Stripe path (/api/upgrade). Shopify is the primary billing path.
    stripePriceId: process.env.STRIPE_PRICE_LITE || null,
  },
  business: {
    name: 'Business',
    price: PLAN_PRICES.business.monthly,
    annualPrice: PLAN_PRICES.business.yearly,
    quotesPerMonth: Infinity,
    features: PLAN_MARKETING.business.features,
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS_V2 || null,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_BUSINESS_YEARLY || null,
  },
};

// Platform fee by plan. Legacy keys kept so any direct lookup stays correct.
export const PLATFORM_FEES = {
  free: PLAN_PLATFORM_FEES.free,        // 5%
  lite: PLAN_PLATFORM_FEES.lite,        // 2%
  business: PLAN_PLATFORM_FEES.business, // 0%
  pro: PLAN_PLATFORM_FEES.lite,
  enterprise: PLAN_PLATFORM_FEES.business,
  starter: PLAN_PLATFORM_FEES.free,
};

export function platformFeeRate(plan) {
  return PLAN_PLATFORM_FEES[normalizePlan(plan)];
}

// Legacy per-plan defaults that were written into detailers.platform_fee_percent
// before the three-tier change. A stored value equal to the OLD default for the
// OLD plan value is not a deliberate override — it follows the new fee table.
// (Only legacy 'business' at 1% differs: new Business is 0%.)
const LEGACY_DEFAULT_FEE_PERCENT = { business: 1 };

// Resolve the per-transaction fee rate from a detailer row.
// detailer.platform_fee_percent (DB column) is a per-detailer override
// (comps); otherwise the plan-based table applies. Canonical source for
// Stripe application_fee_amount across all charge sites.
export function resolveFeeRate(detailer) {
  const rawPlan = String(detailer?.plan || 'free').toLowerCase().trim();
  const raw = detailer?.platform_fee_percent;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      if (LEGACY_DEFAULT_FEE_PERCENT[rawPlan] === n) return platformFeeRate(rawPlan);
      return n / 100;
    }
  }
  return platformFeeRate(rawPlan);
}

export function calculatePlatformFee(tier, amount) {
  const feeRate = platformFeeRate(tier);
  return Math.round(amount * feeRate * 100) / 100;
}

export function calculateUpgradeSavings(currentTier, targetTier, monthlyRevenue) {
  const cur = normalizePlan(currentTier);
  const tgt = normalizePlan(targetTier);
  const currentFee = platformFeeRate(cur);
  const targetFee = platformFeeRate(tgt);
  const currentMonthlyFees = monthlyRevenue * currentFee;
  const targetMonthlyFees = monthlyRevenue * targetFee;
  const tierPriceDiff = (TIERS[tgt]?.price || 0) - (TIERS[cur]?.price || 0);
  const netSavings = (currentMonthlyFees - targetMonthlyFees) - tierPriceDiff;
  return {
    currentMonthlyFees: Math.round(currentMonthlyFees * 100) / 100,
    targetMonthlyFees: Math.round(targetMonthlyFees * 100) / 100,
    feeReduction: Math.round((currentMonthlyFees - targetMonthlyFees) * 100) / 100,
    subscriptionIncrease: tierPriceDiff,
    netMonthlySavings: Math.round(netSavings * 100) / 100,
    breakevenRevenue: currentFee - targetFee > 0 ? tierPriceDiff / (currentFee - targetFee) : Infinity,
  };
}

export function getTier(tierName) {
  return TIERS[normalizePlan(tierName)] || TIERS.free;
}

// "Premium" = Business (legacy business/enterprise) or admin.
export function hasPremiumAccess(plan, isAdmin) {
  return isAdmin === true || normalizePlan(plan) === 'business';
}

export function getNextTier(currentTier) {
  const order = ['free', 'lite', 'business'];
  const i = order.indexOf(normalizePlan(currentTier));
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

export function canCreateQuote(tier, quotesThisMonth) {
  return quotesThisMonth < quotesPerMonth(tier);
}

export function getQuotesRemaining(tier, quotesThisMonth) {
  const limit = quotesPerMonth(tier);
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - quotesThisMonth);
}

export { hasFeature, normalizePlan };
