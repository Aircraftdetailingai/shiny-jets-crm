import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { calculateCcFee } from '@/lib/cc-fee';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

function cleanKey(k) {
  return k?.replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim() || null;
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

    // Fetch quote — include line_items for itemized checkout
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, detailer_id, total_price, aircraft_type, aircraft_model, status, valid_until, share_link, client_name, client_email, line_items')
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
      .select('stripe_secret_key, stripe_account_id, company, email, plan, cc_fee_mode, booking_mode, deposit_percentage, quote_package_name, quote_itemized_checkout')
      .eq('id', quote.detailer_id)
      .single();

    const platformKey = cleanKey(process.env.STRIPE_SECRET_KEY);
    const detailerKey = cleanKey(detailer?.stripe_secret_key);

    if (!platformKey && !detailerKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured. Go to Settings → Integrations to connect Stripe.', code: 'stripe_not_configured' }), { status: 400 });
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
    const ccFeeMode = detailer?.cc_fee_mode || 'absorb';
    let ccFeeCents = 0;
    if (ccFeeMode === 'pass' || ccFeeMode === 'customer_choice') {
      ccFeeCents = Math.round(calculateCcFee(baseAmount / 100) * 100);
    }
    const totalAmount = baseAmount + ccFeeCents;

    const appUrl = 'https://crm.shinyjets.com';

    // Build line items — use itemized services from quote if available
    const quoteLineItems = Array.isArray(quote.line_items) ? quote.line_items : [];
    const hasItemizedServices = quoteLineItems.length > 0 && quoteLineItems.every(li => li.description && li.amount > 0);

    let stripeLineItems;

    const useItemizedCheckout = detailer?.quote_itemized_checkout !== false;

    if (isDeposit) {
      // Deposits show as a single line
      stripeLineItems = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Deposit (${depositPct}%) - ${quote.aircraft_model || quote.aircraft_type || 'Quote'}`,
            description: `Quote from ${detailer.company || 'Detailer'}`,
          },
          unit_amount: baseAmount,
        },
        quantity: 1,
      }];
    } else if (!useItemizedCheckout) {
      // Package / non-itemized checkout: single line item with package name
      stripeLineItems = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: detailer.quote_package_name || 'Aircraft Detail Package',
            description: `Quote from ${detailer.company || 'Detailer'}`,
          },
          unit_amount: baseAmount,
        },
        quantity: 1,
      }];
    } else if (hasItemizedServices) {
      // Itemized services from the quote
      stripeLineItems = quoteLineItems.map(svc => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: svc.description || svc.name || 'Service',
            ...(svc.hours > 0 ? { description: `${svc.hours}h estimated` } : {}),
          },
          unit_amount: Math.round((svc.amount || svc.price || 0) * 100),
        },
        quantity: 1,
      }));
    } else {
      // Fallback: single line item
      stripeLineItems = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Aircraft Detail - ${quote.aircraft_model || quote.aircraft_type || 'Quote'}`,
            description: `Quote from ${detailer.company || 'Detailer'}`,
          },
          unit_amount: baseAmount,
        },
        quantity: 1,
      }];
    }

    // Add CC fee as a separate line item if applicable
    if (ccFeeCents > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Credit Card Processing Fee' },
          unit_amount: ccFeeCents,
        },
        quantity: 1,
      });
    }

    const baseSessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: stripeLineItems,
      success_url: `${appUrl}/q/${quote.share_link}?payment=success`,
      cancel_url: `${appUrl}/q/${quote.share_link}?payment=cancelled`,
      metadata: {
        quote_id: quote.id,
        detailer_id: quote.detailer_id,
        payment_type: isDeposit ? 'deposit' : 'full',
        deposit_percentage: isDeposit ? String(depositPct) : '',
      },
    };

    // Try Connect first if both platform key and connected account exist
    const canConnect = !!(detailer?.stripe_account_id && platformKey);

    if (canConnect) {
      try {
        const feeRate = PLATFORM_FEES[detailer.plan || 'free'] || PLATFORM_FEES.free;
        const platformFee = Math.round(totalAmount * feeRate);
        console.log(`[checkout-connect] dest=${detailer.stripe_account_id} plan=${detailer.plan} feeRate=${feeRate} fee=${platformFee}cents total=${totalAmount}cents`);

        const stripe = new Stripe(platformKey);
        const connectParams = {
          ...baseSessionParams,
          payment_intent_data: {
            application_fee_amount: platformFee,
            transfer_data: {
              destination: detailer.stripe_account_id,
            },
          },
        };

        const session = await stripe.checkout.sessions.create(connectParams);
        return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), { status: 200 });
      } catch (connectErr) {
        console.error(`[checkout-connect-failed] ${connectErr.type} | ${connectErr.code} | ${connectErr.message}`);
        console.log('[checkout] Falling back to direct charge...');
      }
    }

    // Direct charge fallback
    if (detailerKey) {
      console.log(`[checkout-direct] key=${detailerKey.slice(0, 12)}... total=${totalAmount}cents quote=${quote.id}`);
      const stripe = new Stripe(detailerKey);
      const session = await stripe.checkout.sessions.create(baseSessionParams);
      return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Payment processing unavailable. Please contact the detailer.', code: 'stripe_not_configured' }), { status: 400 });

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
