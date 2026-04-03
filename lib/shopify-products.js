// Shopify product URLs and Stripe price IDs for subscription plans
export const SHOPIFY_PLANS = {
  pro: {
    shopifyUrl: 'https://shinyjets.com/products/shiny-jets-crm-pro-aircraft-detailing-business-software',
    stripePriceId: 'price_1TGnugCcQQZWc7n0Ge8tsTQC',
    price: 79,
    name: 'Shiny Jets CRM Pro'
  },
  business: {
    shopifyUrl: 'https://shinyjets.com/products/shiny-jets-crm-business-team-aircraft-detailing-software',
    stripePriceId: 'price_1TGnvHCcQQZWc7n0uEDAqRvb',
    price: 149,
    name: 'Shiny Jets CRM Business'
  },
  enterprise: {
    shopifyUrl: 'https://shinyjets.com/products/shiny-jets-crm-enterprise-white-label-aircraft-detailing-platform',
    stripePriceId: 'price_1TGnvhCcQQZWc7n0Cibeq0tN',
    price: 899,
    name: 'Shiny Jets CRM Enterprise'
  }
};

// Build Shopify checkout URL with customer email pre-filled
export function getShopifyUpgradeUrl(plan, email) {
  const base = SHOPIFY_PLANS[plan]?.shopifyUrl;
  if (!base) return null;
  const url = new URL(base);
  if (email) url.searchParams.set('email', email);
  return url.toString();
}

// Get Stripe price ID for a plan
export function getStripePriceId(plan) {
  return SHOPIFY_PLANS[plan]?.stripePriceId || null;
}

// Manage subscription URL
export const SHOPIFY_MANAGE_URL = 'https://shinyjets.com/account/subscriptions';
