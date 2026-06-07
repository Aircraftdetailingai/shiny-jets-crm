// Plan-tier branding rules.
//
// Matrix per Brett's spec (2026-06-07 correction):
//   free       → Shiny Jets header, no "Powered by" footer (SJ is in header)
//   pro        → detailer logo + "Powered by Shiny Jets" footer
//   business   → detailer logo + "Powered by Shiny Jets" footer (same as pro)
//   enterprise → detailer logo, NO "Powered by" — full white-label
//
// Use getBranding() in any surface that renders the detailer's identity to
// a customer (quotes, invoices, change orders, delivery confirmations).

export function getBranding(detailer) {
  const plan = (detailer?.plan || 'free').toLowerCase();
  const isFree = plan === 'free';
  const isEnterprise = plan === 'enterprise';

  return {
    plan,
    isFree,
    isEnterprise,
    isWhiteLabel: isEnterprise,
    showShinyJetsHeader: isFree,
    showPoweredBy: plan === 'pro' || plan === 'business',
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
