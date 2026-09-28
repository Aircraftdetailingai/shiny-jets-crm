// Per-plan feature gates (compat wrapper over lib/plans.js).
// Legacy plan values are aliased: pro → lite, enterprise → business.
import { normalizePlan, hasFeature } from './plans';

export function getPlanFeatures(detailer) {
  const plan = normalizePlan(detailer?.plan);
  return {
    plan,
    // Flight-hour tracking is not built; no plan advertises it.
    hasVFTracking: false,
    hasCustomEmailDomain: hasFeature(detailer, 'customEmailDomain'),
    isWhiteLabel: hasFeature(plan, 'whiteLabel'),
    // Public API is not built; kept false so nothing advertises it.
    hasApiAccess: false,
  };
}

export function hasVFTracking() {
  return false;
}
