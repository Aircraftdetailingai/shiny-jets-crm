import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getStripe() {
  const Stripe = (await import('stripe')).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY?.trim());
}

export async function POST(request) {
  const supabase = getSupabase();
  const stripe = await getStripe();

  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { quoteId, amount, reason } = await request.json();

    if (!quoteId) {
      return new Response(JSON.stringify({ error: 'Quote ID required' }), { status: 400 });
    }

    // Fetch quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
    }

    // Verify ownership
    if (quote.detailer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    // Check if quote is paid
    if (quote.status !== 'paid' && quote.status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Quote has not been paid' }), { status: 400 });
    }

    // Check if already refunded
    if (quote.status === 'refunded') {
      return new Response(JSON.stringify({ error: 'Quote has already been refunded' }), { status: 400 });
    }

    if (!quote.stripe_payment_intent_id) {
      return new Response(JSON.stringify({ error: 'No payment intent found for this quote' }), { status: 400 });
    }

    // Calculate refund amount (in cents)
    const totalPaid = quote.total_price || 0;
    const refundAmount = amount ? Math.min(amount, totalPaid) : totalPaid;
    const refundAmountCents = Math.round(refundAmount * 100);

    // Issue refund via Stripe
    const refund = await stripe.refunds.create({
      payment_intent: quote.stripe_payment_intent_id,
      amount: refundAmountCents,
      reason: 'requested_by_customer',
      metadata: {
        quote_id: quoteId,
        detailer_id: user.id,
        internal_reason: reason || 'No reason provided',
      },
    });

    // Update quote status
    const isFullRefund = refundAmount >= totalPaid;
    await supabase
      .from('quotes')
      .update({
        status: isFullRefund ? 'refunded' : 'partial_refund',
        refunded_at: new Date().toISOString(),
        refund_amount: refundAmount,
        refund_reason: reason || null,
        stripe_refund_id: refund.id,
      })
      .eq('id', quoteId);

    // Send email notification to customer
    if (quote.client_email) {
      try {
        const { data: detailer } = await supabase
          .from('detailers')
          .select('company, name')
          .eq('id', user.id)
          .single();

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Shiny Jets CRM <noreply@vectorav.ai>',
            to: quote.client_email,
            subject: 'Refund Confirmation',
            text: `Hi ${quote.client_name || 'there'},\n\nA refund of $${refundAmount.toFixed(2)} has been processed for your aircraft detail quote.\n\nRefund details:\n- Amount: $${refundAmount.toFixed(2)}\n- Original payment: $${totalPaid.toFixed(2)}\n${reason ? `- Reason: ${reason}` : ''}\n\nThe refund should appear on your statement within 5-10 business days.\n\nIf you have any questions, please contact ${detailer?.company || 'us'}.\n\nThank you,\n${detailer?.name || detailer?.company || 'your detailing professional'}`
          })
        });
      } catch (e) {
        console.error('Failed to send refund email:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      refundId: refund.id,
      amount: refundAmount,
      fullRefund: isFullRefund,
    }), { status: 200 });
  } catch (err) {
    console.error('Refund error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to process refund' }), { status: 500 });
  }
}
