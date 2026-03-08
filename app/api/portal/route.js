import { createClient } from '@supabase/supabase-js';

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

  // Fetch detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, name, email, phone, company, plan, pass_fee_to_customer, quote_display_preference, stripe_account_id, preferred_currency, terms_pdf_url, terms_text')
    .eq('id', quote.detailer_id)
    .single();

  // Check Stripe connection
  let stripeConnected = false;
  if (detailer?.stripe_account_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const account = await stripe.accounts.retrieve(detailer.stripe_account_id);
      stripeConnected = account.charges_enabled && account.payouts_enabled;
    } catch (e) {
      // Stripe check failed
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

  // Fetch customer's saved language preference
  let customerLanguage = null;
  const customerEmail = quote.customer_email || quote.client_email;
  if (customerEmail) {
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('customer_language')
        .eq('detailer_id', quote.detailer_id)
        .eq('email', customerEmail.toLowerCase().trim())
        .maybeSingle();
      if (customer?.customer_language) customerLanguage = customer.customer_language;
    } catch (e) {
      // Column may not exist yet
    }
  }

  // Remove sensitive fields
  const { stripe_account_id, ...detailerPublic } = detailer || {};

  return Response.json({
    quote,
    detailer: detailerPublic,
    stripe_connected: stripeConnected,
    history,
    customer_language: customerLanguage,
  });
}
