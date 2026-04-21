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
 * Decide whether a detailer is provably able to accept payments. Returns true
 * if EITHER:
 *   - they have a real direct-charge secret key (sk_live_/sk_test_) AND that
 *     key's mode agrees with their stripe_mode (mismatch means checkout would
 *     fail at Stripe), OR
 *   - they have a Connect account_id AND stripe_onboarding_complete === true
 *     (onboarding_complete is flipped by /api/stripe/webhook on
 *     account.updated when charges_enabled && payouts_enabled).
 *
 * Direct keys do not require stripe_onboarding_complete — that flag only
 * makes sense for the Connect Express flow. Pre-F8 code (portal, compare)
 * incorrectly treated direct-key detailers as not connected.
 *
 * @param {object} detailer  row with at minimum: stripe_secret_key,
 *                           stripe_mode, stripe_account_id,
 *                           stripe_onboarding_complete
 * @returns {boolean}
 */
export function isStripeConnected(detailer) {
  if (!detailer) return false;
  const sk = detailer.stripe_secret_key;
  if (sk && (sk.startsWith('sk_live_') || sk.startsWith('sk_test_'))) {
    const keyMode = sk.startsWith('sk_live_') ? 'live' : 'test';
    const accountMode = detailer.stripe_mode || 'test';
    if (keyMode !== accountMode) {
      // Mismatch — treat as not connected so we don't surface a Pay button
      // that will 4xx at Stripe. Caller logs the warning where it has
      // detailer_id context.
      return false;
    }
    return true;
  }
  if (detailer.stripe_account_id && detailer.stripe_onboarding_complete === true) {
    return true;
  }
  return false;
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
