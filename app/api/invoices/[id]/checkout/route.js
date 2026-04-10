import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function cleanKey(k) {
  return k?.replace(/\\n/g, '').trim() || null;
}

// POST - Create Stripe checkout for invoice payment (public, accessed via share_link)
export async function POST(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;
    const { share_link } = await request.json();

    if (!share_link) {
      return Response.json({ error: 'share_link is required' }, { status: 400 });
    }

    // Fetch invoice by id + share_link
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('share_link', share_link)
      .single();

    if (invoiceError || !invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status === 'paid') {
      return Response.json({ error: 'Invoice already paid' }, { status: 400 });
    }

    // Fetch detailer for Stripe keys and plan
    const { data: detailer } = await supabase
      .from('detailers')
      .select('stripe_secret_key, stripe_account_id, company, plan')
      .eq('id', invoice.detailer_id)
      .single();

    const platformKey = cleanKey(process.env.STRIPE_SECRET_KEY);
    const detailerKey = cleanKey(detailer?.stripe_secret_key);

    if (!platformKey && !detailerKey) {
      return Response.json({ error: 'Payment processing not configured', code: 'stripe_not_configured' }, { status: 400 });
    }

    // Build line items from invoice
    const invoiceLineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
    let stripeLineItems;

    if (invoiceLineItems.length > 0) {
      stripeLineItems = invoiceLineItems.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.description || item.name || 'Service',
          },
          unit_amount: Math.round((item.amount || item.price || 0) * 100),
        },
        quantity: item.quantity || 1,
      }));
    } else {
      // Fallback: single line item from total
      stripeLineItems = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice${invoice.aircraft_model ? ` - ${invoice.aircraft_model}` : ''}`,
            description: `From ${detailer?.company || 'Service Provider'}`,
          },
          unit_amount: Math.round((invoice.total || 0) * 100),
        },
        quantity: 1,
      }];
    }

    const totalAmountCents = Math.round((invoice.total || 0) * 100);

    const baseSessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: stripeLineItems,
      success_url: `https://crm.shinyjets.com/invoice/${invoice.share_link}?payment=success`,
      cancel_url: `https://crm.shinyjets.com/invoice/${invoice.share_link}?payment=cancelled`,
      metadata: {
        invoice_id: invoice.id,
        detailer_id: invoice.detailer_id,
        type: 'invoice',
      },
    };

    // Try Connect first if platform key and connected account exist
    const canConnect = !!(detailer?.stripe_account_id && platformKey);

    if (canConnect) {
      try {
        const feeRate = PLATFORM_FEES[detailer.plan || 'free'] || PLATFORM_FEES.free;
        const platformFee = Math.round(totalAmountCents * feeRate);
        console.log(`[invoice-checkout-connect] dest=${detailer.stripe_account_id} plan=${detailer.plan} feeRate=${feeRate} fee=${platformFee}cents total=${totalAmountCents}cents`);

        const stripe = new Stripe(platformKey);
        const session = await stripe.checkout.sessions.create({
          ...baseSessionParams,
          payment_intent_data: {
            application_fee_amount: platformFee,
            transfer_data: {
              destination: detailer.stripe_account_id,
            },
          },
        });

        // Update invoice with stripe session id
        await supabase
          .from('invoices')
          .update({ stripe_session_id: session.id })
          .eq('id', id);

        return Response.json({ url: session.url });
      } catch (connectErr) {
        console.error(`[invoice-checkout-connect-failed] ${connectErr.type} | ${connectErr.code} | ${connectErr.message}`);
        console.log('[invoice-checkout] Falling back to direct charge...');
      }
    }

    // Direct charge fallback
    if (detailerKey) {
      console.log(`[invoice-checkout-direct] key=${detailerKey.slice(0, 12)}... total=${totalAmountCents}cents invoice=${invoice.id}`);
      const stripe = new Stripe(detailerKey);
      const session = await stripe.checkout.sessions.create(baseSessionParams);

      await supabase
        .from('invoices')
        .update({ stripe_session_id: session.id })
        .eq('id', id);

      return Response.json({ url: session.url });
    }

    return Response.json({ error: 'Payment processing unavailable', code: 'stripe_not_configured' }, { status: 400 });
  } catch (err) {
    console.error('[invoice-checkout-error]', err.message || err);
    return Response.json({ error: err.message || 'Payment processing failed', code: err.code || 'processing_error' }, { status: 500 });
  }
}
