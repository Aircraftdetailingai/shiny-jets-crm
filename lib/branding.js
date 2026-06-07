// Plan-tier branding rules.
//
// FINAL matrix per Brett (2026-06-07, third correction — Business now white-label):
//   free       → Shiny Jets header + logo,    5% fee
//   pro        → detailer logo + "Powered by Shiny Jets" footer,  2% fee
//   business   → detailer logo, NO "Powered by" — white-label,    1% fee
//   enterprise → detailer logo, NO "Powered by" — white-label,    0% fee
//
// The only customer-visible difference between business and enterprise is
// the platform fee (1% vs 0%); future VF tracking is enterprise-only.
//
// Use getBranding() in any surface that renders the detailer's identity to
// a customer (quotes, invoices, change orders, delivery confirmations).

export function getBranding(detailer) {
  const plan = (detailer?.plan || 'free').toLowerCase();
  const isFree = plan === 'free';
  const isPro = plan === 'pro';
  const isBusiness = plan === 'business';
  const isEnterprise = plan === 'enterprise';

  return {
    plan,
    isFree,
    isPro,
    isBusiness,
    isEnterprise,
    isWhiteLabel: isBusiness || isEnterprise,
    showShinyJetsHeader: isFree,
    showPoweredBy: isPro,
    headerName: isFree ? 'Shiny Jets' : (detailer?.company || detailer?.name || 'Shiny Jets'),
    logoUrl: isFree
      ? null
      : (detailer?.logo_url || detailer?.logo_dark_url || detailer?.logo_light_url || null),
  };
}

// Plan → default platform fee percent (matches lib/pricing-tiers PLATFORM_FEES)
export const PLAN_DEFAULT_FEE_PERCENT = {
  free: 5.0,
  pro: 2.0,
  business: 1.0,
  enterprise: 0.0,
};

export function defaultFeePercentForPlan(plan) {
  const key = (plan || 'free').toLowerCase();
  return PLAN_DEFAULT_FEE_PERCENT[key] ?? PLAN_DEFAULT_FEE_PERCENT.free;
}
