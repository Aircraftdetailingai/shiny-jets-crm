import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY?.trim());

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const supabase = getSupabase();

  try {
    const { quoteId, shareLink, agreedToTermsAt } = await request.json();
    if (!quoteId || !shareLink) {
      return new Response(JSON.stringify({ error: 'Quote ID and share link required' }), { status: 400 });
    }

    // Record terms agreement
    if (agreedToTermsAt) {
      const customerIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
      await supabase
        .from('quotes')
        .update({
          customer_agreed_terms_at: agreedToTermsAt,
          customer_ip_address: customerIp,
        })
        .eq('id', quoteId)
        .eq('share_link', shareLink);
    }

    // Fetch quote - require share_link match to prevent unauthorized access
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, detailer_id, total_price, aircraft_type, aircraft_model, status, valid_until, share_link, client_name, client_email')
      .eq('id', quoteId)
      .eq('share_link', shareLink)
      .single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
    }

    // Check if already paid
    if (quote.status === 'paid' || quote.status === 'approved') {
      return new Response(JSON.stringify({ error: 'Quote already paid' }), { status: 400 });
    }

    // Check if expired
    if (new Date() > new Date(quote.valid_until)) {
      return new Response(JSON.stringify({ error: 'Quote has expired', code: 'quote_expired' }), { status: 400 });
    }

    // Fetch detailer for Stripe Connect account
    const { data: detailer } = await supabase
      .from('detailers')
      .select('stripe_account_id, company, email, plan, pass_fee_to_customer')
      .eq('id', quote.detailer_id)
      .single();

    if (!detailer?.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'Detailer has not connected Stripe', code: 'stripe_not_connected' }), { status: 400 });
    }

    // Use the known working test account (temporary fix for DB sync issue)
    const stripeAccountId = detailer.stripe_account_id === 'acct_1Sul7NCqHiG6qwTk'
      ? 'acct_1SulfbE9Qo7bJV5q'  // Use working custom account
      : detailer.stripe_account_id;

    // Calculate application fee based on plan
    const baseAmount = Math.round((quote.total_price || 0) * 100); // Convert to cents
    const plan = detailer?.plan || 'free';
    const passFee = detailer?.pass_fee_to_customer || false;

    // Use tier-based platform fees
    const FEES = { free: 0.05, pro: 0.02, business: 0.01, enterprise: 0.00 };
    const feeRate = FEES[plan] || FEES.free;
    const applicationFee = Math.round(baseAmount * feeRate);

    // When pass-through is enabled, add service fee to the total charged to customer
    // The application fee stays the same — it just comes from the customer instead of the detailer
    const totalAmount = passFee ? baseAmount + applicationFee : baseAmount;

    // Hardcode URL to avoid env var issues
    const appUrl = 'https://app.aircraftdetailing.ai';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Aircraft Detail - ${quote.aircraft_model || quote.aircraft_type || 'Quote'}`,
              description: `Quote from ${detailer.company || 'Detailer'}`,
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: {
          destination: stripeAccountId,
        },
      },
      success_url: `${appUrl}/q/${quote.share_link}?payment=success`,
      cancel_url: `${appUrl}/q/${quote.share_link}?payment=cancelled`,
      metadata: {
        quote_id: quote.id,
        detailer_id: quote.detailer_id,
      },
    });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), { status: 200 });
  } catch (err) {
    console.error('Checkout error:', err);

    // Map Stripe error codes to friendly codes
    let code = 'processing_error';
    if (err.code) {
      code = err.code;
    }
    if (err.type === 'StripeCardError') {
      code = err.decline_code || 'card_declined';
    }

    return new Response(JSON.stringify({
      error: 'Payment processing failed',
      code,
      message: err.message
    }), { status: 500 });
  }
}
