import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { calculateCcFee } from '@/lib/cc-fee';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const supabase = getSupabase();

  try {
    const { quoteId, shareLink, agreedToTermsAt, paymentType } = await request.json();
    if (!quoteId || !shareLink) {
      return new Response(JSON.stringify({ error: 'Quote ID and share link required' }), { status: 400 });
    }

    // Record terms agreement
    if (agreedToTermsAt) {
      const customerIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
      await supabase
        .from('quotes')
        .update({ customer_agreed_terms_at: agreedToTermsAt, customer_ip_address: customerIp })
        .eq('id', quoteId)
        .eq('share_link', shareLink);
    }

    // Fetch quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, detailer_id, total_price, aircraft_type, aircraft_model, status, valid_until, share_link, client_name, client_email')
      .eq('id', quoteId)
      .eq('share_link', shareLink)
      .single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
    }
    if (quote.status === 'paid' || quote.status === 'approved') {
      return new Response(JSON.stringify({ error: 'Quote already paid' }), { status: 400 });
    }
    if (new Date() > new Date(quote.valid_until)) {
      return new Response(JSON.stringify({ error: 'Quote has expired', code: 'quote_expired' }), { status: 400 });
    }

    // Fetch detailer
    const { data: detailer } = await supabase
      .from('detailers')
      .select('stripe_secret_key, company, email, plan, cc_fee_mode, booking_mode, deposit_percentage')
      .eq('id', quote.detailer_id)
      .single();

    const stripeKey = detailer?.stripe_secret_key?.trim();
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured. Go to Settings → Integrations to add your Stripe API key.', code: 'stripe_not_configured' }), { status: 400 });
    }

    // Calculate amount in cents
    const fullBaseAmount = Math.round((quote.total_price || 0) * 100);

    // Deposit handling
    const isDeposit = paymentType === 'deposit' && detailer?.booking_mode === 'deposit';
    const depositPct = detailer?.deposit_percentage || 25;
    const baseAmount = isDeposit ? Math.round(fullBaseAmount * depositPct / 100) : fullBaseAmount;

    if (isDeposit) {
      const depositDollars = Math.round((quote.total_price || 0) * depositPct) / 100;
      await supabase.from('quotes').update({
        booking_mode: 'deposit', deposit_percentage: depositPct,
        deposit_amount: depositDollars, balance_due: (quote.total_price || 0) - depositDollars,
      }).eq('id', quoteId).eq('share_link', shareLink);
    }

    // CC processing fee pass-through
    let totalAmount = baseAmount;
    const ccFeeMode = detailer?.cc_fee_mode || 'absorb';
    if (ccFeeMode === 'pass' || ccFeeMode === 'customer_choice') {
      const ccFee = calculateCcFee(totalAmount / 100);
      totalAmount += Math.round(ccFee * 100);
    }

    const appUrl = 'https://crm.shinyjets.com';
    const productName = isDeposit
      ? `Deposit (${depositPct}%) - ${quote.aircraft_model || quote.aircraft_type || 'Quote'}`
      : `Aircraft Detail - ${quote.aircraft_model || quote.aircraft_type || 'Quote'}`;

    // Create checkout session — direct charge, no Connect
    console.log(`[checkout] key=${stripeKey.slice(0, 12)}... amount=${totalAmount}cents quote=${quote.id}`);
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: productName, description: `Quote from ${detailer.company || 'Detailer'}` },
          unit_amount: totalAmount,
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/q/${quote.share_link}?payment=success`,
      cancel_url: `${appUrl}/q/${quote.share_link}?payment=cancelled`,
      metadata: {
        quote_id: quote.id,
        detailer_id: quote.detailer_id,
        payment_type: isDeposit ? 'deposit' : 'full',
        deposit_percentage: isDeposit ? String(depositPct) : '',
      },
    });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), { status: 200 });
  } catch (err) {
    console.error('[checkout-error-type]', err.type || 'unknown');
    console.error('[checkout-error-code]', err.code || 'none');
    console.error('[checkout-error-msg]', err.message || 'no message');

    return new Response(JSON.stringify({
      error: err.message || 'Payment processing failed',
      code: err.code || 'processing_error',
      message: err.message,
    }), { status: 500 });
  }
}
