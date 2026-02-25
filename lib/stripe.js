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
export function getStripeKey(mode) {
  if (mode === 'live') {
    return (process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY)?.trim() || null;
  }
  // Default to test
  return (process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY)?.trim() || null;
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
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return null;
}

/**
 * Check which Stripe modes are available based on configured env vars.
 */
export function getAvailableModes() {
  const defaultKey = process.env.STRIPE_SECRET_KEY?.trim();
  const liveKey = process.env.STRIPE_LIVE_SECRET_KEY?.trim();
  const testKey = process.env.STRIPE_TEST_SECRET_KEY?.trim();

  const hasLive = !!(liveKey || (defaultKey && defaultKey.startsWith('sk_live_')));
  const hasTest = !!(testKey || (defaultKey && defaultKey.startsWith('sk_test_')));

  // If separate keys aren't configured, both modes use the default key
  return {
    hasLive: hasLive || !!defaultKey,
    hasTest: hasTest || !!defaultKey,
    defaultMode: detectKeyMode(defaultKey) || 'test',
  };
}
