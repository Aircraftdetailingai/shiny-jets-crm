// Email + owner alert for paid Shopify course orders that have no buyer email.
// Phone-only checkouts (no order.email, no customer.email) used to be skipped
// with a log line. These helpers find an email anywhere on the payload, and
// when none exists build one owner alert that can be deduped per order.

import { escapeHtml } from './crm-plan-grants';

export const MISSING_EMAIL_ALERT_TOPIC = 'course_missing_email_alerted';
export const MISSING_EMAIL_ALERT_TO = 'sales@shinyjets.com';

const NOTE_EMAIL_KEYS = new Set([
  'email',
  'customer_email',
  'contact_email',
  'e-mail',
  'buyer_email',
]);

/** Trim and lowercase. Blank stays blank. Does not reject odd but non-empty values. */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

/** Admin-supplied address: must look like an email so we don't create a junk login. */
export function usableAdminEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function emailFromAttributes(list) {
  if (!Array.isArray(list)) return '';
  for (const attr of list) {
    const name = String(attr?.name || attr?.key || '').trim().toLowerCase();
    if (!NOTE_EMAIL_KEYS.has(name)) continue;
    const email = normalizeEmail(attr?.value);
    if (email) return email;
  }
  return '';
}

/**
 * Buyer email from a Shopify order payload.
 * Existing order (customer.email, email, contact_email, billing_address.email)
 * stay first so an order that already has an email resolves the same way.
 * Shipping, the customer default address, note attributes, and line-item
 * properties are only used when those are blank.
 */
export function extractOrderEmail(payload) {
  const direct = [
    payload?.customer?.email,
    payload?.email,
    payload?.contact_email,
    payload?.billing_address?.email,
    payload?.shipping_address?.email,
    payload?.customer?.default_address?.email,
  ];
  for (const candidate of direct) {
    const email = normalizeEmail(candidate);
    if (email) return email;
  }
  const fromNotes = emailFromAttributes(payload?.note_attributes)
    || emailFromAttributes(payload?.noteAttributes);
  if (fromNotes) return fromNotes;
  for (const item of payload?.line_items || []) {
    const fromProps = emailFromAttributes(item?.properties);
    if (fromProps) return fromProps;
  }
  return '';
}

export function orderCustomerName(payload) {
  const customer = payload?.customer || {};
  const fromCustomer = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  if (fromCustomer) return fromCustomer;
  const billing = payload?.billing_address || {};
  const fromBilling = billing.name || [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim();
  if (fromBilling) return fromBilling;
  const shipping = payload?.shipping_address || {};
  return shipping.name || [shipping.first_name, shipping.last_name].filter(Boolean).join(' ').trim() || '';
}

export function orderPhone(payload) {
  const candidates = [
    payload?.phone,
    payload?.customer?.phone,
    payload?.billing_address?.phone,
    payload?.shipping_address?.phone,
    payload?.customer?.default_address?.phone,
  ];
  for (const phone of candidates) {
    if (phone && String(phone).trim()) return String(phone).trim();
  }
  return '';
}

export function shopifyStoreHandle(env = process.env) {
  const raw = String(env?.SHOPIFY_STORE_URL || 'shinyjets.myshopify.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  return raw.split('.')[0] || 'shinyjets';
}

export function shopifyAdminOrderUrl(orderId, env = process.env) {
  const id = String(orderId || '').trim();
  if (!id) return '';
  return `https://admin.shopify.com/store/${shopifyStoreHandle(env)}/orders/${id}`;
}

export function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key|unique constraint/i.test(String(error.message || error.details || ''));
}

export function missingCourseEmailAlert({ payload, courseItem, env = process.env } = {}) {
  const orderId = String(payload?.id || '');
  const orderNumber = String(
    payload?.name
    || (payload?.order_number != null && payload?.order_number !== '' ? `#${payload.order_number}` : '')
    || '',
  );
  const customerName = orderCustomerName(payload) || '(no name)';
  const phone = orderPhone(payload) || '(no phone)';
  const productTitle = courseItem?.title || courseItem?.name || '(unknown product)';
  const adminUrl = shopifyAdminOrderUrl(orderId, env);
  const subject = `Course order missing email: ${orderNumber || orderId || 'unknown order'}`;
  const adminLine = adminUrl || '(store URL not configured)';
  const text = [
    'A paid Shopify course order has no usable email, so CRM and Pricing App provisioning was skipped.',
    '',
    `Order: ${orderNumber || '(no number)'}`,
    `Order ID: ${orderId || '(none)'}`,
    `Customer: ${customerName}`,
    `Phone: ${phone}`,
    `Product: ${productTitle}`,
    `Shopify admin: ${adminLine}`,
    '',
    'Add the buyer email, then provision the account from Admin → Shopify setup (POST /api/admin/course-provision).',
  ].join('\n');
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <h2 style="color:#333;">Course order missing email</h2>
    <p>A paid Shopify course order has no usable email, so CRM and Pricing App provisioning was skipped.</p>
    <ul>
      <li><strong>Order:</strong> ${escapeHtml(orderNumber || '(no number)')}</li>
      <li><strong>Order ID:</strong> ${escapeHtml(orderId || '(none)')}</li>
      <li><strong>Customer:</strong> ${escapeHtml(customerName)}</li>
      <li><strong>Phone:</strong> ${escapeHtml(phone)}</li>
      <li><strong>Product:</strong> ${escapeHtml(productTitle)}</li>
      <li><strong>Shopify admin:</strong> ${adminUrl ? `<a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a>` : escapeHtml(adminLine)}</li>
    </ul>
    <p>Add the buyer email, then provision the account from Admin → Shopify setup.</p>
  </body></html>`;
  const sms = `Course order missing email ${orderNumber || orderId || ''}. ${customerName}. ${phone}. ${productTitle}. ${adminUrl}`.trim();
  return {
    to: MISSING_EMAIL_ALERT_TO,
    subject,
    html,
    text,
    sms,
    orderId,
    orderNumber,
    customerName,
    phone,
    productTitle,
    adminUrl,
  };
}

export async function alreadyAlertedMissingEmail(supabase, orderId) {
  if (!supabase || !orderId) return false;
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('id')
    .eq('source', 'shopify')
    .eq('topic', MISSING_EMAIL_ALERT_TOPIC)
    .filter('payload->>order_id', 'eq', String(orderId))
    .limit(1);
  if (!error) return !!(data && data.length);
  const { data: recent } = await supabase
    .from('webhook_logs')
    .select('id, payload')
    .eq('source', 'shopify')
    .eq('topic', MISSING_EMAIL_ALERT_TOPIC)
    .order('created_at', { ascending: false })
    .limit(200);
  return (recent || []).some((row) => String(row?.payload?.order_id || '') === String(orderId));
}

async function claimMissingEmailAlert(supabase, facts) {
  const row = {
    source: 'shopify',
    topic: MISSING_EMAIL_ALERT_TOPIC,
    payload: {
      order_id: facts.orderId,
      order_name: facts.orderNumber || null,
      customer_name: facts.customerName,
      phone: facts.phone,
      product_title: facts.productTitle,
      admin_url: facts.adminUrl || null,
    },
    processed: true,
  };
  const { error } = await supabase.from('webhook_logs').insert(row);
  if (!error) return { claimed: true };
  if (isUniqueViolation(error)) return { claimed: false, duplicate: true };
  // Audit insert failed for another reason. Still alert so the owner is not
  // left with a silent skip; a later retry may send again.
  console.error('[shopify-webhook] missing-email alert log failed:', error.message || error);
  return { claimed: true, logError: error.message || String(error) };
}

/**
 * Email sales@shinyjets.com and SMS ADMIN_PHONE (when Twilio is configured)
 * once per Shopify order. Claim the webhook_logs row before sending so a
 * retry — and the second in-request call from pricing + CRM — does not
 * double-notify. Concurrent retries need the unique index in
 * supabase/migrations/20261009_course_missing_email_alert.sql.
 */
export async function alertMissingCourseEmail({
  supabase,
  payload,
  courseItem,
  sendEmail,
  sendSms,
  env = process.env,
} = {}) {
  try {
    if (extractOrderEmail(payload)) {
      return { alerted: false, reason: 'has_email' };
    }
    const facts = missingCourseEmailAlert({ payload, courseItem, env });
    if (facts.orderId && await alreadyAlertedMissingEmail(supabase, facts.orderId)) {
      return { alerted: false, reason: 'duplicate', orderId: facts.orderId };
    }
    const claim = facts.orderId
      ? await claimMissingEmailAlert(supabase, facts)
      : { claimed: true };
    if (!claim.claimed) {
      return { alerted: false, reason: 'duplicate', orderId: facts.orderId };
    }
    const from = env?.COURSE_PROVISION_FROM || 'Shiny Jets <sales@shinyjets.com>';
    const replyTo = env?.COURSE_PROVISION_REPLY_TO || 'sales@shinyjets.com';
    let emailSent = false;
    if (sendEmail) {
      emailSent = !!(await sendEmail(facts.to, facts.subject, facts.html, {
        text: facts.text,
        from,
        replyTo,
      }));
    }
    const adminPhone = env?.ADMIN_PHONE || '';
    let smsSent = false;
    if (sendSms && adminPhone) {
      smsSent = (await sendSms(adminPhone, facts.sms)) !== false;
    }
    console.error(
      `[shopify-webhook] course order ${facts.orderNumber || facts.orderId} has no email; alerted sales@ (email=${emailSent} sms=${smsSent})`,
    );
    return { alerted: true, emailSent, smsSent, ...facts, logError: claim.logError || null };
  } catch (e) {
    console.error('[shopify-webhook] missing-email alert failed:', e?.message || e);
    return { alerted: false, reason: 'error', error: e?.message || String(e) };
  }
}
