import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { sendEmail as sendLibEmail } from '@/lib/email';
import { redeemCompInviteIfAny } from '@/lib/comp-invites';
import { normalizePlan, planName, planRank } from '@/lib/plans';
import {
  resolveCrmLineItem,
  crmPurchaseFromLineItems,
  quarterlyLiteDaysFromLineItems,
  computeCrmPlanGrant,
  computeBusinessPricingAccess,
  subscriptionItems,
  classifySubscriptionItems,
  decideCancellation,
  billingAffectsCrm,
  isCompedDetailer,
  escapeHtml,
  DAY_MS,
} from '@/lib/crm-plan-grants';
import {
  pricingPurchaseFromLineItems,
  computePricingGrant,
  orderAlreadyApplied,
  pricingToolAccessEmail,
} from '@/lib/pricing-tool-access';
import { aiPurchaseFromLineItems, computeAiAccessUntil, isAiLineItem, hasStandaloneAi } from '@/lib/detailing-ai-access';
import { askExpertVariantId, askExpertFromOrder } from '@/lib/ask-expert-payment';
import { markEscalationPaid } from '@/lib/ask-brett-server';
import { orderPaidMode } from '@/lib/shopify-webhook-routing';

export const dynamic = 'force-dynamic';

// SKU → plan resolution lives in lib/crm-plan-grants.js (pure + unit-tested):
//   SJ-CRM-FREE, SJ-CRM-LITE (30d), SJ-CRM-BUSINESS (30d), SJ-CRM-BUSINESS-YEARLY (365d)
//   legacy SJ-CRM-PRO → lite, SJ-CRM-ENTERPRISE → business
//   PRICING-QUARTERLY also grants Lite 90d; PRICING-MONTHLY is Pricing Tool only.
function resolvePlan(item) {
  return resolveCrmLineItem(item)?.plan || null;
}

// Write a detailers update. If the production DB still has a CHECK constraint
// that predates the 'lite' value, retry once with the legacy alias ('pro') so
// provisioning never silently fails (lib/plans.js treats 'pro' as Lite).
async function updateDetailerRow(supabase, id, update) {
  let { error } = await supabase.from('detailers').update(update).eq('id', id);
  if (error && update.plan === 'lite' && (error.code === '23514' || /check constraint/i.test(error.message || ''))) {
    console.warn('[shopify-webhook] plan=lite rejected by DB constraint; retrying with legacy alias pro. Run database/migrations/20260927_three_tier_plans.sql.');
    ({ error } = await supabase.from('detailers').update({ ...update, plan: 'pro' }).eq('id', id));
  }
  if (error) console.error('[shopify-webhook] detailers update failed:', id, error.message);
  return { error };
}

async function insertDetailerRow(supabase, row) {
  let res = await supabase.from('detailers').insert(row).select().maybeSingle();
  if (res.error && row.plan === 'lite' && (res.error.code === '23514' || /check constraint/i.test(res.error.message || ''))) {
    console.warn('[shopify-webhook] plan=lite rejected by DB constraint on insert; retrying with legacy alias pro.');
    res = await supabase.from('detailers').insert({ ...row, plan: 'pro' }).select().maybeSingle();
  }
  return res;
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

// Thin shim around lib/email.js's sendEmail so every email out of this webhook
// goes through the shared infrastructure (correct FROM, CAN-SPAM footer,
// List-Unsubscribe headers, full Resend error handling). Keeps the existing
// (to, subject, html, options) positional signature so the 6 call sites below
// don't have to change.
async function sendEmail(to, subject, html, options = {}) {
  try {
    const result = await sendLibEmail({
      to,
      subject,
      html: html || undefined,
      text: options.text,
      from: options.from,
      replyTo: options.replyTo,
    });
    if (!result?.success) {
      console.error(`[shopify-webhook] Resend rejected email to ${to}:`, result?.error);
      return false;
    }
    console.log(`[shopify-webhook] Email sent to ${to}: ${subject}`);
    return true;
  } catch (e) {
    console.error(`[shopify-webhook] Email send error to ${to}:`, e?.message || e);
    return false;
  }
}

function planChangeEmail(email, oldPlan, newPlan) {
  const newLabel = planName(newPlan);
  const oldLabel = planName(oldPlan);

  if (normalizePlan(newPlan) === 'free') {
    // Downgrade / cancellation
    return sendEmail(
      email,
      'Your Shiny Jets CRM subscription has been cancelled',
      `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#333;">Subscription Cancelled</h2>
        <p>Your plan has been moved from <strong>${escapeHtml(oldLabel)}</strong> to the <strong>Free</strong> plan.</p>
        <p>You still have access to your account with Free-plan features. Your data is preserved.</p>
        <p>Ready to come back? See plans at <a href="https://crm.shinyjets.com/upgrade" style="color:#007CB1;">crm.shinyjets.com/upgrade</a>.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
      </body></html>`,
    );
  }

  const isUpgrade = planRank(oldPlan) < planRank(newPlan);
  const verb = isUpgrade ? 'upgraded' : 'changed';

  return sendEmail(
    email,
    `Your Shiny Jets CRM plan has been ${verb} to ${newLabel}`,
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#333;">Plan ${isUpgrade ? 'Upgrade' : 'Change'} Confirmed</h2>
      <p>Your Shiny Jets CRM plan has been ${verb} from <strong>${escapeHtml(oldLabel)}</strong> to <strong>${escapeHtml(newLabel)}</strong>.</p>
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
// Used for explicit plan changes (subscription update events). Writes the
// normalized plan value (free | lite | business).
async function updatePlan(supabase, detailer, newPlanRaw, extra = {}) {
  const newPlan = normalizePlan(newPlanRaw);
  const oldPlan = normalizePlan(detailer.plan);
  if (oldPlan === newPlan && !extra.subscription_status && !extra.plan_expires_at) {
    return { oldPlan, newPlan, changed: false };
  }

  // Realign platform_fee_percent to the new plan default, UNLESS this is a
  // comp/manually-overridden account — those keep their custom rate.
  const isComped = isCompedDetailer(detailer) ||
                   extra.subscription_source === 'comp_invite' ||
                   extra.subscription_status === 'comped';

  const { defaultFeePercentForPlan } = await import('@/lib/branding');
  const update = {
    plan: newPlan,
    subscription_status: 'active',
    subscription_source: 'shopify',
    plan_updated_at: new Date().toISOString(),
    ...extra,
  };
  if (!isComped) {
    update.platform_fee_percent = defaultFeePercentForPlan(newPlan);
  }

  await updateDetailerRow(supabase, detailer.id, update);

  // Confirmation email
  if (oldPlan !== newPlan) {
    try { await planChangeEmail(detailer.email, oldPlan, newPlan); } catch {}
  }

  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone && oldPlan !== newPlan) {
    await sendSMS(adminPhone, `Plan change: ${detailer.email} ${oldPlan}→${newPlan}`);
  }

  return { oldPlan, newPlan, changed: oldPlan !== newPlan };
}

// ─── Idempotency helper: one webhook_logs record per (topic, order id) ───
async function alreadyLogged(supabase, topic, orderId) {
  if (!orderId) return false;
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('id')
    .eq('source', 'shopify')
    .eq('topic', topic)
    .filter('payload->>order_id', 'eq', String(orderId))
    .limit(1);
  if (!error) return !!(data && data.length);
  const { data: recent } = await supabase
    .from('webhook_logs')
    .select('id, payload')
    .eq('source', 'shopify')
    .eq('topic', topic)
    .order('created_at', { ascending: false })
    .limit(200);
  return (recent || []).some((row) => String(row?.payload?.order_id || '') === String(orderId));
}

async function logGrant(supabase, topic, payload) {
  const { error } = await supabase.from('webhook_logs').insert({
    source: 'shopify',
    topic,
    payload,
    processed: true,
  });
  if (error) console.error(`[shopify-webhook] ${topic} log insert failed (retry guard degraded):`, error.message);
}

// Apply a dated CRM plan grant (SKU purchase or quarterly Pricing → Lite) to
// an existing detailer. Returns { mode, update }.
async function applyDatedPlanGrant(supabase, detailer, { plan, days, source, extra = {} }) {
  const decision = computeCrmPlanGrant({ detailer, plan, days, source: source === 'pricing_quarterly' ? 'pricing_quarterly' : 'shopify' });
  if (!decision.update) return decision;
  const { defaultFeePercentForPlan } = await import('@/lib/branding');
  const oldPlan = normalizePlan(detailer.plan);
  const newPlan = decision.update.plan;
  const update = {
    ...decision.update,
    plan_updated_at: new Date().toISOString(),
    ...extra,
  };
  // Only take over subscription_source when the plan actually changes hands;
  // stacking keeps the existing source (e.g. a paid Lite sub stays 'shopify').
  if (oldPlan !== newPlan || !detailer.subscription_source || detailer.subscription_source === 'free') {
    update.subscription_source = source;
  }
  if (detailer.status === 'suspended' && source === 'shopify') update.status = 'active';
  if (!isCompedDetailer(detailer) && oldPlan !== newPlan) {
    update.platform_fee_percent = defaultFeePercentForPlan(newPlan);
  }
  await updateDetailerRow(supabase, detailer.id, update);
  if (oldPlan !== newPlan) {
    try { await planChangeEmail(detailer.email, oldPlan, newPlan); } catch {}
  }
  return { ...decision, update };
}

// Business subscribers get Pricing Tool access for their term. Never shortens
// or re-labels a longer / different existing app_access row.
async function ensureBusinessPricingAccess(supabase, email, orderId, accessEnd) {
  if (!email || !accessEnd) return null;
  const { data: existing, error } = await supabase
    .from('app_access')
    .select('email, product_type, status, access_start, access_end, shopify_order_id')
    .eq('email', email)
    .maybeSingle();
  if (error) {
    console.error('[shopify-webhook] business pricing access read error:', error.message);
    return null;
  }
  const { mode, row } = computeBusinessPricingAccess({ existing, email, orderId, accessEnd });
  if (row) {
    const { error: upErr } = await supabase.from('app_access').upsert(row, { onConflict: 'email' });
    if (upErr) {
      console.error('[shopify-webhook] business pricing access upsert error:', upErr.message);
      return null;
    }
  }
  console.log(`[shopify-webhook] business pricing access ${mode}: ${email} until ${row?.access_end || existing?.access_end}`);
  return mode;
}

// ─── Course / training product detection ───
// Brett rule: ANY course/training purchase → CRM Business (formerly Enterprise) free for 1 year.
// Preferred match: Shopify product tags "course" or "training" (Admin API).
// Fallback: title/SKU keywords + known handles (line_items lack tags).
const COURSE_KEYWORDS = ['course', 'masterclass', 'certification', 'training', '5 day', '5-day', 'dominate', 'immersive'];
const COURSE_HANDLES = ['aircraft-detailing-masterclass', 'online-aircraft-detailing-course'];
const COURSE_TAGS = new Set(['course', 'training', 'masterclass', 'certification', 'crm-enterprise-bundle']);
const COURSE_FROM = process.env.COURSE_PROVISION_FROM || 'Shiny Jets <sales@shinyjets.com>';
const COURSE_REPLY_TO = process.env.COURSE_PROVISION_REPLY_TO || 'sales@shinyjets.com';

function isCourseProductByText(item) {
  const sku = (item.sku || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  if (COURSE_HANDLES.some(h => sku.includes(h) || title.includes(h))) return true;
  if (COURSE_KEYWORDS.some(k => sku.includes(k) || title.includes(k))) return true;
  return false;
}

function parseShopifyTags(tagsField) {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return String(tagsField).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

async function fetchProductTags(productId) {
  if (!productId) return [];
  const store = (process.env.SHOPIFY_STORE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!store || !token) return [];
  try {
    const url = `https://${store}/admin/api/2024-01/products/${productId}.json?fields=id,tags`;
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      console.warn(`[shopify-webhook] product tags fetch ${productId} status=${res.status}`);
      return [];
    }
    const json = await res.json();
    return parseShopifyTags(json?.product?.tags);
  } catch (e) {
    console.warn('[shopify-webhook] product tags fetch error:', e?.message || e);
    return [];
  }
}

async function isCourseProduct(item) {
  if (isAiLineItem(item)) return false; // standalone Detailing AI is never a course (no Business grant)
  if (isCourseProductByText(item)) return true;
  const tags = await fetchProductTags(item.product_id);
  return tags.some((t) => COURSE_TAGS.has(t));
}

async function findCourseLineItem(items) {
  for (const item of items || []) {
    if (await isCourseProduct(item)) return item;
  }
  return null;
}

function plusOneYearISO(from = new Date()) {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function laterISO(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

async function alreadyGrantedCourseEnterprise(supabase, orderId) {
  if (!orderId) return false;
  // Prefer JSON path filter; fall back to recent scan if the operator is unavailable.
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('id, payload')
    .eq('source', 'shopify')
    .eq('topic', 'course_enterprise_granted')
    .filter('payload->>order_id', 'eq', String(orderId))
    .limit(1);
  if (!error) return !!(data && data.length);
  const { data: recent } = await supabase
    .from('webhook_logs')
    .select('id, payload')
    .eq('source', 'shopify')
    .eq('topic', 'course_enterprise_granted')
    .order('created_at', { ascending: false })
    .limit(50);
  return (recent || []).some((row) => String(row?.payload?.order_id || '') === String(orderId));
}

function courseEnterpriseCredentialsEmail({ email: rawEmail, firstName: rawFirstName, tempPassword, trialEndsAt }) {
  const email = escapeHtml(rawEmail);
  const firstName = escapeHtml(rawFirstName || 'there');
  const endStr = new Date(trialEndsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
      <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:#f9f9f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your CRM Business login is inside — 1 year included with your course.</span>
      <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
        <h1 style="color:#007CB1;margin:0 0 8px;font-size:24px;">Welcome aboard, ${firstName}!</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#555;">Your course purchase includes <strong>Shiny Jets CRM Business for 12 months</strong> — including <strong>Detailing AI</strong> and team tools. Here are your login details:</p>
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
        <p style="font-size:14px;line-height:1.6;margin:0 0 12px;color:#555;">Access is good through <strong>${endStr}</strong>. You'll be prompted to change your password after first login.</p>
        <p style="font-size:13px;line-height:1.6;margin:0 0 12px;color:#555;">Earn points in CRM → redeem on <strong>Rewards</strong> for free product packs, a free CRM month, and Fly Shiny gear (<a href="https://flyshiny.com" style="color:#007CB1;">flyshiny.com</a>).</p>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
        <p style="font-size:11px;color:#999;margin:0;text-align:center;">Shiny Jets · sales@shinyjets.com · <a href="https://crm.shinyjets.com" style="color:#999;">crm.shinyjets.com</a></p>
      </div>
    </body></html>`;
  const text = `Hi ${rawFirstName || 'there'},

Your course purchase includes Shiny Jets CRM Business for 12 months (Detailing AI included).

Login: https://crm.shinyjets.com/login
Username: ${rawEmail}
Temporary password: ${tempPassword}

Good through ${endStr}. Change your password on first login.

Earn points in CRM → redeem on Rewards for free products, a free CRM month, and Fly Shiny gear at https://flyshiny.com

— Shiny Jets
sales@shinyjets.com`;
  return { html, text };
}

function courseEnterpriseUpgradeEmail({ email, firstName: rawFirstName, trialEndsAt }) {
  const firstName = escapeHtml(rawFirstName || 'there');
  const endStr = new Date(trialEndsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
      <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
        <h1 style="color:#007CB1;margin:0 0 8px;font-size:24px;">CRM Business unlocked, ${firstName}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#555;">Thanks for taking the course — your Shiny Jets CRM account is on <strong>Business</strong> through <strong>${endStr}</strong>, including <strong>Detailing AI</strong>.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="https://crm.shinyjets.com/login" style="display:inline-block;padding:14px 32px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Open CRM</a>
        </div>
        <p style="font-size:13px;line-height:1.6;margin:0;color:#555;">Earn points → redeem on Rewards for free products, a free CRM month, and Fly Shiny gear at <a href="https://flyshiny.com" style="color:#007CB1;">flyshiny.com</a>.</p>
        <p style="font-size:11px;color:#999;margin:24px 0 0;text-align:center;">Shiny Jets · sales@shinyjets.com</p>
      </div>
    </body></html>`;
  const text = `Hi ${rawFirstName || 'there'},

Your course purchase unlocked Shiny Jets CRM Business through ${endStr} (Detailing AI included).

Login: https://crm.shinyjets.com/login

Earn points → redeem on Rewards for free products, a free CRM month, and Fly Shiny gear at https://flyshiny.com

— Shiny Jets
sales@shinyjets.com`;
  return { html, text, email };
}

function resolveCourseProductType(item) {
  const sku = (item.sku || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  if (sku.includes('masterclass') || title.includes('masterclass') || title.includes('5 day') || title.includes('5-day') || title.includes('certification')) {
    return 'masterclass_annual';
  }
  if (sku.includes('airventure') || title.includes('airventure') || title.includes('eaa')) {
    return 'airventure_annual';
  }
  if (sku.includes('onsite') || sku.includes('on-site') || title.includes('on-site') || title.includes('on site') || title.includes('corporate')) {
    return 'onsite_annual';
  }
  return 'online_course_annual';
}

async function handleCoursePricingAccess(supabase, payload) {
  const items = payload?.line_items || [];
  const courseItem = await findCourseLineItem(items);
  if (!courseItem) return;

  const email = extractEmail(payload);
  if (!email) return;

  const productType = resolveCourseProductType(courseItem);
  const now = new Date();
  let accessEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  // Never shorten a longer active row (e.g. a Business term or stacked Pricing time).
  const { data: existingAccess } = await supabase
    .from('app_access')
    .select('status, access_end')
    .eq('email', email)
    .maybeSingle();
  if (existingAccess?.status === 'active' && existingAccess.access_end &&
      new Date(existingAccess.access_end).getTime() > accessEnd.getTime()) {
    accessEnd = new Date(existingAccess.access_end);
  }

  const { error } = await supabase
    .from('app_access')
    .upsert({
      email,
      shopify_order_id: String(payload.id || ''),
      product_type: productType,
      access_start: now.toISOString(),
      access_end: accessEnd.toISOString(),
      status: 'active',
      updated_at: now.toISOString(),
    }, { onConflict: 'email' });

  if (error) {
    console.error('[shopify-webhook] course app_access upsert error:', error);
    return;
  }

  console.log(`[shopify-webhook] course pricing access granted: ${email} type=${productType} until ${accessEnd.toISOString()}`);

  const firstName = escapeHtml(payload?.customer?.first_name || 'there');
  const accessEndStr = accessEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  await sendEmail(
    email,
    'Your Shiny Jets Pricing App Access',
    `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
      <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
        <h1 style="color:#007CB1;margin:0 0 8px;font-size:24px;">Welcome to Shiny Jets Pricing, ${firstName}!</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#555;">Your course purchase includes <strong>12 months</strong> of full access to the aircraft detailing pricing database.</p>
        <div style="background:#f0f7fb;border:1px solid #cfe4f0;border-radius:8px;padding:18px 20px;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Login URL</p>
          <p style="margin:0 0 16px;"><a href="https://pricing.shinyjets.com" style="color:#007CB1;font-weight:600;text-decoration:none;">pricing.shinyjets.com</a></p>
          <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Your Email</p>
          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#1a1a1a;">${escapeHtml(email)}</p>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="https://pricing.shinyjets.com" style="display:inline-block;padding:14px 32px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Access Pricing Tool</a>
        </div>
        <p style="font-size:13px;color:#666;line-height:1.6;margin:24px 0 0;">Your access is valid through <strong>${accessEndStr}</strong>. Log in with the email address from your course purchase. Need help? Reply to this email.</p>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
        <p style="font-size:11px;color:#999;margin:0;text-align:center;">Shiny Jets &middot; <a href="https://pricing.shinyjets.com" style="color:#999;">pricing.shinyjets.com</a></p>
      </div>
    </body></html>`,
  );

  await supabase.from('webhook_logs').insert({
    source: 'shopify',
    topic: 'course_pricing_access_granted',
    payload: { email, product_type: productType, access_end: accessEnd.toISOString(), order_id: payload.id },
    processed: true,
  });
}

// ─── Pricing Tool (PRICING-MONTHLY / PRICING-QUARTERLY) → app_access ───
async function alreadyGrantedPricingTool(supabase, orderId) {
  if (!orderId) return false;
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('id')
    .eq('source', 'shopify')
    .eq('topic', 'pricing_tool_access_granted')
    .filter('payload->>order_id', 'eq', String(orderId))
    .limit(1);
  if (!error) return !!(data && data.length);
  const { data: recent } = await supabase
    .from('webhook_logs')
    .select('id, payload')
    .eq('source', 'shopify')
    .eq('topic', 'pricing_tool_access_granted')
    .order('created_at', { ascending: false })
    .limit(200);
  return (recent || []).some((row) => String(row?.payload?.order_id || '') === String(orderId));
}

async function handlePricingToolAccess(supabase, payload, { includesCrmLite = false } = {}) {
  const purchase = pricingPurchaseFromLineItems(payload?.line_items);
  if (!purchase) return;

  const orderId = String(payload?.id || '');
  const email = extractEmail(payload);
  if (!orderId || !email) {
    console.error(`[shopify-webhook] pricing tool: missing order id or email (order=${orderId})`);
    return;
  }

  // Idempotency: one grant per Shopify order id.
  if (await alreadyGrantedPricingTool(supabase, orderId)) {
    console.log(`[shopify-webhook] pricing tool: idempotent skip order ${orderId}`);
    return;
  }

  const { data: existing, error: readErr } = await supabase
    .from('app_access')
    .select('email, product_type, status, access_start, access_end, shopify_order_id')
    .eq('email', email)
    .maybeSingle();
  if (readErr) {
    console.error('[shopify-webhook] pricing tool: app_access read error:', readErr);
    return;
  }

  if (orderAlreadyApplied(existing, orderId)) {
    console.log(`[shopify-webhook] pricing tool: order ${orderId} already on app_access row, skipping`);
    return;
  }

  const { mode, row } = computePricingGrant({
    existing,
    email,
    orderId,
    productType: purchase.productType,
    days: purchase.days,
  });

  const { error: upsertErr } = await supabase
    .from('app_access')
    .upsert(row, { onConflict: 'email' });
  if (upsertErr) {
    console.error('[shopify-webhook] pricing tool: app_access upsert error:', upsertErr);
    return;
  }

  // Record the grant immediately (before email) so a Shopify retry of the same
  // order can never extend access twice. supabase-js returns errors rather
  // than throwing, so check it: a silent failure here would let a retry
  // extend again (orderAlreadyApplied above is the backstop for that).
  const { error: logErr } = await supabase.from('webhook_logs').insert({
    source: 'shopify',
    topic: 'pricing_tool_access_granted',
    payload: {
      order_id: orderId,
      order_name: payload?.name || null,
      email,
      skus: purchase.skus,
      days: purchase.days,
      mode,
      previous_product_type: existing?.product_type || null,
      previous_access_end: existing?.access_end || null,
      product_type: row.product_type,
      access_end: row.access_end,
    },
    processed: true,
  });
  if (logErr) {
    console.error(`[shopify-webhook] pricing tool: grant log insert FAILED for order ${orderId} (retry guard degraded):`, logErr);
  }

  console.log(`[shopify-webhook] pricing tool access ${mode}: ${email} order=${orderId} type=${row.product_type} +${purchase.days}d until ${row.access_end}`);

  const firstName = payload?.customer?.first_name || payload?.billing_address?.first_name || 'there';
  const mail = pricingToolAccessEmail({
    email,
    firstName,
    accessEnd: row.access_end,
    productType: purchase.productType,
    includesCrmLite,
  });
  await sendEmail(email, 'Your Shiny Jets Pricing App Access', mail.html, { text: mail.text });
}

// ─── Course → CRM Business 1-year (was Enterprise; Victor-style fields) ───
// Function/topic names keep "Enterprise" so idempotency records stay valid.
async function grantCourseEnterprise(supabase, payload, courseItem) {
  const orderId = String(payload?.id || '');
  const email = extractEmail(payload);
  if (!email) {
    console.error('[shopify-webhook] course enterprise: no email on order', orderId);
    return;
  }

  if (await alreadyGrantedCourseEnterprise(supabase, orderId)) {
    console.log(`[shopify-webhook] course enterprise: idempotent skip order ${orderId}`);
    return;
  }

  const trialEndsAt = plusOneYearISO();
  const shopifyCustomerId = String(payload?.customer?.id || '');
  const firstName = payload?.customer?.first_name || 'there';
  const name = payload?.customer?.first_name
    ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim()
    : 'Customer';

  const { defaultFeePercentForPlan } = await import('@/lib/branding');
  let detailer = await findDetailer(supabase, payload);

  if (detailer) {
    // Never reset passwords. Never shorten existing ends. Never break Victor /
    // admin comp_invite previews (extend only). Never flip paid shopify
    // enterprise → comped.
    const isAdminComp = detailer.subscription_source === 'comp_invite';
    const isBusinessNow = normalizePlan(detailer.plan) === 'business';
    const isPaidShopify = detailer.subscription_source === 'shopify' &&
      detailer.subscription_status === 'active' &&
      isBusinessNow;

    const nextTrial = laterISO(detailer.trial_ends_at, trialEndsAt);
    const nextExpiry = laterISO(detailer.plan_expires_at, trialEndsAt);

    const update = {
      shopify_customer_id: shopifyCustomerId || detailer.shopify_customer_id,
      plan_updated_at: new Date().toISOString(),
    };
    if (detailer.status === 'suspended') update.status = 'active';

    if (isPaidShopify) {
      // Keep paid Business; the course year extends their term (never shortens).
      update.plan_expires_at = nextExpiry;
      if (!detailer.trial_ends_at) update.trial_ends_at = trialEndsAt;
      console.log(`[shopify-webhook] course purchase by paid business ${email}, preserving paid status`);
    } else if (isAdminComp && isBusinessNow) {
      update.trial_ends_at = nextTrial;
      update.plan_expires_at = nextExpiry;
      console.log(`[shopify-webhook] course purchase by admin-comp enterprise ${email}, extending dates only`);
    } else {
      // free / lite (or lapsed) → CRM Business comp year
      update.plan = 'business';
      update.subscription_status = 'comped';
      update.subscription_source = 'course_bundle';
      update.trial_ends_at = nextTrial;
      update.plan_expires_at = nextExpiry;
      update.platform_fee_percent = defaultFeePercentForPlan('business');
    }

    await updateDetailerRow(supabase, detailer.id, update);

    const mail = courseEnterpriseUpgradeEmail({
      email,
      firstName,
      trialEndsAt: update.trial_ends_at || detailer.trial_ends_at || trialEndsAt,
    });
    await sendEmail(email, 'Your course includes Shiny Jets CRM Business for 1 year', mail.html, {
      text: mail.text,
      from: COURSE_FROM,
      replyTo: COURSE_REPLY_TO,
    });

    console.log('[shopify-webhook] course-enterprise', JSON.stringify({
      detailer_id: detailer.id,
      email,
      order_id: orderId,
      path: 'upgrade',
      course_title: courseItem?.title || null,
    }));
  } else {
    const tempPassword = generateTempPassword();
    const bcrypt = (await import('bcryptjs')).default;
    const hashed = bcrypt.hashSync(tempPassword, 10);

    const { data: inserted, error: insErr } = await supabase
      .from('detailers')
      .insert({
        email,
        name,
        phone: payload?.customer?.phone || null,
        password_hash: hashed,
        must_change_password: true,
        status: 'active',
        plan: 'business',
        subscription_status: 'comped',
        subscription_source: 'course_bundle',
        trial_ends_at: trialEndsAt,
        plan_expires_at: trialEndsAt,
        platform_fee_percent: defaultFeePercentForPlan('business'),
        shopify_customer_id: shopifyCustomerId,
        plan_updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (insErr) {
      console.error('[shopify-webhook] course enterprise insert failed:', insErr.message);
      // Race: detailer created between find and insert — upgrade in place (no recurse)
      detailer = await findDetailer(supabase, payload);
      if (!detailer) return;
      const nextTrial = laterISO(detailer.trial_ends_at, trialEndsAt);
      const nextExpiry = laterISO(detailer.plan_expires_at, trialEndsAt);
      const paidBusiness = normalizePlan(detailer.plan) === 'business' && detailer.subscription_source === 'shopify';
      await updateDetailerRow(supabase, detailer.id, {
        plan: 'business',
        subscription_status: paidBusiness ? detailer.subscription_status : 'comped',
        subscription_source: paidBusiness
          ? detailer.subscription_source
          : (detailer.subscription_source === 'comp_invite' ? 'comp_invite' : 'course_bundle'),
        trial_ends_at: nextTrial,
        plan_expires_at: nextExpiry,
        shopify_customer_id: shopifyCustomerId || detailer.shopify_customer_id,
        plan_updated_at: new Date().toISOString(),
        ...(detailer.status === 'suspended' ? { status: 'active' } : {}),
      });
      const mail = courseEnterpriseUpgradeEmail({ email, firstName, trialEndsAt: nextTrial });
      await sendEmail(email, 'Your course includes Shiny Jets CRM Business for 1 year', mail.html, {
        text: mail.text, from: COURSE_FROM, replyTo: COURSE_REPLY_TO,
      });
      await supabase.from('webhook_logs').insert({
        source: 'shopify',
        topic: 'course_enterprise_granted',
        payload: { order_id: orderId, email, product_title: courseItem?.title || null, product_id: courseItem?.product_id || null, trial_ends_at: nextTrial, path: 'race_upgrade' },
        processed: true,
      });
      return;
    }

    if (inserted) {
      // Admin-staged comp invite still wins if present (may extend / override)
      const compResult = await redeemCompInviteIfAny(supabase, inserted.id, email);
      if (compResult.applied) {
        console.log(`[shopify-webhook] course create also redeemed comp invite for ${email}`);
      }

      const mail = courseEnterpriseCredentialsEmail({
        email,
        firstName: (name || '').split(' ')[0] || 'there',
        tempPassword,
        trialEndsAt,
      });
      await sendEmail(
        email,
        'Your Shiny Jets CRM Business login (1 year included with your course)',
        mail.html,
        { text: mail.text, from: COURSE_FROM, replyTo: COURSE_REPLY_TO },
      );

      const now = new Date();
      const dripRows = [0, 1, 3, 5, 7].map((offset) => ({
        detailer_id: inserted.id,
        message_id: `drip-day-${offset}`,
        scheduled_for: new Date(now.getTime() + offset * 86400000).toISOString(),
      }));
      await supabase.from('drip_messages').insert(dripRows);

      const adminPhone = process.env.ADMIN_PHONE;
      if (adminPhone) {
        await sendSMS(adminPhone, `Course→Business: ${email} (new)`);
      }

      console.log('[shopify-webhook] course-enterprise', JSON.stringify({
        detailer_id: inserted.id,
        email,
        order_id: orderId,
        path: 'create',
        course_title: courseItem?.title || null,
      }));
    }
  }

  await supabase.from('webhook_logs').insert({
    source: 'shopify',
    topic: 'course_enterprise_granted',
    payload: {
      order_id: orderId,
      email,
      product_title: courseItem?.title || null,
      product_id: courseItem?.product_id || null,
      trial_ends_at: trialEndsAt,
    },
    processed: true,
  });
}

// ─── New-account creation for paid CRM SKUs / quarterly Pricing → Lite ───
async function createShopifyAccount(supabase, payload, { email, plan, planExpiresAt, hasCourseGrant, courseItem, reason }) {
  const tempPassword = generateTempPassword();
  const bcrypt = (await import('bcryptjs')).default;
  const hashed = bcrypt.hashSync(tempPassword, 10);
  const name = payload?.customer?.first_name
    ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim()
    : 'Customer';
  const shopifyCustomerId = String(payload?.customer?.id || '');
  const { defaultFeePercentForPlan } = await import('@/lib/branding');

  // If cart also includes a course, create directly as Business course_bundle
  // so grantCourseEnterprise later is idempotent and we don't double-email.
  const courseExpiryISO = hasCourseGrant ? plusOneYearISO() : null;
  let finalPlan = hasCourseGrant ? 'business' : normalizePlan(plan);
  const insertRow = {
    email,
    name,
    phone: payload?.customer?.phone || null,
    password_hash: hashed,
    must_change_password: true,
    status: 'active',
    plan: finalPlan,
    subscription_status: hasCourseGrant ? 'comped' : 'active',
    subscription_source: hasCourseGrant ? 'course_bundle' : (reason === 'pricing_quarterly' ? 'pricing_quarterly' : 'shopify'),
    shopify_customer_id: shopifyCustomerId,
    platform_fee_percent: defaultFeePercentForPlan(finalPlan),
    plan_updated_at: new Date().toISOString(),
  };
  if (courseExpiryISO) {
    insertRow.trial_ends_at = courseExpiryISO;
    insertRow.plan_expires_at = laterISO(planExpiresAt, courseExpiryISO);
  } else if (planExpiresAt) {
    insertRow.plan_expires_at = planExpiresAt;
  }

  const { data: inserted, error } = await insertDetailerRow(supabase, insertRow);
  if (error || !inserted) {
    console.error('[shopify-webhook] account create failed:', error?.message);
    return null;
  }
  console.log(`[shopify-webhook] Created detailer ${inserted.id} for ${email} plan=${finalPlan} reason=${reason}`);

  const compResult = await redeemCompInviteIfAny(supabase, inserted.id, email);
  if (compResult.applied) {
    inserted.plan = compResult.plan;
    finalPlan = normalizePlan(compResult.plan);
  }

  const firstNameRaw = (name || '').split(' ')[0] || 'there';
  const firstName = escapeHtml(firstNameRaw);
  const safeEmail = escapeHtml(email);
  const label = planName(finalPlan);
  const mailOpts = hasCourseGrant ? { from: COURSE_FROM, replyTo: COURSE_REPLY_TO } : {};
  const intro = reason === 'pricing_quarterly'
    ? `Your quarterly Pricing Tool subscription includes <strong>Shiny Jets CRM Lite</strong>. Your account is ready. Here are your login details:`
    : reason === 'detailing_ai'
      ? `Your <strong>Detailing AI</strong> subscription is active. Log in on your phone, open <a href="https://crm.shinyjets.com/detailing-ai" style="color:#007CB1;">crm.shinyjets.com/detailing-ai</a>, and add it to your home screen. Here are your login details:`
      : `Your Shiny Jets CRM <strong>${escapeHtml(label)}</strong> account is ready. Here are your login details:`;
  await sendEmail(
    email,
    hasCourseGrant
      ? 'Your Shiny Jets CRM Business login (1 year included with your course)'
      : reason === 'detailing_ai'
        ? 'Your Detailing AI login details'
        : 'Your Shiny Jets CRM login details',
    `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
      <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:#f9f9f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your login details are inside — username, temporary password, and login link.</span>
      <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
        <h1 style="color:#007CB1;margin:0 0 8px;font-size:24px;">Welcome aboard, ${firstName}!</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#555;">${intro}</p>
        <div style="background:#f0f7fb;border:1px solid #cfe4f0;border-radius:8px;padding:18px 20px;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Login URL</p>
          <p style="margin:0 0 16px;"><a href="https://crm.shinyjets.com/login" style="color:#007CB1;font-weight:600;text-decoration:none;">crm.shinyjets.com/login</a></p>
          <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Username</p>
          <p style="margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#1a1a1a;">${safeEmail}</p>
          <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:600;color:#007CB1;letter-spacing:0.05em;">${tempPassword}</p>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="https://crm.shinyjets.com/login" style="display:inline-block;padding:14px 32px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Log In Now</a>
        </div>
        ${hasCourseGrant ? `<p style="font-size:13px;line-height:1.6;margin:0 0 12px;color:#555;">Course bonus: CRM Business for 12 months, including <strong>Detailing AI</strong> and team tools.</p>` : ''}
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
    mailOpts,
  );

  if (reason !== 'pricing_quarterly') {
    await sendEmail(
      email,
      'Action required: Check your inbox for CRM access',
      null,
      {
        text: `Hi ${firstNameRaw},

Thanks for signing up for Shiny Jets CRM. We just sent you an email with your login details — please check your inbox (and spam folder).

Quick reference:
- Login URL: https://crm.shinyjets.com/login
- Username: ${email}
- Temporary password: ${tempPassword}

You'll be asked to change your password on first login.

If you have any trouble, just reply to this email.

— Brett
Shiny Jets`,
        ...mailOpts,
      }
    );
  }

  const now = new Date();
  const dripRows = [0, 1, 3, 5, 7].map(offset => ({
    detailer_id: inserted.id,
    message_id: `drip-day-${offset}`,
    scheduled_for: new Date(now.getTime() + offset * 86400000).toISOString(),
  }));
  await supabase.from('drip_messages').insert(dripRows);

  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    await sendSMS(adminPhone, `New Shopify signup: ${email} (${finalPlan}${reason === 'pricing_quarterly' ? ' via Pricing quarterly' : ''})`);
  }

  if (hasCourseGrant) {
    await logGrant(supabase, 'course_enterprise_granted', {
      order_id: String(payload?.id || ''),
      email,
      product_title: courseItem?.title || null,
      product_id: courseItem?.product_id || null,
      trial_ends_at: courseExpiryISO,
      path: 'create_with_crm_sku',
    });
  }
  return inserted;
}

// ─── PRICING-QUARTERLY (paid) → CRM Lite for 90 days per unit ───
// Stacks onto remaining Lite time, never downgrades Business, idempotent per
// Shopify order via webhook_logs (topic quarterly_lite_granted).
// PRICING-MONTHLY does NOT grant Lite.
async function handleQuarterlyLiteGrant(supabase, payload) {
  const days = quarterlyLiteDaysFromLineItems(payload?.line_items);
  if (!days) return null;
  const orderId = String(payload?.id || '');
  const email = extractEmail(payload);
  if (!orderId || !email) {
    console.error(`[shopify-webhook] quarterly→lite: missing order id or email (order=${orderId})`);
    return null;
  }
  if (payload?.financial_status && !['paid', 'partially_refunded'].includes(payload.financial_status)) {
    console.log(`[shopify-webhook] quarterly→lite: order ${orderId} financial_status=${payload.financial_status}, skipping`);
    return null;
  }
  if (await alreadyLogged(supabase, 'quarterly_lite_granted', orderId)) {
    console.log(`[shopify-webhook] quarterly→lite: idempotent skip order ${orderId}`);
    return { mode: 'already_applied', granted: true };
  }

  const detailer = await findDetailer(supabase, payload);
  let result;
  if (detailer) {
    result = await applyDatedPlanGrant(supabase, detailer, {
      plan: 'lite',
      days,
      source: 'pricing_quarterly',
      extra: { shopify_customer_id: String(payload?.customer?.id || detailer.shopify_customer_id || '') || null },
    });
  } else {
    const planExpiresAt = new Date(Date.now() + days * DAY_MS).toISOString();
    const inserted = await createShopifyAccount(supabase, payload, {
      email, plan: 'lite', planExpiresAt, hasCourseGrant: false, reason: 'pricing_quarterly',
    });
    result = { mode: inserted ? 'create_account' : 'create_failed', update: inserted ? { plan: 'lite', plan_expires_at: planExpiresAt } : null };
  }

  await logGrant(supabase, 'quarterly_lite_granted', {
    order_id: orderId,
    order_name: payload?.name || null,
    email,
    days,
    mode: result.mode,
    previous_plan: detailer?.plan || null,
    previous_plan_expires_at: detailer?.plan_expires_at || null,
    plan_expires_at: result.update?.plan_expires_at || null,
  });
  console.log(`[shopify-webhook] quarterly→lite ${result.mode}: ${email} order=${orderId} +${days}d until ${result.update?.plan_expires_at || '(unchanged)'}`);
  const granted = !!result.update || result.mode === 'keep_open_ended' || result.mode === 'keep_open_ended_comp';
  return { mode: result.mode, granted };
}

// Seal renewal orders carry Seal tags / a subscription source; logged for audit only —
// renewals are granted exactly like first orders (new order id → another term stacks on).
function isSealRenewal(payload) {
  const tags = parseShopifyTags(payload?.tags);
  const src = String(payload?.source_name || '').toLowerCase();
  return tags.some((t) => /recurring|renewal|seal/.test(t)) || /subscription|seal/.test(src);
}

// ─── Standalone Detailing AI (variant 67640132174009 / 67640132206777) → detailers.ai_access_until ───
// Mirrors the CRM SKU + course auto-provisioning: a paid order gives that email
// Detailing AI. Existing account → stack days onto ai_access_until (plan is never
// touched). No account → create a Free CRM login (temp password email, like the
// course flow) and stamp ai_access_until. Idempotent per order via webhook_logs.
async function handleDetailingAiAccess(supabase, payload) {
  const purchase = aiPurchaseFromLineItems(payload?.line_items || []);
  if (!purchase) return null;
  const orderId = String(payload?.id || '');
  const email = extractEmail(payload);
  if (!email) {
    console.error('[shopify-webhook] detailing ai: no email on order', orderId);
    return null;
  }
  if (await alreadyLogged(supabase, 'detailing_ai_access_granted', orderId)) {
    console.log(`[shopify-webhook] detailing ai: idempotent skip order ${orderId}`);
    return null;
  }

  let detailer = await findDetailer(supabase, payload);
  let mode = 'extend';
  if (!detailer) {
    detailer = await createShopifyAccount(supabase, payload, {
      email, plan: 'free', planExpiresAt: null, hasCourseGrant: false, reason: 'detailing_ai',
    });
    mode = detailer ? 'create_account' : 'create_failed';
    if (!detailer) detailer = await findDetailer(supabase, payload); // race: created meanwhile
  }
  if (!detailer) return { mode };

  const until = computeAiAccessUntil({ current: detailer.ai_access_until, days: purchase.days });
  const update = { ai_access_until: until };
  const shopifyCustomerId = String(payload?.customer?.id || '');
  if (shopifyCustomerId && !detailer.shopify_customer_id) update.shopify_customer_id = shopifyCustomerId;
  if (detailer.status === 'suspended') update.status = 'active';
  const { error } = await supabase.from('detailers').update(update).eq('id', detailer.id);
  if (error) {
    // Most likely the 20261003_detailing_ai_standalone.sql migration is not applied yet.
    console.error('[shopify-webhook] detailing ai: ai_access_until update failed:', error.message);
    return { mode: 'update_failed' };
  }

  await logGrant(supabase, 'detailing_ai_access_granted', {
    order_id: orderId,
    order_name: payload?.name || null,
    email,
    days: purchase.days,
    skus: purchase.skus,
    variant_ids: purchase.variants,
    matched_by: purchase.sources,
    renewal: isSealRenewal(payload),
    mode,
    previous_ai_access_until: detailer.ai_access_until || null,
    ai_access_until: until,
  });
  // Welcome email on the first grant (or after access had lapsed) only — a Seal renewal
  // that extends live access is silent.
  if (mode === 'extend' && !hasStandaloneAi(detailer)) {
    try {
      await sendEmail(email, 'Detailing AI is ready on your phone', `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
        <h1 style="color:#007CB1;font-size:22px;margin:0 0 12px;">Detailing AI is on</h1>
        <p style="font-size:15px;line-height:1.6;color:#555;">Your Detailing AI access runs through <strong>${escapeHtml(new Date(until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</strong> and renews with your subscription.</p>
        <p style="font-size:15px;line-height:1.6;color:#555;">Open it on your phone, log in with <strong>${escapeHtml(email)}</strong>, then add it to your home screen (iPhone: Share → Add to Home Screen; Android: menu → Install app).</p>
        <p style="text-align:center;margin:24px 0;"><a href="https://crm.shinyjets.com/detailing-ai" style="display:inline-block;padding:14px 28px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Open Detailing AI</a></p>
        <p style="font-size:12px;color:#888;line-height:1.5;">Detailing AI guidance is advisory only and does not replace the aircraft's OEM manuals or an A&amp;P/IA.</p>
      </body></html>`, { text: `Detailing AI is on through ${new Date(until).toDateString()}. Open https://crm.shinyjets.com/detailing-ai on your phone, log in with ${email}, and add it to your home screen.` });
    } catch {}
  }
  console.log(`[shopify-webhook] detailing ai ${mode}: ${email} order=${orderId} +${purchase.days}d (${purchase.sources.join(',')}) until ${until}`);
  return { mode, until };
}

// ─── Paid "Ask a Shiny Jets expert" question ($4.99 = one question) ───
// The order carries the escalation id as a line-item property / cart attribute (ask_expert_id).
// Only now does the question become 'open' and reach Brett (email + admin queue).
async function handleAskExpertPaid(supabase, payload) {
  const variantId = askExpertVariantId();
  if (!variantId) return null;
  const found = askExpertFromOrder(payload, variantId);
  if (!found) return null;
  if (found.error) {
    console.error(`[shopify-webhook] ask-expert order ${found.orderId}: ${found.error}`);
    return found;
  }
  const res = await markEscalationPaid(supabase, { escalationId: found.escalationId, orderId: found.orderId, orderName: found.orderName });
  console.log(`[shopify-webhook] ask-expert order ${found.orderId} -> ${found.escalationId}: ${res.reason}`);
  return res;
}

// ─── Handle: orders/paid ───
async function handleOrderPaid(supabase, payload) {
  // Paid expert question (isolated: never blocks other provisioning).
  try {
    await handleAskExpertPaid(supabase, payload);
  } catch (e) {
    console.error('[shopify-webhook] ask-expert error:', e?.message || e);
  }

  // Course products → Pricing App access
  await handleCoursePricingAccess(supabase, payload);

  // PRICING-QUARTERLY → CRM Lite (isolated: never blocks other provisioning)
  let quarterly = null;
  try {
    quarterly = await handleQuarterlyLiteGrant(supabase, payload);
  } catch (e) {
    console.error('[shopify-webhook] quarterly→lite error:', e?.message || e);
  }

  // Pricing Tool subscriptions (PRICING-MONTHLY / PRICING-QUARTERLY) → app_access.
  try {
    await handlePricingToolAccess(supabase, payload, { includesCrmLite: !!quarterly?.granted });
  } catch (e) {
    console.error('[shopify-webhook] pricing tool access error:', e?.message || e);
  }

  // Standalone Detailing AI (aircraftdetailing.ai) → ai_access_until (isolated).
  try {
    await handleDetailingAiAccess(supabase, payload);
  } catch (e) {
    console.error('[shopify-webhook] detailing ai access error:', e?.message || e);
  }

  const items = payload?.line_items || [];
  const courseItem = await findCourseLineItem(items);
  const hasCourseGrant = !!courseItem;

  const purchase = crmPurchaseFromLineItems(items);

  // Course alone (no CRM SKU) → Business provisioning path
  if (!purchase && hasCourseGrant) {
    console.log('[shopify-webhook] orders/paid: course detected, granting CRM Business (1 year)');
    await grantCourseEnterprise(supabase, payload, courseItem);
    return;
  }

  if (!purchase) {
    console.log('[shopify-webhook] orders/paid: no matching CRM plan, skipping CRM provisioning');
    return;
  }

  const email = extractEmail(payload);
  if (!email) {
    console.error('[shopify-webhook] orders/paid: no customer email found in payload, cannot create account');
    return;
  }
  const orderId = String(payload?.id || '');
  const plan = purchase.plan;
  console.log(`[shopify-webhook] orders/paid: email=${email} plan=${plan} days=${purchase.days} skus=${purchase.skus.join(',')}`);

  // Idempotency: a Shopify retry of the same order must not stack days twice.
  if (plan !== 'free' && await alreadyLogged(supabase, 'crm_plan_granted', orderId)) {
    console.log(`[shopify-webhook] crm plan: idempotent skip order ${orderId}`);
    if (hasCourseGrant) await grantCourseEnterprise(supabase, payload, courseItem);
    return;
  }

  const detailer = await findDetailer(supabase, payload);
  const shopifyCustomerId = String(payload?.customer?.id || '');
  let planExpiresAt = null;
  let mode;

  if (detailer) {
    if (plan === 'free') {
      // A $0 Free SKU never downgrades an existing account.
      mode = 'free_sku_noop';
      const extra = {};
      if (shopifyCustomerId && !detailer.shopify_customer_id) extra.shopify_customer_id = shopifyCustomerId;
      if (Object.keys(extra).length) await updateDetailerRow(supabase, detailer.id, extra);
    } else {
      const res = await applyDatedPlanGrant(supabase, detailer, {
        plan,
        days: purchase.days,
        source: 'shopify',
        extra: { shopify_customer_id: shopifyCustomerId || detailer.shopify_customer_id || null },
      });
      mode = res.mode;
      planExpiresAt = res.update?.plan_expires_at || null;
    }
    console.log('[shopify-webhook] plan-change', JSON.stringify({
      detailer_id: detailer.id,
      email,
      old_plan: detailer.plan,
      new_plan: plan,
      mode,
      plan_expires_at: planExpiresAt,
      shopify_order_id: orderId,
      topic: 'orders/paid',
    }));
  } else {
    planExpiresAt = plan === 'free' ? null : new Date(Date.now() + purchase.days * DAY_MS).toISOString();
    const inserted = await createShopifyAccount(supabase, payload, {
      email, plan, planExpiresAt, hasCourseGrant, courseItem, reason: 'crm_sku',
    });
    mode = inserted ? 'create_account' : 'create_failed';
  }

  if (plan !== 'free') {
    await logGrant(supabase, 'crm_plan_granted', {
      order_id: orderId,
      order_name: payload?.name || null,
      email,
      plan,
      days: purchase.days,
      skus: purchase.skus,
      mode,
      previous_plan: detailer?.plan || null,
      previous_plan_expires_at: detailer?.plan_expires_at || null,
      plan_expires_at: planExpiresAt,
    });
  }

  // Business includes the Pricing Tool: keep app_access active for the term.
  if (plan === 'business') {
    const accessEnd = planExpiresAt || new Date(Date.now() + purchase.days * DAY_MS).toISOString();
    try {
      await ensureBusinessPricingAccess(supabase, email, orderId, accessEnd);
    } catch (e) {
      console.error('[shopify-webhook] business pricing access error:', e?.message || e);
    }
  }

  // Cart also has a course → apply Business year (idempotent; preserves paid business)
  if (hasCourseGrant) {
    await grantCourseEnterprise(supabase, payload, courseItem);
  }
}

// ─── Which product does a subscription event belong to? ───
function extractOrderId(v) {
  if (!v) return null;
  const m = String(v).match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

async function classifySubscriptionEvent(supabase, payload) {
  let items = subscriptionItems(payload);
  let classification = classifySubscriptionItems(items);
  if (!classification.known) {
    // Seal / Shopify contract events often omit items — fall back to the
    // original order's line items from webhook_logs.
    const originId = extractOrderId(payload?.origin_order_id || payload?.order_id || payload?.origin_order?.id || payload?.last_order_id);
    if (originId) {
      const { data } = await supabase
        .from('webhook_logs')
        .select('payload')
        .eq('source', 'shopify')
        .eq('topic', 'orders/paid')
        .filter('payload->>id', 'eq', originId)
        .limit(1);
      const order = data?.[0]?.payload;
      if (order?.line_items?.length) {
        items = order.line_items;
        classification = classifySubscriptionItems(items);
      }
    }
  }
  return classification;
}

async function hasActivePricingRow(supabase, email) {
  if (!email) return false;
  const { data } = await supabase
    .from('app_access')
    .select('product_type, status, access_end')
    .eq('email', email)
    .maybeSingle();
  return !!(data && ['monthly', 'quarterly'].includes(data.product_type) &&
    data.status === 'active' && data.access_end && new Date(data.access_end).getTime() > Date.now());
}

// ─── Handle: subscription update (upgrade/downgrade) ───
async function handleSubscriptionUpdate(supabase, payload) {
  const detailer = await findDetailer(supabase, payload);
  if (!detailer) return;

  const classification = await classifySubscriptionEvent(supabase, payload);
  if (!classification.hasCrm) {
    console.log(`[shopify-webhook] subscription update for non-CRM product (pricing=${classification.hasPricing}) — CRM plan untouched for ${detailer.email}`);
    return;
  }
  const plan = classification.crmPlan;

  // Never let a lower-tier subscription event downgrade a comp / course entitlement.
  if (isCompedDetailer(detailer) && planRank(plan) < planRank(detailer.plan)) {
    console.log(`[shopify-webhook] subscription update ${plan} ignored for comped ${normalizePlan(detailer.plan)} account ${detailer.email}`);
    return;
  }

  const result = await updatePlan(supabase, detailer, plan, {
    shopify_customer_id: String(payload?.customer?.id || payload?.customer_id || detailer.shopify_customer_id || ''),
  });
  console.log('[shopify-webhook] plan-change', JSON.stringify({
    detailer_id: detailer.id,
    email: detailer.email,
    old_plan: result.oldPlan,
    new_plan: result.newPlan,
    subscription_status: 'active',
    subscription_source: 'shopify',
    shopify_order_id: String(payload?.id || payload?.order_id || ''),
    topic: 'subscription/updated',
    changed: result.changed,
  }));
}

// ─── Handle: subscription cancel / expire ───
// Only affects the product the subscription belongs to: cancelling the
// Pricing Tool never touches the CRM plan.
async function handleSubscriptionCancel(supabase, payload) {
  const detailer = await findDetailer(supabase, payload);
  if (!detailer) return;

  const classification = await classifySubscriptionEvent(supabase, payload);
  const pricingRow = await hasActivePricingRow(supabase, detailer.email);
  const decision = decideCancellation({ detailer, classification, hasActivePricingRow: pricingRow });
  const oldPlan = normalizePlan(detailer.plan);

  console.log('[shopify-webhook] subscription-cancel', JSON.stringify({
    detailer_id: detailer.id,
    email: detailer.email,
    plan: oldPlan,
    decision,
    classification,
    shopify_order_id: String(payload?.id || payload?.order_id || payload?.origin_order_id || ''),
  }));

  if (decision === 'ignore_unresolved') {
    await logGrant(supabase, 'subscription_cancel_unresolved', {
      email: detailer.email,
      detailer_id: detailer.id,
      subscription_id: payload?.id || payload?.admin_graphql_api_id || null,
      note: 'Could not tell which product was cancelled and the customer has an active Pricing Tool subscription; CRM plan left unchanged for manual review.',
    });
    return;
  }
  if (decision.startsWith('ignore')) return;

  if (decision === 'keep_until_expiry') {
    // Paid through plan_expires_at — plan-expirations cron downgrades later.
    await updateDetailerRow(supabase, detailer.id, {
      subscription_status: 'cancelled',
      plan_updated_at: new Date().toISOString(),
    });
    return;
  }

  // downgrade_now (legacy open-ended subscription)
  await updateDetailerRow(supabase, detailer.id, {
    plan: 'free',
    subscription_status: 'cancelled',
    subscription_source: 'shopify',
    plan_updated_at: new Date().toISOString(),
  });

  try { await planChangeEmail(detailer.email, oldPlan, 'free'); } catch {}

  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    await sendSMS(adminPhone, `Subscription cancelled: ${detailer.email} (was ${oldPlan}→free)`);
  }
}

// ─── Handle: billing failure ───
async function handleBillingFailure(supabase, payload) {
  const detailer = await findDetailer(supabase, payload);
  if (!detailer) return;

  const classification = await classifySubscriptionEvent(supabase, payload);
  const pricingRow = await hasActivePricingRow(supabase, detailer.email);
  if (!billingAffectsCrm({ classification, hasActivePricingRow: pricingRow })) {
    console.log(`[shopify-webhook] billing failure not for CRM subscription (${detailer.email}) — CRM account untouched`);
    return;
  }
  if (isCompedDetailer(detailer)) {
    console.log(`[shopify-webhook] billing failure ignored for comped account ${detailer.email}`);
    return;
  }

  await updateDetailerRow(supabase, detailer.id, { status: 'suspended' });

  await sendEmail(
    detailer.email,
    'Payment failed — Shiny Jets CRM account paused',
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#333;">Payment Failed</h2>
      <p>We were unable to process your Shiny Jets CRM subscription payment. Your account has been paused.</p>
      <p>Please update your payment method to restore access.</p>
      <p><a href="https://shinyjets.com/account" style="color:#007CB1;">Update payment method →</a></p>
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

  const classification = await classifySubscriptionEvent(supabase, payload);
  const pricingRow = await hasActivePricingRow(supabase, detailer.email);
  if (!billingAffectsCrm({ classification, hasActivePricingRow: pricingRow })) return;

  await updateDetailerRow(supabase, detailer.id, { status: 'active' });

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

// ─── Which registration owns orders/paid? ───
// Shopify has TWO admin "Order payment" webhooks: the original one -> /api/shopify/webhook (does all
// provisioning) and a second one -> /api/webhooks/shopify (added for the $4.99 expert question).
// Both reach this handler, so one paid order arrives twice, almost at the same time. The per-order
// guards below (crm_plan_granted etc.) are check-then-insert and don't stop two concurrent copies, so
// only the original path provisions. The canonical path runs just the ask-expert step on orders/paid,
// which is atomic (conditional status update + unique shopify_order_id) and notifies Brett once.
// Every other topic is unchanged on both paths. See lib/shopify-webhook-routing.js.
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
        if (orderPaidMode(request.url) === 'full') {
          await handleOrderPaid(supabase, payload);
        } else {
          await handleAskExpertPaid(supabase, payload);
        }
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
