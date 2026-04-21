import { createClient } from '@supabase/supabase-js';
import { isStripeConnected } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET - Fetch quote + customer history by share_link
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch the primary quote
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('share_link', token)
    .single();

  if (error || !quote) {
    return Response.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Fetch detailer info — explicit allowlist sized to the fields the portal
  // token page actually renders. Never select password_hash,
  // stripe_secret_key, stripe_publishable_key, ach_routing_number,
  // ach_account_number, ach_account_name, ach_bank_name, or
  // webauthn_challenge into this response. stripe_account_id is fetched
  // server-side for Connect validation and stripped before the reply.
  const PORTAL_DETAILER_FIELDS = [
    'id', 'name', 'email', 'phone', 'company', 'plan',
    'preferred_currency', 'cc_fee_mode',
    'logo_url', 'theme_logo_url',
    'portal_theme', 'theme_primary', 'theme_accent', 'theme_bg', 'theme_surface',
    'font_embed_url', 'font_heading', 'font_body',
    'disclaimer_text', 'terms_text', 'terms_pdf_url',
    // server-only fields below — stripped from the response shape
    'stripe_account_id', 'stripe_secret_key', 'stripe_mode',
    'stripe_onboarding_complete',
  ].join(', ');
  const { data: detailer } = await supabase
    .from('detailers')
    .select(PORTAL_DETAILER_FIELDS)
    .eq('id', quote.detailer_id)
    .single();

  // Stripe connection — direct keys (with mode/prefix match) OR Connect with
  // stripe_onboarding_complete. Centralized in lib/stripe.isStripeConnected.
  // Pre-F8 only checked the Connect path, so direct-key detailers always
  // showed as not connected on the portal.
  const stripeConnected = isStripeConnected(detailer);
  if (!stripeConnected && detailer?.stripe_secret_key) {
    const sk = detailer.stripe_secret_key;
    const keyMode = sk.startsWith('sk_live_') ? 'live'
      : sk.startsWith('sk_test_') ? 'test'
      : null;
    const accountMode = detailer?.stripe_mode || 'test';
    if (keyMode && keyMode !== accountMode) {
      console.error(`[portal] Stripe mode/key mismatch for detailer ${detailer.id} — key=${keyMode} account=${accountMode}; treating as not connected`);
    }
  }

  // Fetch customer's quote history (same email, same detailer)
  let history = [];
  if (quote.customer_email || quote.client_email) {
    const email = quote.customer_email || quote.client_email;
    const { data: allQuotes } = await supabase
      .from('quotes')
      .select('id, aircraft_model, aircraft_type, total_price, status, created_at, share_link, paid_at, completed_at, scheduled_date')
      .eq('detailer_id', quote.detailer_id)
      .or(`customer_email.ilike.${email},client_email.ilike.${email}`)
      .neq('id', quote.id)
      .order('created_at', { ascending: false })
      .limit(20);

    history = allQuotes || [];
  }

  // Resolve or create customer record
  let customerLanguage = null;
  let customerId = null;
  const customerEmail = quote.customer_email || quote.client_email;
  if (customerEmail) {
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, customer_language')
        .eq('detailer_id', quote.detailer_id)
        .eq('email', customerEmail.toLowerCase().trim())
        .maybeSingle();
      if (customer) {
        customerId = customer.id;
        if (customer.customer_language) customerLanguage = customer.customer_language;
      } else {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            detailer_id: quote.detailer_id,
            email: customerEmail.toLowerCase().trim(),
            name: quote.client_name || quote.customer_name || '',
            phone: quote.client_phone || '',
            company_name: quote.customer_company || '',
          })
          .select('id')
          .single();
        if (newCustomer) customerId = newCustomer.id;
      }
    } catch (e) {
      // Column may not exist yet
    }
  }

  // Remove sensitive / server-only fields before returning to the client
  const {
    stripe_account_id, stripe_secret_key, stripe_mode,
    stripe_onboarding_complete, password_hash,
    ...detailerPublic
  } = detailer || {};

  return Response.json({
    quote,
    detailer: detailerPublic,
    stripe_connected: stripeConnected,
    history,
    customer_language: customerLanguage,
    customer_id: customerId,
  });
}
