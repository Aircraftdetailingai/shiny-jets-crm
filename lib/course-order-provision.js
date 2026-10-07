// Admin replay of a paid course order once the buyer email is known.
// Fetches the Shopify order when the Admin API is configured, otherwise
// accepts the fields the webhook needs, then runs handleOrderPaid — the
// same function the orders/paid webhook uses.

import { handleOrderPaid } from './shopify-webhook-handlers';
import {
  extractOrderEmail,
  orderCustomerName,
  orderPhone,
  shopifyStoreHandle,
  usableAdminEmail,
} from './course-order-email';

const GRANT_TOPICS = ['course_enterprise_granted', 'course_pricing_access_granted'];

export function applyKnownEmail(order, email) {
  const normalized = usableAdminEmail(email);
  if (!normalized) return { error: 'Valid email required' };
  const payload = order && typeof order === 'object' ? { ...order } : {};
  payload.email = normalized;
  payload.contact_email = normalized;
  const customer = { ...(payload.customer || {}) };
  customer.email = normalized;
  const phone = orderPhone(payload);
  if (phone && !customer.phone) customer.phone = phone;
  if (!customer.first_name) {
    const name = orderCustomerName(payload);
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      customer.first_name = parts[0] || customer.first_name;
      if (!customer.last_name && parts.length > 1) customer.last_name = parts.slice(1).join(' ');
    }
  }
  payload.customer = customer;
  if (!payload.financial_status) payload.financial_status = 'paid';
  return { payload, email: normalized };
}

export function orderFromAdminFields(body = {}) {
  const orderRef = body.order_id || body.shopify_order_id || body.order || body.order_number || '';
  const numberRaw = body.order_number != null ? String(body.order_number).trim() : '';
  const orderName = body.order_name
    || (numberRaw ? (numberRaw.startsWith('#') ? numberRaw : `#${numberRaw.replace(/^#/, '')}`) : null);
  const lineItems = Array.isArray(body.line_items) && body.line_items.length
    ? body.line_items
    : (body.product_title
      ? [{
        title: body.product_title,
        sku: body.sku || '',
        product_id: body.product_id || null,
        quantity: 1,
      }]
      : []);
  const name = String(body.customer_name || body.name || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    id: orderRef ? String(orderRef).replace(/^#/, '') : '',
    name: orderName,
    order_number: numberRaw ? numberRaw.replace(/^#/, '') : null,
    financial_status: 'paid',
    phone: body.phone || null,
    customer: {
      id: body.customer_id || null,
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' '),
      phone: body.phone || null,
      email: null,
    },
    billing_address: body.phone || name
      ? { phone: body.phone || null, first_name: parts[0] || '', last_name: parts.slice(1).join(' '), name }
      : null,
    line_items: lineItems,
  };
}

export async function fetchShopifyOrder({ orderRef, env = process.env, fetchImpl = fetch } = {}) {
  const token = env?.SHOPIFY_ACCESS_TOKEN;
  const host = String(env?.SHOPIFY_STORE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!token || !host) return { order: null, error: 'shopify_not_configured' };
  const ref = String(orderRef || '').trim();
  if (!ref) return { order: null, error: 'missing_order' };
  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };
  const base = `https://${host}/admin/api/2024-01`;
  const digits = ref.replace(/^#/, '');
  if (/^\d+$/.test(digits)) {
    try {
      const res = await fetchImpl(`${base}/orders/${digits}.json`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json?.order?.id) return { order: json.order, source: 'shopify' };
      }
    } catch (e) {
      return { order: null, error: e?.message || 'shopify_fetch_failed' };
    }
  }
  const name = ref.startsWith('#') ? ref : `#${digits}`;
  try {
    const url = `${base}/orders.json?status=any&name=${encodeURIComponent(name)}&limit=5`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) return { order: null, error: `shopify_${res.status}` };
    const json = await res.json();
    const orders = json?.orders || [];
    const exact = orders.find((o) => String(o?.name || '').toLowerCase() === name.toLowerCase()) || orders[0];
    if (!exact) return { order: null, error: 'order_not_found' };
    return { order: exact, source: 'shopify' };
  } catch (e) {
    return { order: null, error: e?.message || 'shopify_fetch_failed' };
  }
}

async function readByEmail(supabase, table, email) {
  const { data, error } = await supabase.from(table).select('*').eq('email', email).maybeSingle();
  if (error) return { row: null, error: error.message || String(error) };
  return { row: data || null, error: null };
}

async function grantTopicsPresent(supabase, orderId) {
  if (!orderId) return null;
  const present = {};
  for (const topic of GRANT_TOPICS) {
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('id')
      .eq('source', 'shopify')
      .eq('topic', topic)
      .filter('payload->>order_id', 'eq', String(orderId))
      .limit(1);
    if (error) return null;
    present[topic] = !!(data && data.length);
  }
  return present;
}

function detailerReport(before, after) {
  if (!after) return { action: 'not_created' };
  const fields = {
    id: after.id,
    email: after.email,
    plan: after.plan,
    subscription_status: after.subscription_status,
    subscription_source: after.subscription_source,
    plan_expires_at: after.plan_expires_at || null,
    trial_ends_at: after.trial_ends_at || null,
    must_change_password: after.must_change_password === true,
  };
  if (!before) return { action: 'created', ...fields };
  const changed = before.plan !== after.plan
    || before.subscription_status !== after.subscription_status
    || before.subscription_source !== after.subscription_source
    || String(before.plan_expires_at || '') !== String(after.plan_expires_at || '')
    || String(before.trial_ends_at || '') !== String(after.trial_ends_at || '');
  return { action: changed ? 'upgraded' : 'unchanged', ...fields };
}

function accessReport(before, after) {
  if (!after) return { action: 'not_created' };
  const fields = {
    email: after.email,
    product_type: after.product_type || null,
    status: after.status || null,
    access_end: after.access_end || null,
    shopify_order_id: after.shopify_order_id || null,
  };
  if (!before) return { action: 'created', ...fields };
  const changed = before.product_type !== after.product_type
    || before.status !== after.status
    || String(before.access_end || '') !== String(after.access_end || '');
  const extended = changed && before.access_end && after.access_end
    && new Date(after.access_end).getTime() > new Date(before.access_end).getTime();
  return { action: !changed ? 'unchanged' : (extended ? 'extended' : 'updated'), ...fields };
}

/**
 * Run the webhook's orders/paid provisioning for one course order + email.
 * Idempotent: an order that already has both course grant logs is reported
 * and not run again. An existing detailers / app_access row for the email
 * is upgraded or extended by handleOrderPaid (no second insert).
 */
export async function provisionAdminCourseOrder({
  supabase,
  order,
  email,
  runOrderPaid = handleOrderPaid,
} = {}) {
  if (!supabase) return { ok: false, error: 'Database not configured' };
  const applied = applyKnownEmail(order, email);
  if (applied.error) return { ok: false, error: applied.error };
  const payload = applied.payload;
  const orderId = String(payload?.id || '');
  if (!orderId) return { ok: false, error: 'Shopify order id or number is required' };
  if (!payload?.line_items?.length) {
    return { ok: false, error: 'Order has no line items. Pass product_title or line_items when Shopify cannot be read.' };
  }

  const beforeDetailer = await readByEmail(supabase, 'detailers', applied.email);
  const beforeAccess = await readByEmail(supabase, 'app_access', applied.email);
  // Snapshot before the write. A client that returns the live row would
  // otherwise make this comparison look like a no-op after the update.
  const beforeDetailerRow = beforeDetailer.row ? { ...beforeDetailer.row } : null;
  const beforeAccessRow = beforeAccess.row ? { ...beforeAccess.row } : null;
  const grants = await grantTopicsPresent(supabase, orderId);
  const already = !!(grants?.course_enterprise_granted && grants?.course_pricing_access_granted);

  if (!already) {
    await runOrderPaid(supabase, payload);
  }

  const afterDetailer = await readByEmail(supabase, 'detailers', applied.email);
  const afterAccess = await readByEmail(supabase, 'app_access', applied.email);
  const detailer = detailerReport(beforeDetailerRow, afterDetailer.row);
  const appAccess = accessReport(beforeAccessRow, afterAccess.row);
  const provisionedEmail = extractOrderEmail(payload);

  return {
    ok: !!(afterDetailer.row || afterAccess.row),
    already_provisioned: already,
    email: provisionedEmail || applied.email,
    order_id: orderId,
    order_name: payload.name || null,
    detailer,
    app_access: appAccess,
    detailer_read_error: afterDetailer.error,
    app_access_read_error: afterAccess.error,
  };
}

export function shopifyHost(env = process.env) {
  return shopifyStoreHandle(env);
}
