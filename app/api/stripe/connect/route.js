import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { createStripeClient, getStripeKey } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
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

export async function POST(request) {
  console.log('=== Stripe Connect Route ===');

  try {
    // Get authenticated user from cookie or header
    const user = await getUser(request);
    console.log('User:', user ? { id: user.id, email: user.email } : 'none');

    if (!user) {
      return Response.json({
        error: 'Unauthorized',
        hint: 'No valid auth token found in cookie or Authorization header',
      }, { status: 401 });
    }

    // Check Supabase
    if (!process.env.SUPABASE_URL) {
      return Response.json({ error: 'SUPABASE_URL not configured' }, { status: 500 });
    }

    const supabase = getSupabase();

    // Fetch detailer (including stripe_mode)
    const { data: detailer, error: dbError } = await supabase
      .from('detailers')
      .select('stripe_account_id, email, company, stripe_mode')
      .eq('id', user.id)
      .single();

    // Use mode-aware Stripe client
    const mode = detailer?.stripe_mode || 'test';
    const stripeKey = getStripeKey(mode);

    console.log('Key check:', {
      mode,
      exists: !!stripeKey,
      length: stripeKey?.length || 0,
      prefix: stripeKey?.substring(0, 15) || 'none',
    });

    if (!stripeKey) {
      return Response.json({ error: 'Stripe key not configured for ' + mode + ' mode' }, { status: 500 });
    }

    if (!stripeKey.startsWith('sk_') && !stripeKey.startsWith('mk_') && !stripeKey.startsWith('rk_')) {
      return Response.json({ error: 'Invalid key format - must start with sk_, mk_, or rk_' }, { status: 500 });
    }

    const stripe = createStripeClient(mode);
    if (!stripe) {
      return Response.json({ error: 'Failed to initialize Stripe' }, { status: 500 });
    }

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('DB error:', dbError);
      return Response.json({ error: 'Database error: ' + dbError.message }, { status: 500 });
    }

    console.log('Detailer:', { found: !!detailer, hasStripe: !!detailer?.stripe_account_id });

    let accountId = detailer?.stripe_account_id;

    // Create Stripe account if needed
    if (!accountId) {
      console.log('Creating Stripe Connect account...');
      try {
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: detailer?.email || user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          business_profile: {
            name: detailer?.company || 'Aircraft Detailer',
            product_description: 'Aircraft detailing services',
            mcc: '7349',
          },
          metadata: { detailer_id: user.id },
        });

        accountId = account.id;
        console.log('Created account:', accountId);

        // Save to DB
        await supabase
          .from('detailers')
          .update({ stripe_account_id: accountId })
          .eq('id', user.id);

      } catch (stripeErr) {
        console.error('Stripe account create error:', {
          message: stripeErr.message,
          type: stripeErr.type,
          code: stripeErr.code,
        });

        // Check if Connect is not enabled on the Stripe account
        if (stripeErr.message?.includes("signed up for Connect")) {
          return Response.json({
            error: 'Stripe Connect not enabled',
            details: 'Please enable Stripe Connect in your Stripe Dashboard at https://dashboard.stripe.com/connect/accounts/overview',
            action_required: 'stripe_connect_setup',
          }, { status: 503 });
        }

        return Response.json({
          error: 'Failed to create Stripe account',
          details: stripeErr.message,
          type: stripeErr.type,
          code: stripeErr.code,
        }, { status: 500 });
      }
    }

    // Create account link - hardcode URL to avoid env var issues
    const appUrl = 'https://crm.shinyjets.com';

    console.log('Creating account link for:', accountId);

    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${appUrl}/settings/integrations?stripe=refresh`,
        return_url: `${appUrl}/settings/integrations?stripe=success`,
        type: 'account_onboarding',
      });

      console.log('Account link created');
      return Response.json({ url: accountLink.url }, { status: 200 });

    } catch (linkErr) {
      console.error('Account link error:', {
        message: linkErr.message,
        type: linkErr.type,
        code: linkErr.code,
      });

      // If account doesn't belong to this platform, clear it and create fresh
      if (linkErr.code === 'account_invalid' || linkErr.message?.includes('does not exist') || linkErr.message?.includes('No such account') || linkErr.type === 'invalid_request_error') {
        console.log('Stale account ID detected, creating fresh Connect account...');
        try {
          const freshAccount = await stripe.accounts.create({
            type: 'express',
            country: 'US',
            email: detailer?.email || user.email,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
            business_type: 'individual',
            business_profile: {
              name: detailer?.company || 'Aircraft Detailer',
              product_description: 'Aircraft detailing services',
              mcc: '7349',
            },
            metadata: { detailer_id: user.id },
          });

          await supabase.from('detailers').update({ stripe_account_id: freshAccount.id, stripe_onboarding_complete: false }).eq('id', user.id);

          const freshLink = await stripe.accountLinks.create({
            account: freshAccount.id,
            refresh_url: `${appUrl}/settings?stripe=refresh`,
            return_url: `${appUrl}/settings?stripe=success`,
            type: 'account_onboarding',
          });

          return Response.json({ url: freshLink.url }, { status: 200 });
        } catch (retryErr) {
          console.error('Retry account creation failed:', retryErr.message);
          return Response.json({
            error: 'Failed to create Stripe Connect account',
            details: retryErr.message,
          }, { status: 500 });
        }
      }

      return Response.json({
        error: 'Failed to create onboarding link',
        details: linkErr.message,
        type: linkErr.type,
        code: linkErr.code,
      }, { status: 500 });
    }

  } catch (err) {
    console.error('Unhandled error:', err);
    return Response.json({
      error: err.message || 'Unknown error',
      type: err.type || 'unknown',
      code: err.code || 'unknown',
    }, { status: 500 });
  }
}
