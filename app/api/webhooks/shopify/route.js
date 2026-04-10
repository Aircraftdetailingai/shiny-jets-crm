import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// SKU → plan mapping (Seal Subscriptions)
const SKU_PLAN_MAP = {
  'SJ-CRM-FREE': 'free',
  'SJ-CRM-PRO': 'pro',
  'SJ-CRM-BUSINESS': 'business',
  'SJ-CRM-ENTERPRISE': 'enterprise',
};

// Price fallback ranges (cents not used here — raw dollar floats from Shopify)
function planFromPrice(price) {
  const p = parseFloat(price);
  if (p === 0) return 'free';
  if (p >= 70 && p <= 90) return 'pro';
  if (p >= 140 && p <= 160) return 'business';
  if (p >= 850 && p <= 950) return 'enterprise';
  return null;
}

// Resolve plan from a Shopify line item
function resolvePlan(item) {
  // 1. Exact SKU match
  const sku = (item.sku || '').toUpperCase().trim();
  if (SKU_PLAN_MAP[sku]) return SKU_PLAN_MAP[sku];

  // 2. Partial SKU match (e.g. "SJ-CRM-PRO-MONTHLY")
  for (const [prefix, plan] of Object.entries(SKU_PLAN_MAP)) {
    if (sku.includes(prefix)) return plan;
  }

  // 3. Title match
  const title = (item.title || '').toLowerCase();
  if (title.includes('enterprise')) return 'enterprise';
  if (title.includes('business')) return 'business';
  if (title.includes('pro')) return 'pro';
  if (title.includes('free')) return 'free';

  // 4. Price fallback
  return planFromPrice(item.price);
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

// Extract customer email from a Shopify order payload, falling back through
// the 4 known locations. Returns '' if none are present.
function extractEmail(payload) {
  const candidates = [
    payload?.customer?.email,
    payload?.email,
    payload?.contact_email,
    payload?.billing_address?.email,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim()) {
      return c.toLowerCase().trim();
    }
  }
  return '';
}

function verifyHmac(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('[shopify-webhook] RESEND_API_KEY not configured');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
        reply_to: 'brett@shinyjets.com',
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[shopify-webhook] Resend rejected email to ${to}:`, res.status, body);
      return false;
    }
    console.log(`[shopify-webhook] Email sent to ${to}: ${subject}`);
    return true;
  } catch (e) {
    console.error(`[shopify-webhook] Email send error to ${to}:`, e.message);
    return false;
  }
}

function planChangeEmail(email, oldPlan, newPlan) {
  const labels = { free: 'Free', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };
  const newLabel = labels[newPlan] || newPlan;
  const oldLabel = labels[oldPlan] || oldPlan;

  if (newPlan === 'free') {
    // Downgrade / cancellation
    return sendEmail(
      email,
      'Your Shiny Jets CRM subscription has been cancelled',
      `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#333;">Subscription Cancelled</h2>
        <p>Your plan has been moved from <strong>${oldLabel}</strong> to the <strong>Free</strong> plan.</p>
        <p>You still have access to your account with Free-tier features. Your data is preserved.</p>
        <p>Ready to resubscribe? Visit <a href="https://shinyjets.com" style="color:#007CB1;">shinyjets.com</a>.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
      </body></html>`,
    );
  }

  const isUpgrade = ['free', 'pro', 'business'].indexOf(oldPlan) < ['free', 'pro', 'business'].indexOf(newPlan);
  const verb = isUpgrade ? 'upgraded' : 'changed';

  return sendEmail(
    email,
    `Your Shiny Jets CRM plan has been ${verb} to ${newLabel}`,
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#333;">Plan ${isUpgrade ? 'Upgrade' : 'Change'} Confirmed</h2>
      <p>Your Shiny Jets CRM plan has been ${verb} from <strong>${oldLabel}</strong> to <strong>${newLabel}</strong>.</p>
      <p>Your new features are active immediately. Log in at <a href="https://crm.shinyjets.com" style="color:#007CB1;">crm.shinyjets.com</a> to get started.</p>
      <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
    </body></html>`,
  );
}

async function sendSMS(to, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return;
  const params = new URLSearchParams({ From: from, To: to, Body: message });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
}

function generateTempPassword() {
  const adj = ['Swift', 'Bright', 'Shiny', 'Aero', 'Smooth', 'Rapid', 'Sleek', 'Bold'];
  const noun = ['Jet', 'Wing', 'Sky', 'Tail', 'Eagle', 'Falcon', 'Hawk', 'Cloud'];
  const a = adj[Math.floor(Math.random() * adj.length)];
  const n = noun[Math.floor(Math.random() * noun.length)];
  return `${a}${n}${Math.floor(100 + Math.random() * 900)}`;
}

// ─── Find detailer by email or Shopify customer ID ───
async function findDetailer(supabase, payload) {
  const email = extractEmail(payload);
  const customerId = payload?.customer?.id || payload?.customer_id;

  if (email) {
    const { data } = await supabase.from('detailers').select('*').eq('email', email).maybeSingle();
    if (data) return data;
  }
  if (customerId) {
    const { data } = await supabase.from('detailers').select('*').eq('shopify_customer_id', String(customerId)).maybeSingle();
    if (data) return data;
  }
  return null;
}

// ─── Update plan and send notifications ───
async function updatePlan(supabase, detailer, newPlan, extra = {}) {
  const oldPlan = detailer.plan || 'free';
  if (oldPlan === newPlan && !extra.subscription_status) return { oldPlan, newPlan, changed: false };

  await supabase.from('detailers').update({
    plan: newPlan,
    subscription_status: 'active',
    subscription_source: 'shopify',
    ...extra,
  }).eq('id', detailer.id);

  // Confirmation email
  if (oldPlan !== newPlan) {
    try { await planChangeEmail(detailer.email, oldPlan, newPlan); } catch {}
  }

  // Admin SMS
  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    await sendSMS(adminPhone, `Plan change: ${detailer.email} ${oldPlan}→${newPlan}`);
  }

  return { oldPlan, newPlan, changed: true };
}

// ─── Handle: orders/paid ───
async function handleOrderPaid(supabase, payload) {
  const items = payload?.line_items || [];
  let plan = null;
  for (const item of items) {
    plan = resolvePlan(item);
    if (plan) break;
  }
  if (!plan) {
    console.log('[shopify-webhook] orders/paid: no matching plan, skipping');
    return;
  }

  const email = extractEmail(payload);
  if (!email) {
    console.error('[shopify-webhook] orders/paid: no customer email found in payload, cannot create account');
    return;
  }
  console.log(`[shopify-webhook] orders/paid: email=${email} plan=${plan}`);

  const detailer = await findDetailer(supabase, payload);
  const shopifyCustomerId = String(payload?.customer?.id || '');

  if (detailer) {
    // Reactivate if suspended
    const extra = { shopify_customer_id: shopifyCustomerId };
    if (detailer.status === 'suspended') extra.status = 'active';
    await updatePlan(supabase, detailer, plan, extra);
  } else {
    // New customer — create account with temp password
    const tempPassword = generateTempPassword();
    const bcrypt = (await import('bcryptjs')).default;
    const hashed = bcrypt.hashSync(tempPassword, 10);
    const name = payload?.customer?.first_name
      ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim()
      : 'Customer';

    const { data: inserted } = await supabase
      .from('detailers')
      .insert({
        email,
        name,
        phone: payload?.customer?.phone || null,
        password_hash: hashed,
        must_change_password: true,
        status: 'active',
        plan,
        subscription_status: 'active',
        subscription_source: 'shopify',
        shopify_customer_id: shopifyCustomerId,
      })
      .select()
      .maybeSingle();

    if (inserted) {
      console.log(`[shopify-webhook] Created detailer ${inserted.id} for ${email}`);
      const labels = { free: 'Free', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };
      const firstName = (name || '').split(' ')[0] || 'there';
      await sendEmail(
        email,
        `Welcome to Shiny Jets CRM — your ${labels[plan]} account is ready`,
        `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
          <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
            <h1 style="color:#007CB1;margin:0 0 8px;font-size:24px;">Welcome aboard, ${firstName}!</h1>
            <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#555;">Your Shiny Jets CRM <strong>${labels[plan]}</strong> account is ready. Here are your login details:</p>

            <div style="background:#f0f7fb;border:1px solid #cfe4f0;border-radius:8px;padding:18px 20px;margin:20px 0;">
              <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Login URL</p>
              <p style="margin:0 0 16px;"><a href="https://crm.shinyjets.com/login" style="color:#007CB1;font-weight:600;text-decoration:none;">crm.shinyjets.com/login</a></p>

              <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Username</p>
              <p style="margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#1a1a1a;">${email}</p>

              <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
              <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:600;color:#007CB1;letter-spacing:0.05em;">${tempPassword}</p>
            </div>

            <div style="text-align:center;margin:28px 0;">
              <a href="https://crm.shinyjets.com/login" style="display:inline-block;padding:14px 32px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Log In Now</a>
            </div>

            <h3 style="font-size:15px;color:#1a1a1a;margin:32px 0 12px;">Get Started in 3 Steps</h3>
            <ol style="margin:0;padding-left:20px;line-height:1.8;font-size:14px;color:#555;">
              <li><strong>Set up your services</strong> — Add your service menu and hourly rate in Settings</li>
              <li><strong>Connect Stripe</strong> — Accept payments directly through your quotes</li>
              <li><strong>Send your first quote</strong> — Pick an aircraft, choose services, send to a customer in 2 minutes</li>
            </ol>

            <p style="font-size:13px;color:#666;line-height:1.6;margin:24px 0 0;">You'll be prompted to change your password after your first login. Need help? Just reply to this email.</p>

            <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
            <p style="font-size:11px;color:#999;margin:0;text-align:center;">Shiny Jets CRM &middot; <a href="https://crm.shinyjets.com" style="color:#999;">crm.shinyjets.com</a></p>
          </div>
        </body></html>`,
      );

      // Drip schedule
      const now = new Date();
      const dripRows = [0, 1, 3, 5, 7].map(offset => ({
        detailer_id: inserted.id,
        message_id: `drip-day-${offset}`,
        scheduled_for: new Date(now.getTime() + offset * 86400000).toISOString(),
      }));
      await supabase.from('drip_messages').insert(dripRows);

      const adminPhone = process.env.ADMIN_PHONE;
      if (adminPhone) {
        await sendSMS(adminPhone, `New Shopify signup: ${email} (${plan})`);
      }
    }
  }
}

// ─── Handle: subscription update (upgrade/downgrade) ───
async function handleSubscriptionUpdate(supabase, payload) {
  const detailer = await findDetailer(supabase, payload);
  if (!detailer) return;

  const items = payload?.line_items || [];
  let plan = null;
  for (const item of items) {
    plan = resolvePlan(item);
    if (plan) break;
  }
  if (!plan) return;

  await updatePlan(supabase, detailer, plan, {
    shopify_customer_id: String(payload?.customer?.id || payload?.customer_id || detailer.shopify_customer_id || ''),
  });
}

// ─── Handle: subscription cancel / expire ───
async function handleSubscriptionCancel(supabase, payload) {
  const detailer = await findDetailer(supabase, payload);
  if (!detailer) return;

  const oldPlan = detailer.plan || 'free';
  await supabase.from('detailers').update({
    plan: 'free',
    subscription_status: 'cancelled',
    subscription_source: 'shopify',
  }).eq('id', detailer.id);

  if (oldPlan !== 'free') {
    try { await planChangeEmail(detailer.email, oldPlan, 'free'); } catch {}
  }

  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    await sendSMS(adminPhone, `Subscription cancelled: ${detailer.email} (was ${oldPlan}→free)`);
  }
}

// ─── Handle: billing failure ───
async function handleBillingFailure(supabase, payload) {
  const detailer = await findDetailer(supabase, payload);
  if (!detailer) return;

  await supabase.from('detailers').update({ status: 'suspended' }).eq('id', detailer.id);

  await sendEmail(
    detailer.email,
    'Payment failed — Shiny Jets CRM account paused',
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#333;">Payment Failed</h2>
      <p>We were unable to process your subscription payment. Your account has been paused.</p>
      <p>Please update your payment method to restore access.</p>
      <p><a href="https://shinyjets.com" style="color:#007CB1;">Update payment method →</a></p>
      <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
    </body></html>`,
  );

  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    await sendSMS(adminPhone, `Payment failed: ${detailer.email}`);
  }
}

// ─── Handle: billing success (reactivate suspended) ───
async function handleBillingSuccess(supabase, payload) {
  const detailer = await findDetailer(supabase, payload);
  if (!detailer || detailer.status !== 'suspended') return;

  await supabase.from('detailers').update({ status: 'active' }).eq('id', detailer.id);

  await sendEmail(
    detailer.email,
    'Payment received — Shiny Jets CRM reactivated',
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#333;">Account Reactivated</h2>
      <p>Your payment has been processed and your Shiny Jets CRM account is active again.</p>
      <p><a href="https://crm.shinyjets.com" style="color:#007CB1;">Log in →</a></p>
      <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
    </body></html>`,
  );
}

// ─── Main webhook handler ───
export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-shopify-hmac-sha256');
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!verifyHmac(rawBody, signature, secret)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const topic = request.headers.get('x-shopify-topic');
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const supabase = getSupabase();

  // Log all webhooks
  try {
    await supabase.from('webhook_logs').insert({
      source: 'shopify',
      topic,
      payload,
      processed: false,
    });
  } catch {}

  try {
    switch (topic) {
      case 'orders/paid':
        await handleOrderPaid(supabase, payload);
        break;

      case 'subscription_contracts/update':
      case 'subscriptions/update':
        // Check if this is a cancellation or a plan change
        if (payload.status === 'cancelled' || payload.status === 'expired') {
          await handleSubscriptionCancel(supabase, payload);
        } else {
          await handleSubscriptionUpdate(supabase, payload);
        }
        break;

      case 'subscription_contracts/cancel':
      case 'app_subscriptions/update':
        await handleSubscriptionCancel(supabase, payload);
        break;

      case 'subscription_billing_attempts/failure':
        await handleBillingFailure(supabase, payload);
        break;

      case 'subscription_billing_attempts/success':
        await handleBillingSuccess(supabase, payload);
        break;
    }

    // Mark webhook processed
    await supabase.from('webhook_logs')
      .update({ processed: true })
      .eq('source', 'shopify')
      .eq('topic', topic)
      .order('created_at', { ascending: false })
      .limit(1);
  } catch (err) {
    console.error(`Shopify webhook [${topic}] error:`, err);
  }

  return new Response('OK', { status: 200 });
}
