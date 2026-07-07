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

// Shared logic for marking an invoice paid from a Checkout Session. Used by
// both checkout.session.completed (card path — fires immediately) and
// checkout.session.async_payment_succeeded (ACH path — fires on settlement).
// Idempotent: skips when the invoice is already paid or can't be found.
// Side effects (detailer notification + activity log) mirror the quote branch.
async function markInvoicePaidFromSession(supabase, session, eventTypeLabel) {
  const invoiceId = session.metadata?.invoice_id;

  // Find by metadata.invoice_id first, fall back to stripe_session_id. Two
  // queries rather than .or() so UUID vs text column types are unambiguous.
  let invoice = null;
  if (invoiceId) {
    const { data } = await supabase
      .from('invoices')
      .select('id, detailer_id, total, balance_due, amount_paid, status, customer_name, customer_email, aircraft_model')
      .eq('id', invoiceId)
      .maybeSingle();
    invoice = data || null;
  }
  if (!invoice && session.id) {
    const { data } = await supabase
      .from('invoices')
      .select('id, detailer_id, total, balance_due, amount_paid, status, customer_name, customer_email, aircraft_model')
      .eq('stripe_session_id', session.id)
      .maybeSingle();
    invoice = data || null;
  }

  if (!invoice) {
    console.error(`[stripe webhook ${eventTypeLabel}] No invoice found for session=${session.id} metadata.invoice_id=${invoiceId}`);
    return;
  }

  if (invoice.status === 'paid') {
    console.log(`[stripe webhook ${eventTypeLabel}] Invoice ${invoice.id} already paid — idempotent skip`);
    return;
  }

  // payment_type drives the status transition:
  //   'deposit' → status='deposit_paid', amount_paid += slice, paid_at NULL
  //   'balance' → status='paid', amount_paid = total, balance_due = 0
  //   'full' / unset → status='paid', amount_paid = slice, balance_due = 0
  const paymentType = session.metadata?.payment_type || 'full';
  const totalDollars = parseFloat(invoice.total) || 0;
  const sliceDollars = typeof session.amount_total === 'number'
    ? session.amount_total / 100
    : totalDollars;
  const priorAmountPaid = parseFloat(invoice.amount_paid) || 0;

  let updates;
  if (paymentType === 'deposit') {
    // Idempotent re-check: if we already flipped to deposit_paid (e.g. duplicate
    // event squeaked past the webhook_logs guard), skip.
    if (invoice.status === 'deposit_paid') {
      console.log(`[stripe webhook ${eventTypeLabel}] Invoice ${invoice.id} already deposit_paid — idempotent skip`);
      return;
    }
    const newAmountPaid = Math.round((priorAmountPaid + sliceDollars) * 100) / 100;
    const newBalance = Math.max(0, Math.round((totalDollars - newAmountPaid) * 100) / 100);
    updates = {
      status: 'deposit_paid',
      amount_paid: newAmountPaid,
      balance_due: newBalance,
      // Store the deposit PI in its own column so the eventual balance
      // payment doesn't overwrite it. stripe_payment_intent_id is reserved
      // for the final/balance charge.
      deposit_payment_intent_id: session.payment_intent || null,
      updated_at: new Date().toISOString(),
    };
  } else if (paymentType === 'balance') {
    updates = {
      status: 'paid',
      amount_paid: totalDollars,
      balance_due: 0,
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: session.payment_intent || null,
      updated_at: new Date().toISOString(),
    };
  } else {
    // 'full' (or unset) — original behavior preserved.
    updates = {
      status: 'paid',
      amount_paid: sliceDollars,
      balance_due: 0,
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: session.payment_intent || null,
      updated_at: new Date().toISOString(),
    };
  }

  const { error: updateErr } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', invoice.id);

  if (updateErr) {
    console.error(`[stripe webhook ${eventTypeLabel}] Failed to mark invoice ${invoice.id}:`, updateErr.message);
    return;
  }
  // For local downstream side effects, treat the dollar-value of THIS
  // payment slice as the amount.
  const amountPaid = sliceDollars;

  // Side effects. Best-effort — each wrapped so a single failure doesn't
  // break the rest. Email requires the invoice's share_link for the portal
  // button; keep this simple and defer email to the existing invoice/send
  // flow if we don't have it here.
  try {
    const { data: detailer } = await supabase
      .from('detailers')
      .select('id, email, name, company, fcm_token, plan, sms_enabled')
      .eq('id', invoice.detailer_id)
      .single();

    if (detailer?.id) {
      notifyPaymentReceived({
        detailerId: detailer.id,
        quote: { ...invoice, total_price: amountPaid, aircraft_model: invoice.aircraft_model || '' },
        amount: amountPaid,
      }).catch(console.error);
    }

    if (invoice.customer_email) {
      const aircraft = invoice.aircraft_model || 'Invoice';
      logActivity({
        detailer_id: invoice.detailer_id,
        customer_email: invoice.customer_email,
        activity_type: ACTIVITY.PAYMENT_RECEIVED,
        summary: `Payment received $${Number(amountPaid || 0).toLocaleString()} for ${aircraft}`,
        details: { invoice_id: invoice.id, amount: amountPaid, source: eventTypeLabel },
      });
    }
  } catch (e) {
    console.error(`[stripe webhook ${eventTypeLabel}] Side effects failed for invoice ${invoice.id}:`, e?.message || e);
  }
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

  // Idempotency — Stripe retries on non-2xx (and sometimes even on 2xx) so
  // the same event.id can arrive more than once. If we already processed it
  // successfully, return 200 immediately without re-running side effects.
  // Best-effort — if webhook_logs is unreachable we continue rather than
  // blocking a legitimate event.
  try {
    const { data: existing } = await supabase
      .from('webhook_logs')
      .select('id, processed')
      .eq('source', 'stripe')
      .eq('processed', true)
      .filter('payload->>id', 'eq', event.id)
      .limit(1)
      .maybeSingle();
    if (existing) {
      console.log(`[stripe webhook] Duplicate event ${event.id} (${event.type}) skipped — already processed row ${existing.id}`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
    }
  } catch (e) {
    console.error('[stripe webhook] Idempotency check failed (continuing):', e?.message || e);
  }

  // Insert a log row up front with processed=false so we have a forensic
  // trail for every signature-verified event regardless of branch outcome.
  let logRowId = null;
  try {
    const { data: logRow } = await supabase
      .from('webhook_logs')
      .insert({ source: 'stripe', topic: event.type, payload: event, processed: false })
      .select('id')
      .single();
    logRowId = logRow?.id || null;
  } catch (e) {
    console.error('[stripe webhook] Failed to insert webhook_logs row (continuing):', e?.message || e);
  }

  // All event handling goes through one try/catch so a bug in one branch
  // can't poison future retries. On catch we stamp the log row with the
  // error and still return 200 — returning non-2xx makes Stripe retry the
  // event up to 3 days, which is almost never what we want for a code bug.
  try {
  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const quoteId = session.metadata?.quote_id;
      const invoiceId = session.metadata?.invoice_id;
      const metaType = session.metadata?.type;

      if (quoteId) {
        // Check if this is a deposit payment
        const isDeposit = session.metadata?.payment_type === 'deposit';
        const depositPct = parseInt(session.metadata?.deposit_percentage) || 0;

        // Fetch quote first to get total_price for deposit calculation
        const { data: quote } = await supabase
          .from('quotes')
          .select('*, detailers(*)')
          .eq('id', quoteId)
          .single();

        // Idempotency (mirrors the invoice helper): if the quote already
        // reflects the payment we're about to apply, skip — a duplicate/re-fired
        // event must not re-run the update, auto-invoice, or notifications.
        if (quote) {
          if (isDeposit && quote.status === 'deposit_paid') {
            console.log(`[stripe webhook checkout.session.completed] Quote ${quoteId} already deposit_paid — idempotent skip`);
            break;
          }
          if (!isDeposit && (quote.status === 'paid' || quote.status === 'approved')) {
            console.log(`[stripe webhook checkout.session.completed] Quote ${quoteId} already paid — idempotent skip`);
            break;
          }
        }

        if (isDeposit && quote) {
          const depositAmount = Math.round((quote.total_price || 0) * depositPct) / 100;
          const { error: depUpdErr } = await supabase
            .from('quotes')
            .update({
              status: 'deposit_paid',
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent,
              amount_paid: depositAmount,
              balance_due: (quote.total_price || 0) - depositAmount,
            })
            .eq('id', quoteId);
          if (depUpdErr) console.error(`[stripe webhook checkout.session.completed] deposit quote update failed for ${quoteId}:`, depUpdErr.message);

          // Auto-create partially_paid invoice for deposit
          try {
            const { nanoid } = await import('nanoid');
            const invoiceNumber = `INV-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${nanoid(4).toUpperCase()}`;
            const detailer = quote.detailers;
            const { error: invErr } = await supabase.from('invoices').insert({
              detailer_id: quote.detailer_id,
              quote_id: quote.id,
              invoice_number: invoiceNumber,
              status: 'partially_paid',
              customer_name: quote.client_name || quote.customer_name || '',
              customer_email: quote.client_email || quote.customer_email || '',
              detailer_name: detailer?.name || '',
              detailer_email: detailer?.email || '',
              detailer_company: detailer?.company || '',
              aircraft: quote.aircraft_model || quote.aircraft_type || '',
              aircraft_model: quote.aircraft_model || quote.aircraft_type || '',
              total: quote.total_price || 0,
              subtotal: quote.total_price || 0,
              amount_paid: depositAmount,
              deposit_amount: depositAmount,
              balance_due: (quote.total_price || 0) - depositAmount,
              booking_mode: 'deposit',
              due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
            if (invErr) console.error(`[stripe webhook checkout.session.completed] deposit auto-invoice insert failed for quote ${quote.id}:`, invErr.message);
          } catch (e) { console.error('Auto-invoice for deposit failed:', e); }
        } else {
          // Full payment — update quote as paid
          const { error: fullUpdErr } = await supabase
            .from('quotes')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent,
              amount_paid: quote?.total_price || 0,
              balance_due: 0,
            })
            .eq('id', quoteId);
          if (fullUpdErr) console.error(`[stripe webhook checkout.session.completed] full quote update failed for ${quoteId}:`, fullUpdErr.message);
        }

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
      } else if (invoiceId || metaType === 'invoice') {
        // Invoice flow — customer paid an invoice via Stripe Checkout. The
        // session metadata was set in app/api/invoices/[id]/checkout. Shared
        // helper handles the DB update + side effects idempotently.
        await markInvoicePaidFromSession(supabase, session, 'checkout.session.completed');
      } else {
        console.warn(`[stripe webhook checkout.session.completed] No recognized metadata on session ${session.id} (type=${metaType}, quote_id=${quoteId}, invoice_id=${invoiceId}) — skipping`);
      }
      break;
    }

    // ACH payments (us_bank_account) complete the Checkout Session
    // immediately, but the actual bank settlement fires days later as
    // checkout.session.async_payment_succeeded. Re-use the invoice helper —
    // it's idempotent so it's safe if both events arrive.
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      const metaType = session.metadata?.type;
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId || metaType === 'invoice') {
        await markInvoicePaidFromSession(supabase, session, 'checkout.session.async_payment_succeeded');
      } else {
        console.log(`[stripe webhook async_payment_succeeded] No invoice metadata on session ${session.id} — skipping`);
      }
      break;
    }

    // Direct payment_intent flow (rare for invoices, but captured as a
    // safety net — e.g. manual PaymentIntents outside Checkout). Find by
    // stripe_payment_intent_id. Skip if invoice is already paid or absent.
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      if (!pi?.id) { break; }
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, detailer_id, total, balance_due, amount_paid, status, customer_name, customer_email, aircraft_model')
        .eq('stripe_payment_intent_id', pi.id)
        .maybeSingle();
      if (!invoice) {
        // Not every PI belongs to an invoice (subscriptions, deposits,
        // platform fees all use PaymentIntents). Quiet skip.
        break;
      }
      if (invoice.status === 'paid') {
        console.log(`[stripe webhook payment_intent.succeeded] Invoice ${invoice.id} already paid — idempotent skip`);
        break;
      }
      const amountPaid = typeof pi.amount_received === 'number'
        ? pi.amount_received / 100
        : (typeof pi.amount === 'number' ? pi.amount / 100 : parseFloat(invoice.total) || 0);
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          amount_paid: amountPaid,
          balance_due: 0,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);
      if (invoice.customer_email) {
        const aircraft = invoice.aircraft_model || 'Invoice';
        logActivity({
          detailer_id: invoice.detailer_id,
          customer_email: invoice.customer_email,
          activity_type: ACTIVITY.PAYMENT_RECEIVED,
          summary: `Payment received $${Number(amountPaid || 0).toLocaleString()} for ${aircraft}`,
          details: { invoice_id: invoice.id, amount: amountPaid, source: 'payment_intent.succeeded' },
        });
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

      // Try the quote first (most refunds come from the quote flow).
      const { data: quote } = await supabase
        .from('quotes')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();

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
      } else {
        // Also check invoices — refunds on invoice-flow payments land here.
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id, total, amount_paid')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle();
        if (invoice) {
          const refunded = charge.amount_refunded / 100;
          const isFullRefund = charge.amount_refunded >= charge.amount;
          await supabase
            .from('invoices')
            .update({
              status: isFullRefund ? 'refunded' : 'partially_refunded',
              refunded_at: new Date().toISOString(),
              refund_amount: refunded,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invoice.id);
        }
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

    case 'account.updated': {
      // Stripe Connect onboarding progress signal. When Stripe reports the
      // account is fully enabled, flip stripe_onboarding_complete so the
      // client can finally render "connected". This is the ONLY place the
      // column is ever set to true — the audit found 0 rows with it flipped
      // because no code subscribed to this event before.
      const account = event.data.object;
      const acctId = account?.id;
      if (!acctId) break;

      const { data: detailer } = await supabase
        .from('detailers')
        .select('id, stripe_onboarding_complete')
        .eq('stripe_account_id', acctId)
        .maybeSingle();

      if (!detailer) {
        console.log(`[webhook account.updated] No detailer found for stripe_account_id=${acctId}`);
        break;
      }

      const fullyEnabled = account.charges_enabled === true && account.payouts_enabled === true;
      if (fullyEnabled) {
        const { error } = await supabase
          .from('detailers')
          .update({ stripe_onboarding_complete: true })
          .eq('id', detailer.id);
        if (error) {
          console.error(`[webhook account.updated] Failed to flip onboarding_complete for ${detailer.id}:`, error.message);
        } else {
          console.log(`[webhook account.updated] Onboarding complete for detailer ${detailer.id} (account=${acctId})`);
        }
      } else {
        console.log(`[webhook account.updated] Partial state for detailer ${detailer.id} — charges_enabled=${account.charges_enabled} payouts_enabled=${account.payouts_enabled}`);
      }
      break;
    }

    default:
      // Unexpected event type
      console.log(`Unhandled event type: ${event.type}`);
  }

    // Success — stamp the log row so future duplicates get caught by the
    // idempotency check at the top.
    if (logRowId) {
      try {
        await supabase.from('webhook_logs').update({ processed: true }).eq('id', logRowId);
      } catch (e) {
        console.error('[stripe webhook] Failed to mark log row processed:', e?.message || e);
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    // Any handler threw — record the error on the log row and still return
    // 200 so Stripe doesn't queue up infinite retries for a code bug we
    // haven't diagnosed. The row will be findable in webhook_logs later.
    console.error(`[stripe webhook] Handler threw for event ${event.id} (${event.type}):`, err?.message || err);
    if (logRowId) {
      try {
        await supabase
          .from('webhook_logs')
          .update({ processed: false, error: String(err?.message || err).slice(0, 2000) })
          .eq('id', logRowId);
      } catch {}
    }
    return new Response(JSON.stringify({ received: true, error: 'handler_error' }), { status: 200 });
  }
}
