// Pricing tiers configuration for Vector freemium model

export const TIERS = {
  free: {
    name: 'Free',
    price: 0,
    quotesPerMonth: 3,
    features: [
      'Up to 3 quotes/month',
      'Basic aircraft database',
      'Email support',
      '5% platform fee per job',
      'Shiny Jets branding on quotes',
    ],
    stripePriceId: null,
  },
  pro: {
    name: 'Pro',
    price: 79,
    annualPrice: 59,
    quotesPerMonth: Infinity,
    features: [
      'Unlimited quotes',
      'Full aircraft database',
      'Custom services',
      'Email notifications',
      'Remove Shiny Jets branding',
      'Priority support',
      '2% platform fee',
    ],
    stripePriceId: process.env.STRIPE_PRICE_PRO || 'price_1TGnugCcQQZWc7n0Ge8tsTQC',
    stripeAnnualPriceId: process.env.STRIPE_PRICE_PRO_ANNUAL,
  },
  business: {
    name: 'Business',
    price: 149,
    annualPrice: 112,
    quotesPerMonth: Infinity,
    features: [
      'Unlimited quotes',
      'Full aircraft database',
      'Custom services',
      'Email notifications',
      'Remove Shiny Jets branding',
      'Team management',
      'Priority support',
      '1% platform fee',
    ],
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS || 'price_1TGnvHCcQQZWc7n0uEDAqRvb',
    stripeAnnualPriceId: process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
  },
  enterprise: {
    name: 'Enterprise',
    price: 299,
    annualPrice: 224,
    quotesPerMonth: Infinity,
    features: [
      'Unlimited quotes',
      'Full aircraft database',
      'Custom services',
      'Email notifications',
      'Remove Shiny Jets branding',
      'Team management',
      'AI Sales Assistant',
      'API access',
      'Priority support',
      '0% platform fee',
    ],
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_1TGnvhCcQQZWc7n0Cibeq0tN',
    stripeAnnualPriceId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
};

// Platform fee percentages by tier
export const PLATFORM_FEES = {
  free: 0.05,       // 5% on free tier
  pro: 0.02,        // 2% on pro
  business: 0.01,   // 1% on business
  enterprise: 0.00, // 0% on enterprise
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
export function hasPremiumAccess(plan, isAdmin) {
  return plan === 'business' || plan === 'enterprise' || isAdmin === true;
}

// Get next tier for upgrades
export function getNextTier(currentTier) {
  const tierOrder = ['free', 'pro', 'business', 'enterprise'];
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
