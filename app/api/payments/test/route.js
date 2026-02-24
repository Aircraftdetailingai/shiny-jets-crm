import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const supabase = getSupabase();
  const results = {
    step1_findDetailer: null,
    step2_findOrCreateQuote: null,
    step3_testCheckout: null,
    quoteLink: null,
    checkoutUrl: null,
  };

  try {
    // Use the known working test account directly
    const workingStripeAccount = 'acct_1SulfbE9Qo7bJV5q';
    const targetDetailerId = '9f2b9f6a-a104-4497-a5fc-735ab3a7c170';

    // Step 1: Find the specific detailer
    const { data: detailers, error: detailerError } = await supabase
      .from('detailers')
      .select('id, email, company, stripe_account_id, plan')
      .eq('id', targetDetailerId)
      .limit(1);

    if (detailerError || !detailers?.length) {
      return Response.json({
        error: 'Detailer not found',
        details: detailerError?.message,
      }, { status: 400 });
    }

    // Use the working stripe account regardless of what's in DB
    const detailer = {
      ...detailers[0],
      stripe_account_id: workingStripeAccount
    };
    results.step1_findDetailer = {
      success: true,
      detailerId: detailer.id,
      company: detailer.company,
      stripeAccount: detailer.stripe_account_id,
      plan: detailer.plan,
    };

    // Step 2: Find existing test quote or create one
    let quote;
    const { data: existingQuotes } = await supabase
      .from('quotes')
      .select('*')
      .eq('detailer_id', detailer.id)
      .in('status', ['draft', 'sent', 'viewed'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingQuotes?.length) {
      quote = existingQuotes[0];
      results.step2_findOrCreateQuote = {
        action: 'found_existing',
        quoteId: quote.id,
        shareLink: quote.share_link,
        status: quote.status,
        total: quote.total_price,
      };
    } else {
      // Create a test quote
      const shareLink = randomUUID().substring(0, 8);
      const { data: newQuote, error: createError } = await supabase
        .from('quotes')
        .insert({
          detailer_id: detailer.id,
          share_link: shareLink,
          status: 'sent',
          aircraft_type: 'Test Aircraft',
          aircraft_model: 'Cessna 172',
          services: { exterior: true, interior: true },
          total_price: 500.00,
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          client_name: 'Test Customer',
          client_email: 'test@example.com',
          notes: 'Test quote for payment flow verification',
        })
        .select()
        .single();

      if (createError) {
        return Response.json({
          error: 'Failed to create test quote',
          details: createError.message,
        }, { status: 500 });
      }

      quote = newQuote;
      results.step2_findOrCreateQuote = {
        action: 'created_new',
        quoteId: quote.id,
        shareLink: quote.share_link,
        status: quote.status,
        total: quote.total_price,
      };
    }

    results.quoteLink = `https://app.aircraftdetailing.ai/q/${quote.share_link}`;

    // Step 3: Test creating checkout session
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY?.trim());

    // Calculate fee based on plan
    const totalAmount = Math.round((quote.total_price || 0) * 100);
    let applicationFee;
    const plan = detailer.plan || 'free';
    if (plan === 'free' || plan === 'starter') {
      applicationFee = Math.round(totalAmount * 0.05); // 5%
    } else {
      applicationFee = 1000; // $10 flat
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Aircraft Detail - ${quote.aircraft_model || 'Quote'}`,
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
            destination: detailer.stripe_account_id,
          },
        },
        success_url: `https://app.aircraftdetailing.ai/q/${quote.share_link}?payment=success`,
        cancel_url: `https://app.aircraftdetailing.ai/q/${quote.share_link}?payment=cancelled`,
        metadata: {
          quote_id: quote.id,
          detailer_id: quote.detailer_id,
          test: 'true',
        },
      });

      results.step3_testCheckout = {
        success: true,
        sessionId: session.id,
        amount: totalAmount / 100,
        applicationFee: applicationFee / 100,
        plan: plan,
      };
      results.checkoutUrl = session.url;

    } catch (stripeErr) {
      results.step3_testCheckout = {
        success: false,
        error: stripeErr.message,
        type: stripeErr.type,
        code: stripeErr.code,
      };
    }

    return Response.json({
      success: results.step3_testCheckout?.success || false,
      ...results,
      testCard: '4242 4242 4242 4242 (any future date, any CVC)',
    }, { status: 200 });

  } catch (err) {
    return Response.json({
      error: err.message,
      ...results,
    }, { status: 500 });
  }
}
