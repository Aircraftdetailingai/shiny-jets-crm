import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { sendPaymentReceivedEmail, sendPaymentConfirmedEmail } from '@/lib/email';
import { notifyQuotePaid } from '@/lib/push';
import { sendPaymentConfirmationSms } from '@/lib/sms';
import { hasPremiumAccess, PLATFORM_FEES } from '@/lib/pricing-tiers';
import { notifyPaymentReceived } from '@/lib/notifications';
import { logActivity, ACTIVITY } from '@/lib/activity-log';
import { processReferralReward } from '@/app/api/referrals/reward/route';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY?.trim());

  const supabase = getSupabase();

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const quoteId = session.metadata?.quote_id;

      if (quoteId) {
        // Update quote as paid
        await supabase
          .from('quotes')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent,
          })
          .eq('id', quoteId);

        // Fetch quote and detailer for notification
        const { data: quote } = await supabase
          .from('quotes')
          .select('*, detailers(*)')
          .eq('id', quoteId)
          .single();

        if (quote) {
          const detailer = quote.detailers;

          // Calculate fee breakdown for emails
          const plan = detailer?.plan || 'free';
          const feeRate = PLATFORM_FEES[plan] || PLATFORM_FEES.free;
          const passFee = detailer?.pass_fee_to_customer || false;
          const basePrice = quote.total_price || 0;
          const platformFeeAmount = Math.round(basePrice * feeRate * 100) / 100;
          const yourPayout = passFee ? basePrice : basePrice - platformFeeAmount;

          // Send payment received notification to detailer (email)
          if (detailer?.email) {
            try {
              await sendPaymentReceivedEmail({
                detailerEmail: detailer.email,
                detailerName: detailer.name,
                quote,
                feeBreakdown: feeRate > 0 ? { platformFee: platformFeeAmount, feeRate, yourPayout } : null,
              });
            } catch (e) {
              console.error('Failed to send detailer email:', e);
            }
          }

          // Send push notification to detailer
          if (detailer?.fcm_token) {
            notifyQuotePaid({ fcmToken: detailer.fcm_token, quote }).catch(console.error);
          }

          // In-app notification for detailer
          if (detailer?.id) {
            notifyPaymentReceived({
              detailerId: detailer.id,
              quote,
              amount: quote.total_price,
            }).catch(console.error);
          }

          // Send payment confirmation to customer (email) with fee breakdown
          if (quote.client_email) {
            try {
              const customerPlatformFee = passFee ? platformFeeAmount : 0;
              const customerPaid = passFee ? basePrice + customerPlatformFee : basePrice;

              await sendPaymentConfirmedEmail({
                customerEmail: quote.client_email,
                customerName: quote.client_name,
                quote,
                detailer,
                feeBreakdown: passFee && feeRate > 0 ? { platformFee: customerPlatformFee, feeRate, customerPaid } : null,
              });
            } catch (e) {
              console.error('Failed to send customer confirmation:', e);
            }
          }

          // Send payment confirmation to customer (SMS - business plan only)
          if (hasPremiumAccess(detailer?.plan) && detailer?.sms_enabled !== false && quote.client_phone) {
            try {
              const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quote.total_price || 0);
              await sendPaymentConfirmationSms({
                clientPhone: quote.client_phone,
                clientName: quote.client_name || '',
                aircraftDisplay: quote.aircraft_model || quote.aircraft_type || 'aircraft',
                amount,
                companyName: detailer.company || detailer.name || '',
              });
            } catch (e) {
              console.error('Payment confirmation SMS error:', e);
            }
          }
          // Process referral reward if this is a referred user's first paid quote
          if (detailer?.id) {
            processReferralReward(detailer.id).catch(e =>
              console.log('Referral reward check:', e.message || e)
            );
          }

          // Log activity
          const clientEmail = quote.client_email || quote.customer_email;
          if (clientEmail) {
            const aircraft = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
            logActivity({
              detailer_id: quote.detailer_id,
              customer_email: clientEmail,
              activity_type: ACTIVITY.PAYMENT_RECEIVED,
              summary: `Payment received $${Number(quote.total_price || 0).toLocaleString()} for ${aircraft}`,
              details: { aircraft, amount: quote.total_price },
              quote_id: quoteId,
            });
          }
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      const error = paymentIntent.last_payment_error;

      // Log the failure for debugging but don't update quote status
      // This keeps the quote as 'sent' so customer can retry
      console.log('Payment failed:', {
        quoteId: paymentIntent.metadata?.quote_id,
        errorCode: error?.code,
        declineCode: error?.decline_code,
        message: error?.message
      });
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent;

      // Find and update the quote
      const { data: quote } = await supabase
        .from('quotes')
        .select('*')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

      if (quote) {
        const isFullRefund = charge.amount_refunded >= charge.amount;
        await supabase
          .from('quotes')
          .update({
            status: isFullRefund ? 'refunded' : 'partial_refund',
            refunded_at: new Date().toISOString(),
            refund_amount: charge.amount_refunded / 100,
          })
          .eq('id', quote.id);
      }
      break;
    }

    // Subscription events for tier upgrades
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const detailerId = subscription.metadata?.detailer_id;
      const tier = subscription.metadata?.tier;

      if (detailerId && tier && subscription.status === 'active') {
        const updateData = {
          plan: tier,
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status,
          subscription_updated_at: new Date().toISOString(),
        };

        // Track promo code if used
        const promoCode = subscription.metadata?.promo_code;
        if (promoCode) {
          updateData.promo_code_used = promoCode;
        }

        await supabase
          .from('detailers')
          .update(updateData)
          .eq('id', detailerId);

        console.log(`Updated detailer ${detailerId} to ${tier} plan${promoCode ? ` with promo ${promoCode}` : ''}`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const detailerId = subscription.metadata?.detailer_id;

      if (detailerId) {
        // Downgrade to free tier when subscription is cancelled
        await supabase
          .from('detailers')
          .update({
            plan: 'free',
            subscription_status: 'cancelled',
            subscription_updated_at: new Date().toISOString(),
          })
          .eq('id', detailerId);

        console.log(`Downgraded detailer ${detailerId} to free plan`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      if (subscriptionId) {
        // Get subscription to find detailer
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const detailerId = subscription.metadata?.detailer_id;

        if (detailerId) {
          await supabase
            .from('detailers')
            .update({
              subscription_status: 'past_due',
              subscription_updated_at: new Date().toISOString(),
            })
            .eq('id', detailerId);

          console.log(`Marked detailer ${detailerId} subscription as past_due`);
        }
      }
      break;
    }

    default:
      // Unexpected event type
      console.log(`Unhandled event type: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
