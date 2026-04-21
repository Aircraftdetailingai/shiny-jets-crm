import { createClient } from '@supabase/supabase-js';
import { isStripeConnected } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET - Fetch comparable quotes for a customer
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const ids = searchParams.get('ids'); // optional comma-separated quote IDs to compare

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch the primary quote by share_link
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('share_link', token)
    .single();

  if (error || !quote) {
    return Response.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Fetch detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, name, email, phone, company, plan, pass_fee_to_customer, quote_display_preference, preferred_currency, stripe_account_id, stripe_secret_key, stripe_mode, stripe_onboarding_complete')
    .eq('id', quote.detailer_id)
    .single();

  // Stripe connection — direct keys (with mode/prefix match) OR Connect with
  // stripe_onboarding_complete. Centralized in lib/stripe.isStripeConnected.
  // Pre-F8 only checked the Connect path, so direct-key detailers always
  // showed as not connected on the comparison page.
  const stripeConnected = isStripeConnected(detailer);
  if (!stripeConnected && detailer?.stripe_secret_key) {
    const sk = detailer.stripe_secret_key;
    const keyMode = sk.startsWith('sk_live_') ? 'live'
      : sk.startsWith('sk_test_') ? 'test'
      : null;
    const accountMode = detailer?.stripe_mode || 'test';
    if (keyMode && keyMode !== accountMode) {
      console.error(`[portal/compare] Stripe mode/key mismatch for detailer ${detailer.id} — key=${keyMode} account=${accountMode}; treating as not connected`);
    }
  }

  // Fetch all comparable quotes for this customer from the same detailer
  const email = quote.customer_email || quote.client_email;
  let comparableQuotes = [];

  if (ids) {
    // Fetch specific quotes by IDs
    const idList = ids.split(',').filter(Boolean);
    const { data } = await supabase
      .from('quotes')
      .select('*')
      .eq('detailer_id', quote.detailer_id)
      .in('id', idList)
      .in('status', ['sent', 'viewed', 'paid', 'approved', 'scheduled', 'in_progress', 'completed']);

    comparableQuotes = data || [];
  } else if (email) {
    // Fetch all active quotes for this customer from this detailer
    const { data } = await supabase
      .from('quotes')
      .select('*')
      .eq('detailer_id', quote.detailer_id)
      .or(`customer_email.ilike.${email},client_email.ilike.${email}`)
      .in('status', ['sent', 'viewed', 'paid', 'approved', 'scheduled', 'in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .limit(10);

    comparableQuotes = data || [];
  }

  // Ensure the primary quote is included
  if (!comparableQuotes.find(q => q.id === quote.id)) {
    comparableQuotes.unshift(quote);
  }

  // Remove sensitive fields from detailer
  const {
    stripe_account_id, stripe_secret_key, stripe_mode,
    stripe_onboarding_complete,
    ...detailerPublic
  } = detailer || {};

  return Response.json({
    quotes: comparableQuotes,
    primary_quote_id: quote.id,
    detailer: detailerPublic,
    stripe_connected: stripeConnected,
  });
}
