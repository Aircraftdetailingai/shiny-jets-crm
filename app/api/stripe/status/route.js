import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { createStripeClient } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Get user from either cookie or Authorization header
async function getUser(request) {
  // Try cookie first (browser requests)
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('auth_token')?.value;
  if (authCookie) {
    const user = await verifyToken(authCookie);
    if (user) return user;
  }

  // Try Authorization header (API requests)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }

  return null;
}

export async function GET(request) {
  const user = await getUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = getSupabase();

  try {
    // Fetch detailer's Stripe account ID and mode
    const { data: detailer } = await supabase
      .from('detailers')
      .select('stripe_account_id, stripe_mode, chargeback_terms_accepted_at')
      .eq('id', user.id)
      .single();

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
