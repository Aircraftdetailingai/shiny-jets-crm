import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { calculateCcFee } from '@/lib/cc-fee';

export const dynamic = 'force-dynamic';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY?.trim());
}

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
      .select('stripe_account_id, company, email, plan, pass_fee_to_customer, cc_fee_mode, booking_mode, deposit_percentage')
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
    const fullBaseAmount = Math.round((quote.total_price || 0) * 100); // Convert to cents
    const plan = detailer?.plan || 'free';
    const passFee = detailer?.pass_fee_to_customer || false;

    // Determine if this is a deposit payment
    const isDeposit = paymentType === 'deposit' && detailer?.booking_mode === 'deposit';
    const depositPct = detailer?.deposit_percentage || 25;
    const baseAmount = isDeposit ? Math.round(fullBaseAmount * depositPct / 100) : fullBaseAmount;

    // Store deposit info on quote before checkout
    if (isDeposit) {
      const depositDollars = Math.round((quote.total_price || 0) * depositPct) / 100;
      await supabase
        .from('quotes')
        .update({
          booking_mode: 'deposit',
          deposit_percentage: depositPct,
          deposit_amount: depositDollars,
          balance_due: (quote.total_price || 0) - depositDollars,
        })
        .eq('id', quoteId)
        .eq('share_link', shareLink);
    }

    // Use tier-based platform fees
    const FEES = { free: 0.05, pro: 0.02, business: 0.01, enterprise: 0.00 };
    const feeRate = FEES[plan] || FEES.free;
    const applicationFee = Math.round(baseAmount * feeRate);

    // Store fee on the quote record
    await supabase.from('quotes').update({
      platform_fee_rate: feeRate,
      platform_fee_amount: applicationFee / 100, // store in dollars
    }).eq('id', quoteId);

    // When pass-through is enabled, add service fee to the total charged to customer
    let totalAmount = passFee ? baseAmount + applicationFee : baseAmount;

    // CC processing fee pass-through
    const ccFeeMode = detailer?.cc_fee_mode || 'absorb';
    if (ccFeeMode === 'pass' || ccFeeMode === 'customer_choice') {
      const ccFee = calculateCcFee(totalAmount / 100); // convert cents to dollars for calculation
      totalAmount += Math.round(ccFee * 100); // add back in cents
    }

    // Hardcode URL to avoid env var issues
    const appUrl = 'https://crm.shinyjets.com';

    // Create Stripe Checkout Session
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: isDeposit
              ? `Deposit (${depositPct}%) - ${quote.aircraft_model || quote.aircraft_type || 'Quote'}`
              : `Aircraft Detail - ${quote.aircraft_model || quote.aircraft_type || 'Quote'}`,
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
        payment_type: isDeposit ? 'deposit' : 'full',
        deposit_percentage: isDeposit ? String(depositPct) : '',
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
