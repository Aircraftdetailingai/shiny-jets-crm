// Plan-tier branding rules (three-tier model, see lib/plans.js):
//   free      → Shiny Jets header + logo, no detailer logo          5% fee
//   lite      → detailer logo + "Powered by Shiny Jets" footer       2% fee
//   business  → detailer logo, NO "Powered by" — full white-label    0% fee
// Legacy values alias: pro → lite, enterprise → business.
//
// Use getBranding() in any surface that renders the detailer's identity to
// a customer (quotes, invoices, change orders, delivery confirmations).
import { normalizePlan, PLAN_PLATFORM_FEES } from './plans';

export function getBranding(detailer) {
  const plan = normalizePlan(detailer?.plan);
  const isFree = plan === 'free';
  const isLite = plan === 'lite';
  const isBusiness = plan === 'business';

  return {
    plan,
    isFree,
    isLite,
    isPro: isLite, // legacy name
    isBusiness,
    isEnterprise: isBusiness, // legacy name
    isWhiteLabel: isBusiness,
    showShinyJetsHeader: isFree,
    showPoweredBy: isLite,
    headerName: isFree ? 'Shiny Jets' : (detailer?.company || detailer?.name || 'Shiny Jets'),
    logoUrl: isFree
      ? null
      : (detailer?.logo_url || detailer?.logo_dark_url || detailer?.logo_light_url || null),
  };
}

// Plan → default platform fee percent (matches lib/plans PLAN_PLATFORM_FEES)
export const PLAN_DEFAULT_FEE_PERCENT = {
  free: PLAN_PLATFORM_FEES.free * 100,
  lite: PLAN_PLATFORM_FEES.lite * 100,
  business: PLAN_PLATFORM_FEES.business * 100,
  pro: PLAN_PLATFORM_FEES.lite * 100,
  enterprise: PLAN_PLATFORM_FEES.business * 100,
};

export function defaultFeePercentForPlan(plan) {
  return PLAN_PLATFORM_FEES[normalizePlan(plan)] * 100;
}
