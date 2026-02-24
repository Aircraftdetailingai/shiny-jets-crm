import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Create Stripe checkout session for change order payment
export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ error: 'Payment not configured' }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { approval_token } = await request.json();

    if (!approval_token) {
      return Response.json({ error: 'Approval token required' }, { status: 400 });
    }

    // Get change order with quote and detailer info
    const { data: changeOrder, error: coError } = await supabase
      .from('change_orders')
      .select(`
        *,
        quotes (
          id,
          client_name,
          client_email,
          aircraft_type,
          aircraft_model,
          detailer_id,
          detailers (
            id,
            company_name,
            stripe_account_id
          )
        )
      `)
      .eq('approval_token', approval_token)
      .single();

    if (coError || !changeOrder) {
      return Response.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (changeOrder.status !== 'pending') {
      return Response.json({ error: 'Change order already processed' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.aircraftdetailing.ai';
    const detailer = changeOrder.quotes?.detailers;

    // Build line items for Stripe
    const lineItems = changeOrder.services.map(service => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: service.name || service.description,
          description: `Additional service for ${changeOrder.quotes?.aircraft_model || changeOrder.quotes?.aircraft_type || 'Aircraft'}`,
        },
        unit_amount: Math.round((service.amount || service.price || 0) * 100),
      },
      quantity: 1,
    }));

    // Create checkout session
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${appUrl}/change-order/${approval_token}?success=true`,
      cancel_url: `${appUrl}/change-order/${approval_token}?canceled=true`,
      customer_email: changeOrder.quotes?.client_email,
      metadata: {
        change_order_id: changeOrder.id,
        quote_id: changeOrder.quote_id,
        approval_token: approval_token,
        type: 'change_order',
      },
    };

    // If detailer has Stripe Connect, use application fee
    if (detailer?.stripe_account_id) {
      // Platform fee based on detailer plan
      const { PLATFORM_FEES } = await import('@/lib/pricing-tiers');
      const feeRate = PLATFORM_FEES[detailer?.plan || 'free'] || PLATFORM_FEES.free;
      const platformFee = Math.round(changeOrder.amount * feeRate * 100);
      sessionParams.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: detailer.stripe_account_id,
        },
        metadata: {
          change_order_id: changeOrder.id,
          quote_id: changeOrder.quote_id,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Store session ID for webhook handling
    await supabase
      .from('change_orders')
      .update({ stripe_session_id: session.id })
      .eq('id', changeOrder.id);

    return Response.json({ url: session.url, sessionId: session.id });

  } catch (err) {
    console.error('Change order payment error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
