// Tiered points & rewards system configuration
// Plans: free / lite / business (legacy pro → lite, enterprise → business).
import { normalizePlan } from './plans';

export const POINTS_PER_DOLLAR = 200;

export function pointsToDollars(points) {
  return Math.round((points / POINTS_PER_DOLLAR) * 100) / 100;
}

export function formatPointsAsDollars(points) {
  const dollars = pointsToDollars(points);
  return `$${dollars.toFixed(2)}`;
}

export const TIER_MULTIPLIERS = {
  free: 1.0,
  lite: 1.5,
  business: 2.0,
  pro: 1.5,
  enterprise: 2.0,
};

export const TIER_CAN_REDEEM = {
  free: false,
  lite: true,
  business: true,
  pro: true,
  enterprise: true,
};

export function tierMultiplier(tier) {
  return TIER_MULTIPLIERS[normalizePlan(tier)] || 1.0;
}

export const POINTS_ACTIONS = {
  DAILY_LOGIN: { base: 5, description: 'Daily check-in' },
  COMPLETE_PROFILE: { base: 50, description: 'Completed profile' },
  ADD_SERVICE: { base: 25, description: 'Added a service' },
  SEND_QUOTE: { base: 10, description: 'Sent a quote' },
  QUOTE_ACCEPTED: { base: 25, description: 'Quote accepted' },
  QUOTE_PAID: { base: 50, description: 'Quote paid' },
  CUSTOMER_REVIEW: { base: 50, description: '5-star review received' },
  REFERRAL_SIGNUP: { base: 500, description: 'Referral signed up' },
  REFERRAL_UPGRADE: { base: 1000, description: 'Referral upgraded to paid' },
  UPGRADE_PLAN: { base: 250, description: 'Upgraded subscription' },
  STREAK_7_DAYS: { base: 50, description: '7-day login streak' },
  STREAK_30_DAYS: { base: 200, description: '30-day login streak' },
  MILESTONE_10K: { base: 200, description: 'Reached $10K in quotes' },
  MILESTONE_50K: { base: 500, description: 'Reached $50K in quotes' },
  MILESTONE_100K: { base: 1000, description: 'Reached $100K in quotes' },
};

export function calculatePoints(action, tier) {
  const config = POINTS_ACTIONS[action];
  if (!config) return 0;
  const multiplier = tierMultiplier(tier);
  return Math.round(config.base * multiplier);
}

export function canRedeem(tier) {
  return TIER_CAN_REDEEM[normalizePlan(tier)] || false;
}

export function getTierLabel(tier) {
  const labels = { free: 'Free', lite: 'Lite', business: 'Business' };
  return labels[normalizePlan(tier)] || 'Free';
}

export function getTierMultiplierLabel(tier) {
  const m = tierMultiplier(tier);
  return m === 1.0 ? '' : `${m}x Points`;
}

// Tier hierarchy for reward access
const TIER_ORDER = ['free', 'lite', 'business'];

export function meetsMinTier(userTier, minTier) {
  return TIER_ORDER.indexOf(normalizePlan(userTier)) >= TIER_ORDER.indexOf(normalizePlan(minTier));
}
