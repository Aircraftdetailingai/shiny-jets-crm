import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { createStripeClient } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = getSupabase();

  try {
    // Fetch detailer's Stripe account ID, mode, and API keys
    const { data: detailer } = await supabase
      .from('detailers')
      .select('stripe_account_id, stripe_mode, chargeback_terms_accepted_at, stripe_publishable_key, stripe_secret_key')
      .eq('id', user.id)
      .single();

    // Check if detailer has their own Stripe API keys saved
    const hasKeys = !!(detailer?.stripe_publishable_key && detailer?.stripe_secret_key);
    if (hasKeys && !detailer?.stripe_account_id) {
      return new Response(JSON.stringify({
        connected: true,
        hasKeys: true,
        connectAccountId: null,
        status: 'ACTIVE',
        message: 'Stripe API keys configured (direct charges)',
        chargeback_terms_accepted_at: detailer?.chargeback_terms_accepted_at || null,
      }), { status: 200 });
    }

    const mode = detailer?.stripe_mode || 'test';

    // Log key info for debugging connection issues
    const keyRaw = mode === 'live'
      ? (process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY)
      : (process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
    const keyTrimmed = keyRaw?.trim();
    console.log('=== Stripe Status Debug ===', {
      mode,
      keyExists: !!keyTrimmed,
      keyLength: keyTrimmed?.length || 0,
      keyPrefix: keyTrimmed?.substring(0, 8) || 'MISSING',
      keyHasWhitespace: keyRaw !== keyTrimmed,
      keyHasQuotes: keyRaw?.includes('"') || keyRaw?.includes("'"),
      stripeAccountId: detailer?.stripe_account_id || 'NONE',
    });

    const stripe = createStripeClient(mode);

    if (!stripe) {
      return new Response(JSON.stringify({ connected: false, status: 'NOT_CONFIGURED', message: 'Stripe not configured for ' + mode + ' mode' }), { status: 200 });
    }

    if (!detailer?.stripe_account_id) {
      return new Response(JSON.stringify({
        connected: false,
        status: 'NOT_CONNECTED',
        message: 'Stripe not connected',
        chargeback_terms_accepted_at: detailer?.chargeback_terms_accepted_at || null,
      }), { status: 200 });
    }

    // Retrieve account from Stripe
    const account = await stripe.accounts.retrieve(detailer.stripe_account_id);

    // Determine status
    let status = 'INCOMPLETE';
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'ACTIVE';
    } else if (account.details_submitted) {
      status = 'PENDING';
    }

    return new Response(JSON.stringify({
      connected: true,
      hasKeys,
      connectAccountId: detailer.stripe_account_id,
      status,
      stripe_mode: mode,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      accountType: account.type,
      email: account.email,
      chargeback_terms_accepted_at: detailer?.chargeback_terms_accepted_at || null,
    }), { status: 200 });
  } catch (err) {
    console.error('=== Stripe Status Error ===', {
      message: err.message,
      type: err.type,
      code: err.code,
      statusCode: err.statusCode,
      raw: err.rawType,
    });
    return new Response(JSON.stringify({
      connected: false,
      status: 'ERROR',
      message: err.message
    }), { status: 200 });
  }
}
