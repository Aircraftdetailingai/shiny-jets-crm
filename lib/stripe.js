import Stripe from 'stripe';

/**
 * Get the appropriate Stripe secret key based on mode.
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY       - Default key (used as fallback)
 *   STRIPE_LIVE_SECRET_KEY  - Explicit live key (optional)
 *   STRIPE_TEST_SECRET_KEY  - Explicit test key (optional)
 *
 * When mode is 'live': prefers STRIPE_LIVE_SECRET_KEY, falls back to STRIPE_SECRET_KEY
 * When mode is 'test': prefers STRIPE_TEST_SECRET_KEY, falls back to STRIPE_SECRET_KEY
 */
function cleanKey(k) {
  return k?.replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim() || null;
}

export function getStripeKey(mode) {
  if (mode === 'live') {
    return cleanKey(process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
  }
  // Default to test
  return cleanKey(process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
}

/**
 * Create a Stripe client for the given mode.
 */
export function createStripeClient(mode) {
  const key = getStripeKey(mode);
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: '2023-10-16',
    maxNetworkRetries: 0,
    timeout: 30000,
  });
}

/**
 * Detect whether a Stripe key is test or live from its prefix.
 */
export function detectKeyMode(key) {
  if (!key) return null;
  if (key.startsWith('sk_live_') || key.startsWith('mk_live_') || key.startsWith('rk_live_')) return 'live';
  if (key.startsWith('sk_test_') || key.startsWith('mk_test_') || key.startsWith('rk_test_')) return 'test';
  return null;
}

/**
 * Check which Stripe modes are available based on configured env vars.
 */
export function getAvailableModes() {
  const defaultKey = cleanKey(process.env.STRIPE_SECRET_KEY);
  const liveKey = cleanKey(process.env.STRIPE_LIVE_SECRET_KEY);
  const testKey = cleanKey(process.env.STRIPE_TEST_SECRET_KEY);

  const hasLive = !!(liveKey || (defaultKey && defaultKey.startsWith('sk_live_')));
  const hasTest = !!(testKey || (defaultKey && defaultKey.startsWith('sk_test_')));

  // If separate keys aren't configured, both modes use the default key
  return {
    hasLive: hasLive || !!defaultKey,
    hasTest: hasTest || !!defaultKey,
    defaultMode: detectKeyMode(defaultKey) || 'test',
  };
}
