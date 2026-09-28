// Shopify product URLs for the three CRM plans (Free / Lite / Business).
// URLs can be overridden per environment once the Shopify products are
// updated (see scripts/update-shopify-products.js + SHOPIFY-PRODUCT-COPY.md).
// Lite keeps the existing "-crm-pro" product handle, which the product script
// renames to "Shiny Jets CRM — Lite" without breaking existing links.
import { PLAN_PRICES, normalizePlan } from './plans';

const LITE_URL = process.env.NEXT_PUBLIC_SHOPIFY_LITE_URL
  || 'https://shinyjets.com/products/aircraft-detailing-crm-pro';
const BUSINESS_URL = process.env.NEXT_PUBLIC_SHOPIFY_BUSINESS_URL
  || 'https://shinyjets.com/products/aircraft-detailing-crm-business';
// The legacy $899 "Enterprise" product is repurposed as "Business (Annual)" by
// scripts/update-shopify-products.js, keeping its handle so links keep working.
const BUSINESS_YEARLY_URL = process.env.NEXT_PUBLIC_SHOPIFY_BUSINESS_YEARLY_URL
  || 'https://shinyjets.com/products/aircraft-detailing-crm-enterprise';

export const SHOPIFY_PLANS = {
  lite: {
    shopifyUrl: LITE_URL,
    sku: 'SJ-CRM-LITE',
    price: PLAN_PRICES.lite.monthly,
    interval: 'month',
    name: 'Shiny Jets CRM Lite',
  },
  business: {
    shopifyUrl: BUSINESS_URL,
    sku: 'SJ-CRM-BUSINESS',
    price: PLAN_PRICES.business.monthly,
    interval: 'month',
    name: 'Shiny Jets CRM Business',
  },
  business_yearly: {
    shopifyUrl: BUSINESS_YEARLY_URL,
    sku: 'SJ-CRM-BUSINESS-YEARLY',
    price: PLAN_PRICES.business.yearly,
    interval: 'year',
    name: 'Shiny Jets CRM Business (Annual)',
  },
};

function planKey(plan) {
  if (plan === 'business_yearly' || plan === 'business-yearly') return 'business_yearly';
  return normalizePlan(plan);
}

// Build Shopify checkout URL with customer email pre-filled.
// Legacy keys (pro/enterprise) resolve to lite/business.
export function getShopifyUpgradeUrl(plan, email) {
  const base = SHOPIFY_PLANS[planKey(plan)]?.shopifyUrl;
  if (!base) return null;
  const url = new URL(base);
  if (email) url.searchParams.set('email', email);
  return url.toString();
}

// Manage subscription URL
export const SHOPIFY_MANAGE_URL = 'https://shinyjets.com/account/subscriptions';
