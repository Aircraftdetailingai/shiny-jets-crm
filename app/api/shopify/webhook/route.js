import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendBetaInviteEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// Map Shopify product titles to plans
const PRODUCT_PLAN_MAP = {
  'shiny jets crm pro': { plan: 'pro', price: 79 },
  'shiny jets crm business': { plan: 'business', price: 149 },
  'shiny jets crm enterprise': { plan: 'enterprise', price: 299 },
};

function mapProductToPlan(title) {
  if (!title) return null;
  const key = title.toLowerCase().trim();
  for (const [pattern, config] of Object.entries(PRODUCT_PLAN_MAP)) {
    if (key.includes(pattern)) return config;
  }
  // Fallback: check by price in line items
  return null;
}

function mapPriceToplan(price) {
  const p = parseFloat(price);
  if (p >= 290 && p <= 310) return { plan: 'enterprise', price: 299 };
  if (p >= 140 && p <= 160) return { plan: 'business', price: 149 };
  if (p >= 70 && p <= 90) return { plan: 'pro', price: 79 };
  return null;
}

// Verify Shopify HMAC signature
function verifyShopifyWebhook(body, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET not configured');
    return false;
  }
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

export async function POST(request) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
  const topic = request.headers.get('x-shopify-topic');

  // Verify HMAC signature
  if (!hmacHeader || !verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.error('Shopify webhook: Invalid HMAC signature');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Shopify webhook received: ${topic}`);

  const supabase = getSupabase();

  try {
    if (topic === 'orders/paid') {
      await handleOrderPaid(supabase, payload);
    } else if (
      topic === 'subscriptions/update' ||
      topic === 'customer_payment_methods/revoke' ||
      topic === 'subscription_contracts/update'
    ) {
      // Handle subscription cancellation
      if (payload.status === 'cancelled' || payload.status === 'expired') {
        await handleSubscriptionCancelled(supabase, payload);
      }
    } else if (topic === 'app_subscriptions/update') {
      if (payload.app_subscription?.status === 'cancelled' || payload.app_subscription?.status === 'expired') {
        const email = payload.app_subscription?.admin_graphql_api_customer_email;
        if (email) {
          await handleCancellationByEmail(supabase, email);
        }
      }
    }
  } catch (err) {
    console.error('Shopify webhook processing error:', err);
    return Response.json({ error: 'Processing error' }, { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleOrderPaid(supabase, order) {
  const customerEmail = order.customer?.email?.toLowerCase()?.trim();
  if (!customerEmail) {
    console.log('Shopify order: No customer email, skipping');
    return;
  }

  const shopifyCustomerId = String(order.customer?.id || '');

  // Determine plan from line items
  let planConfig = null;
  for (const item of (order.line_items || [])) {
    planConfig = mapProductToPlan(item.title);
    if (!planConfig) planConfig = mapPriceToplan(item.price);
    if (planConfig) break;
  }

  if (!planConfig) {
    console.log(`Shopify order: No matching plan found for items: ${(order.line_items || []).map(i => `${i.title} ($${i.price})`).join(', ')}`);
    return;
  }

  console.log(`Shopify order: ${customerEmail} → ${planConfig.plan} plan`);

  // Find existing detailer
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, email, plan')
    .eq('email', customerEmail)
    .single();

  if (detailer) {
    // Update existing detailer
    const { error } = await supabase
      .from('detailers')
      .update({
        plan: planConfig.plan,
        subscription_status: 'active',
        shopify_customer_id: shopifyCustomerId,
        subscription_source: 'shopify',
      })
      .eq('id', detailer.id);

    if (error) {
      console.error(`Shopify: Failed to update detailer ${detailer.id}:`, error.message);
    } else {
      console.log(`Shopify: Updated detailer ${detailer.id} to ${planConfig.plan}`);
    }
  } else {
    // No account — create beta invite
    const token = crypto.randomUUID();
    const { error: inviteError } = await supabase
      .from('beta_invites')
      .insert({
        email: customerEmail,
        token,
        plan: planConfig.plan,
        duration_days: 365,
        note: `Shopify order #${order.order_number || order.id}`,
        status: 'pending',
      });

    if (inviteError) {
      console.error('Shopify: Failed to create beta invite:', inviteError.message);
    } else {
      console.log(`Shopify: Created beta invite for ${customerEmail}`);
      // Send welcome email
      try {
        await sendBetaInviteEmail({
          email: customerEmail,
          plan: planConfig.plan,
          durationDays: 365,
          note: 'Your Shiny Jets CRM account is ready',
          token,
        });
      } catch (emailErr) {
        console.error('Shopify: Failed to send invite email:', emailErr.message);
      }
    }
  }
}

async function handleSubscriptionCancelled(supabase, payload) {
  const email = payload.customer?.email || payload.email;
  if (email) {
    await handleCancellationByEmail(supabase, email.toLowerCase().trim());
  }
}

async function handleCancellationByEmail(supabase, email) {
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, email, plan')
    .eq('email', email)
    .single();

  if (!detailer) {
    console.log(`Shopify cancellation: No detailer found for ${email}`);
    return;
  }

  const { error } = await supabase
    .from('detailers')
    .update({
      plan: 'free',
      subscription_status: 'cancelled',
      subscription_source: 'shopify',
    })
    .eq('id', detailer.id);

  if (error) {
    console.error(`Shopify: Failed to downgrade detailer ${detailer.id}:`, error.message);
  } else {
    console.log(`Shopify: Downgraded detailer ${detailer.id} (${email}) to free`);
  }

  // Send cancellation notification
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@shinyjets.com>',
      to: email,
      subject: 'Your Shiny Jets CRM subscription has been cancelled',
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#333;">Subscription Cancelled</h2>
        <p>Your Shiny Jets CRM subscription has been cancelled and your account has been moved to the Free plan.</p>
        <p>You can still access your account with limited features. Your data will be preserved.</p>
        <p>If you'd like to resubscribe, visit <a href="https://shinyjets.com" style="color:#007CB1;">shinyjets.com</a>.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">Powered by Shiny Jets</p>
      </body></html>`,
      text: `Your Shiny Jets CRM subscription has been cancelled. Your account has been moved to the Free plan. You can resubscribe at shinyjets.com.`,
    });
  } catch (emailErr) {
    console.error('Shopify: Failed to send cancellation email:', emailErr.message);
  }
}
