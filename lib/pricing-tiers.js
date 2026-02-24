// Pricing tiers configuration for Vector freemium model

export const TIERS = {
  free: {
    name: 'Free',
    price: 0,
    quotesPerMonth: 5,
    features: [
      'Up to 5 quotes/month',
      'Basic aircraft database',
      'Email support',
      '10% platform fee per job',
    ],
    stripePriceId: null,
  },
  starter: {
    name: 'Starter',
    price: 29.95,
    quotesPerMonth: 25,
    features: [
      'Up to 25 quotes/month',
      'Full aircraft database',
      'Custom services',
      'Email support',
    ],
    stripePriceId: process.env.STRIPE_PRICE_STARTER,
  },
  pro: {
    name: 'Pro',
    price: 49.95,
    quotesPerMonth: 100,
    features: [
      'Up to 100 quotes/month',
      'Full aircraft database',
      'Custom services',
      'SMS alerts to you',
      'Priority support',
    ],
    stripePriceId: process.env.STRIPE_PRICE_PRO,
  },
  business: {
    name: 'Business',
    price: 79.95,
    quotesPerMonth: Infinity,
    features: [
      'Unlimited quotes',
      'Full aircraft database',
      'Custom services',
      'SMS alerts to you',
      'SMS to clients',
      'Priority support',
      'API access',
    ],
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS,
  },
  enterprise: {
    name: 'Enterprise',
    price: 0,
    quotesPerMonth: Infinity,
    features: [
      'Unlimited quotes',
      'Full aircraft database',
      'Custom services',
      'SMS alerts to you',
      'SMS to clients',
      'Priority support',
      'API access',
      'Admin access',
    ],
    stripePriceId: null,
  },
};

// Platform fee percentages by tier
export const PLATFORM_FEES = {
  free: 0.10,      // 10% on free tier
  starter: 0.03,   // 3% on starter
  pro: 0.02,       // 2% on pro
  business: 0.01,  // 1% on business
  enterprise: 0.01, // 1% on enterprise
};

// Calculate platform fee for a transaction
export function calculatePlatformFee(tier, amount) {
  const feeRate = PLATFORM_FEES[tier] || PLATFORM_FEES.free;
  return Math.round(amount * feeRate * 100) / 100; // Round to cents
}

// Calculate monthly savings from upgrading
export function calculateUpgradeSavings(currentTier, targetTier, monthlyRevenue) {
  const currentFee = PLATFORM_FEES[currentTier] || PLATFORM_FEES.free;
  const targetFee = PLATFORM_FEES[targetTier] || PLATFORM_FEES.free;

  const currentMonthlyFees = monthlyRevenue * currentFee;
  const targetMonthlyFees = monthlyRevenue * targetFee;
  const tierPriceDiff = (TIERS[targetTier]?.price || 0) - (TIERS[currentTier]?.price || 0);

  // Net savings = fee reduction - subscription cost increase
  const netSavings = (currentMonthlyFees - targetMonthlyFees) - tierPriceDiff;

  return {
    currentMonthlyFees: Math.round(currentMonthlyFees * 100) / 100,
    targetMonthlyFees: Math.round(targetMonthlyFees * 100) / 100,
    feeReduction: Math.round((currentMonthlyFees - targetMonthlyFees) * 100) / 100,
    subscriptionIncrease: tierPriceDiff,
    netMonthlySavings: Math.round(netSavings * 100) / 100,
    breakevenRevenue: tierPriceDiff / (currentFee - targetFee),
  };
}

// Get tier by name
export function getTier(tierName) {
  return TIERS[tierName] || TIERS.free;
}

// Check if a plan has premium (business-level) access
export function hasPremiumAccess(plan) {
  return plan === 'business' || plan === 'enterprise';
}

// Get next tier for upgrades
export function getNextTier(currentTier) {
  const tierOrder = ['free', 'starter', 'pro', 'business'];
  const currentIndex = tierOrder.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex >= tierOrder.length - 1) {
    return null;
  }
  return tierOrder[currentIndex + 1];
}

// Check if user can create more quotes this month
export function canCreateQuote(tier, quotesThisMonth) {
  const tierConfig = getTier(tier);
  return quotesThisMonth < tierConfig.quotesPerMonth;
}

// Get quotes remaining this month
export function getQuotesRemaining(tier, quotesThisMonth) {
  const tierConfig = getTier(tier);
  if (tierConfig.quotesPerMonth === Infinity) return Infinity;
  return Math.max(0, tierConfig.quotesPerMonth - quotesThisMonth);
}
