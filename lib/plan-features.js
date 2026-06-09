// Per-plan feature gates. Single source of truth for "does this detailer
// have access to feature X" checks. Keep flags pure (no side effects) and
// derive from the detailer row alone so they're safe in both server and
// client code.

export function getPlanFeatures(detailer) {
  const plan = (detailer?.plan || 'free').toLowerCase();
  return {
    plan,

    // Verified Finish flight-hour tracking — FlightAware/FAA integration
    // (not yet built, this flag reserves the gate so the integration code
    // only needs to flip behavior, not search call sites).
    hasVFTracking: plan === 'enterprise',

    // Custom email sending domain (Resend Domains API). Business and
    // Enterprise can configure their own sending domain. Free/Pro see an
    // upsell.
    hasCustomEmailDomain: plan === 'business' || plan === 'enterprise',

    // White-label rule (Business + Enterprise — Business was moved into
    // white-label per Brett's 2026-06-07 third correction).
    isWhiteLabel: plan === 'business' || plan === 'enterprise',

    // API access is reserved for Business and Enterprise tiers.
    hasApiAccess: plan === 'business' || plan === 'enterprise',
  };
}

export function hasVFTracking(detailer) {
  return (detailer?.plan || '').toLowerCase() === 'enterprise';
}
