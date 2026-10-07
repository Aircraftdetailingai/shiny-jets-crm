/**
 * Phone-only Shopify course orders must alert the owner (once), and an admin
 * can provision the same order later through the webhook's orders/paid path.
 *
 *   node --import ./scripts/test-support/register.mjs scripts/test-course-missing-email.mjs
 */
import assert from 'assert/strict';
import fs from 'fs';
import {
  extractOrderEmail,
  missingCourseEmailAlert,
  alertMissingCourseEmail,
  shopifyAdminOrderUrl,
  MISSING_EMAIL_ALERT_TO,
  MISSING_EMAIL_ALERT_TOPIC,
} from '../lib/course-order-email.js';
import { fetchShopifyOrder, orderFromAdminFields, provisionAdminCourseOrder } from '../lib/course-order-provision.js';
import { handleOrderPaid } from '../lib/shopify-webhook-handlers.js';

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const bodyText = typeof opts.body === 'string'
    ? opts.body
    : (opts.body && typeof opts.body.toString === 'function' ? opts.body.toString() : '');
  calls.push({ url: u, body: bodyText, headers: opts.headers });
  if (u.includes('api.resend.com')) {
    return new Response(JSON.stringify({ id: 'email_test' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.includes('api.twilio.com')) {
    return new Response(JSON.stringify({ sid: 'SM_test' }), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({}), { status: 404, headers: { 'content-type': 'application/json' } });
};

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_not_a_real_key';
process.env.TWILIO_ACCOUNT_SID = 'AC_test';
process.env.TWILIO_AUTH_TOKEN = 'twilio_test';
process.env.TWILIO_PHONE_NUMBER = '+15550000000';
process.env.ADMIN_PHONE = '+15559990000';
process.env.SHOPIFY_STORE_URL = 'shinyjets.myshopify.com';
delete process.env.ASK_EXPERT_VARIANT_ID;

const tests = [];
const check = (name, fn) => tests.push([name, fn]);

function memorySupabase() {
  const tables = {};
  let seq = 1;
  function rowsOf(table) {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  }
  function match(row, filters) {
    return filters.every(([op, key, value]) => {
      if (op === 'eq') return String(row[key] ?? '') === String(value ?? '');
      if (op === 'ilike') return String(row[key] ?? '').toLowerCase() === String(value ?? '').toLowerCase();
      if (op === 'filter' && key === 'payload->>order_id') return String(row?.payload?.order_id ?? '') === String(value);
      if (op === 'filter' && key === 'payload->>id') return String(row?.payload?.id ?? '') === String(value);
      return false;
    });
  }
  function from(table) {
    const state = { op: 'select', filters: [], patch: null };
    const api = {
      select() { state.op = 'select'; return api; },
      eq(k, v) { state.filters.push(['eq', k, v]); return api; },
      ilike(k, v) { state.filters.push(['ilike', k, v]); return api; },
      filter(k, _op, v) { state.filters.push(['filter', k, v]); return api; },
      order() { return api; },
      limit() { return api; },
      in() { return api; },
      maybeSingle() {
        const found = rowsOf(table).filter((row) => match(row, state.filters));
        return Promise.resolve({ data: found[0] || null, error: null });
      },
      update(patch) { state.op = 'update'; state.patch = patch; return api; },
      upsert(row) {
        const list = rowsOf(table);
        const idx = list.findIndex((r) => r.email === row.email);
        if (idx >= 0) list[idx] = { ...list[idx], ...row };
        else list.push({ ...row });
        return Promise.resolve({ data: row, error: null });
      },
      insert(row) {
        const incoming = Array.isArray(row) ? row : [row];
        if (incoming.some((r) => r.topic === MISSING_EMAIL_ALERT_TOPIC)) {
          const dup = incoming.some((r) => rowsOf(table).some((existing) =>
            existing.source === 'shopify'
            && existing.topic === MISSING_EMAIL_ALERT_TOPIC
            && String(existing.payload?.order_id || '') === String(r.payload?.order_id || '')));
          if (dup) {
            const error = { code: '23505', message: 'duplicate key value violates unique constraint' };
            return { then: (res, rej) => Promise.resolve({ data: null, error }).then(res, rej) };
          }
        }
        const inserted = incoming.map((r) => ({ id: r.id || `id-${seq++}`, ...r }));
        rowsOf(table).push(...inserted);
        const result = { data: inserted, error: null };
        return {
          select() {
            return { maybeSingle: async () => ({ data: inserted[0], error: null }) };
          },
          then: (res, rej) => Promise.resolve(result).then(res, rej),
        };
      },
      then(res, rej) {
        if (state.op === 'update') {
          const found = rowsOf(table).filter((row) => match(row, state.filters));
          found.forEach((row) => Object.assign(row, state.patch));
          return Promise.resolve({ data: found, error: null }).then(res, rej);
        }
        const found = rowsOf(table).filter((row) => match(row, state.filters));
        return Promise.resolve({ data: found, error: null }).then(res, rej);
      },
    };
    return api;
  }
  return { from, tables };
}

function courseOrder(over = {}) {
  return {
    id: 6408206205129,
    name: '#2098',
    phone: '+15557654321',
    customer: { first_name: 'Brian', last_name: 'Brown', phone: '+15557654321' },
    billing_address: { first_name: 'Brian', last_name: 'Brown', phone: '+15557654321' },
    line_items: [{ title: 'Online Aircraft Detailing Course', sku: 'ONLINE-COURSE', product_id: 111 }],
    ...over,
  };
}

function resendBodies() {
  return calls.filter((c) => c.url.includes('api.resend.com')).map((c) => c.body);
}
function twilioBodies() {
  return calls.filter((c) => c.url.includes('api.twilio.com')).map((c) => decodeURIComponent(c.body.replace(/\+/g, ' ')));
}

check('extractOrderEmail keeps the old field order, then shipping / notes', () => {
  assert.equal(extractOrderEmail({ customer: { email: ' A@B.co ' }, email: 'order@b.co', shipping_address: { email: 'ship@b.co' } }), 'a@b.co');
  assert.equal(extractOrderEmail({ email: 'Order@B.co', contact_email: 'c@b.co' }), 'order@b.co');
  assert.equal(extractOrderEmail({ contact_email: 'C@B.co', billing_address: { email: 'bill@b.co' } }), 'c@b.co');
  assert.equal(extractOrderEmail({ billing_address: { email: 'Bill@B.co' }, shipping_address: { email: 'ship@b.co' } }), 'bill@b.co');
  assert.equal(extractOrderEmail({ customer: { email: '   ' }, email: '', shipping_address: { email: 'Ship@B.co' } }), 'ship@b.co');
  assert.equal(extractOrderEmail({ customer: { default_address: { email: 'Default@B.co' } } }), 'default@b.co');
  assert.equal(extractOrderEmail({ note_attributes: [{ name: 'email', value: 'Note@B.co' }] }), 'note@b.co');
  assert.equal(extractOrderEmail({ line_items: [{ properties: [{ name: 'customer_email', value: 'Prop@B.co' }] }] }), 'prop@b.co');
  assert.equal(extractOrderEmail({ phone: '+1555', customer: { phone: '+1555' } }), '');
  assert.equal(shopifyAdminOrderUrl('6408206205129', { SHOPIFY_STORE_URL: 'https://shinyjets.myshopify.com/' }), 'https://admin.shopify.com/store/shinyjets/orders/6408206205129');
});

check('missing-email alert includes order, buyer, product, and Shopify admin link', async () => {
  const payload = courseOrder();
  const db = memorySupabase();
  const sent = [];
  const result = await alertMissingCourseEmail({
    supabase: db,
    payload,
    courseItem: payload.line_items[0],
    sendEmail: (to, subject, html, options) => { sent.push({ to, subject, html, options }); return true; },
    sendSms: (to, body) => { sent.push({ smsTo: to, body }); return true; },
    env: { ADMIN_PHONE: '+15551110000', SHOPIFY_STORE_URL: 'shinyjets.myshopify.com', COURSE_PROVISION_FROM: 'Shiny Jets <sales@shinyjets.com>' },
  });
  assert.equal(result.alerted, true);
  assert.equal(result.emailSent, true);
  assert.equal(result.smsSent, true);
  assert.equal(sent[0].to, MISSING_EMAIL_ALERT_TO);
  assert.match(sent[0].subject, /#2098/);
  for (const piece of ['#2098', '6408206205129', 'Brian Brown', '+15557654321', 'Online Aircraft Detailing Course', 'https://admin.shopify.com/store/shinyjets/orders/6408206205129']) {
    assert.match(sent[0].html, new RegExp(piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(sent[0].options.text, new RegExp(piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(sent[1].body, /#2098/);
  assert.equal(sent[1].smsTo, '+15551110000');
  assert.equal(sent[0].options.from, 'Shiny Jets <sales@shinyjets.com>');
  const log = db.tables.webhook_logs[0];
  assert.equal(log.topic, MISSING_EMAIL_ALERT_TOPIC);
  assert.equal(log.payload.order_id, '6408206205129');
  assert.equal(log.payload.customer_name, 'Brian Brown');
  assert.equal(missingCourseEmailAlert({ payload, courseItem: payload.line_items[0] }).to, 'sales@shinyjets.com');
});

check('retry dedupes the alert; a lost insert race does not send twice', async () => {
  const payload = courseOrder();
  const db = memorySupabase();
  const sent = [];
  const args = {
    supabase: db,
    payload,
    courseItem: payload.line_items[0],
    sendEmail: () => { sent.push('email'); return true; },
    sendSms: () => { sent.push('sms'); return true; },
    env: { ADMIN_PHONE: '+15551110000', SHOPIFY_STORE_URL: 'shinyjets.myshopify.com' },
  };
  const first = await alertMissingCourseEmail(args);
  const second = await alertMissingCourseEmail(args);
  assert.equal(first.alerted, true);
  assert.equal(second.reason, 'duplicate');
  assert.deepEqual(sent, ['email', 'sms']);
  assert.equal(db.tables.webhook_logs.length, 1);

  let inserts = 0;
  const race = {
    from() {
      const api = {
        select() { return api; },
        eq() { return api; },
        filter() { return api; },
        order() { return api; },
        limit: async () => ({ data: [], error: null }),
        insert: async () => {
          inserts += 1;
          if (inserts > 1) return { error: { code: '23505', message: 'duplicate key value violates unique constraint webhook_logs_course_missing_email_order_uidx' } };
          return { error: null };
        },
      };
      return api;
    },
  };
  const raced = [];
  const raceArgs = { ...args, supabase: race, sendEmail: () => { raced.push('email'); return true; }, sendSms: () => { raced.push('sms'); return true; } };
  assert.equal((await alertMissingCourseEmail(raceArgs)).alerted, true);
  assert.equal((await alertMissingCourseEmail(raceArgs)).reason, 'duplicate');
  assert.deepEqual(raced, ['email', 'sms']);
});

check('webhook: phone-only course order alerts once and does not create an account', async () => {
  calls.length = 0;
  const db = memorySupabase();
  const payload = courseOrder();
  await handleOrderPaid(db, payload);
  await handleOrderPaid(db, payload);
  assert.equal(db.tables.detailers?.length || 0, 0);
  assert.equal((db.tables.app_access || []).length, 0);
  const alerts = (db.tables.webhook_logs || []).filter((r) => r.topic === MISSING_EMAIL_ALERT_TOPIC);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].payload.order_name, '#2098');
  assert.equal(alerts[0].payload.phone, '+15557654321');
  const emails = resendBodies();
  assert.equal(emails.length, 1);
  assert.match(emails[0], /sales@shinyjets.com/);
  assert.match(emails[0], /#2098/);
  assert.match(emails[0], /6408206205129/);
  assert.match(emails[0], /Brian Brown/);
  assert.match(emails[0], /Online Aircraft Detailing Course/);
  assert.match(emails[0], /admin\.shopify\.com\/store\/shinyjets\/orders\/6408206205129/);
  const texts = twilioBodies();
  assert.equal(texts.length, 1);
  assert.match(texts[0], /#2098/);
  assert.match(texts[0], /\+15557654321/);
});

check('webhook: an email on shipping (or the order) provisions and does not alert', async () => {
  calls.length = 0;
  const db = memorySupabase();
  await handleOrderPaid(db, courseOrder({
    id: 7001,
    name: '#2068',
    customer: { first_name: 'Arturo', last_name: 'Vega', phone: '+15551212' },
    shipping_address: { email: 'Arturo@Shop.test', phone: '+15551212' },
    line_items: [{ title: 'Aircraft Detailing Masterclass', sku: 'MASTERCLASS' }],
  }));
  assert.equal(db.tables.detailers.length, 1);
  const detailer = db.tables.detailers[0];
  assert.equal(detailer.email, 'arturo@shop.test');
  assert.equal(detailer.plan, 'business');
  assert.equal(detailer.subscription_status, 'comped');
  assert.equal(detailer.subscription_source, 'course_bundle');
  assert.equal(detailer.must_change_password, true);
  assert.ok(detailer.password_hash);
  assert.equal(db.tables.app_access.length, 1);
  assert.equal(db.tables.app_access[0].product_type, 'masterclass_annual');
  assert.equal(db.tables.app_access[0].email, 'arturo@shop.test');
  assert.equal((db.tables.webhook_logs || []).filter((r) => r.topic === MISSING_EMAIL_ALERT_TOPIC).length, 0);
  const emails = resendBodies();
  assert.ok(emails.some((body) => /arturo@shop\.test/i.test(body) && /sales@shinyjets.com/.test(body) && /CRM Business login/.test(body)));

  calls.length = 0;
  const db2 = memorySupabase();
  await handleOrderPaid(db2, courseOrder({
    id: 7002,
    email: 'OnOrder@Shop.test',
    customer: { first_name: 'Pat', last_name: 'Lee', email: 'Customer@Shop.test' },
    shipping_address: { email: 'Ship@Shop.test' },
  }));
  assert.equal(db2.tables.detailers[0].email, 'customer@shop.test');
  assert.equal((db2.tables.webhook_logs || []).filter((r) => r.topic === MISSING_EMAIL_ALERT_TOPIC).length, 0);
});

check('webhook: a non-course order with no email is not alerted', async () => {
  calls.length = 0;
  const db = memorySupabase();
  await handleOrderPaid(db, {
    id: 42,
    name: '#10',
    phone: '+15550001',
    customer: { first_name: 'Sam' },
    line_items: [{ title: 'Microfiber Towel', sku: 'TOWEL' }],
  });
  assert.equal((db.tables.webhook_logs || []).filter((r) => r.topic === MISSING_EMAIL_ALERT_TOPIC).length, 0);
  assert.equal(resendBodies().length, 0);
  assert.equal(db.tables.detailers?.length || 0, 0);
});

check('admin provision creates once, then a second call does not duplicate', async () => {
  const db = memorySupabase();
  const order = courseOrder({
    id: 6408206205001,
    name: '#2068',
    customer: { first_name: 'Arturo', last_name: 'Vega', phone: '+15551212068' },
    line_items: [{ title: 'Aircraft Detailing Masterclass', sku: 'MASTERCLASS' }],
  });
  const first = await provisionAdminCourseOrder({ supabase: db, order, email: 'Arturo@Example.com' });
  assert.equal(first.ok, true);
  assert.equal(first.already_provisioned, false);
  assert.equal(first.email, 'arturo@example.com');
  assert.equal(first.detailer.action, 'created');
  assert.equal(first.detailer.plan, 'business');
  assert.equal(first.detailer.subscription_status, 'comped');
  assert.equal(first.detailer.subscription_source, 'course_bundle');
  assert.equal(first.detailer.must_change_password, true);
  assert.equal(first.app_access.action, 'created');
  assert.equal(first.app_access.product_type, 'masterclass_annual');
  const created = db.tables.detailers[0];
  assert.equal(created.phone, '+15551212068');
  const expires = new Date(created.plan_expires_at).getTime();
  assert.ok(expires > Date.now() + 360 * 86400000 && expires < Date.now() + 370 * 86400000);

  const second = await provisionAdminCourseOrder({ supabase: db, order, email: 'arturo@example.com' });
  assert.equal(second.already_provisioned, true);
  assert.equal(second.detailer.action, 'unchanged');
  assert.equal(second.app_access.action, 'unchanged');
  assert.equal(db.tables.detailers.length, 1);
  assert.equal(db.tables.app_access.length, 1);
  assert.equal(db.tables.detailers[0].password_hash, created.password_hash);
  assert.equal(db.tables.detailers[0].must_change_password, true);
});

check('admin provision upgrades an existing detailer and does not shorten Pricing App access', async () => {
  const db = memorySupabase();
  db.tables.detailers = [{
    id: 'brian-1',
    email: 'brian@example.com',
    name: 'Brian Brown',
    plan: 'free',
    subscription_status: 'active',
    subscription_source: 'free',
    status: 'active',
    password_hash: 'keep-me',
    must_change_password: false,
    phone: '+15557654321',
    trial_ends_at: null,
    plan_expires_at: null,
  }];
  db.tables.app_access = [{
    email: 'brian@example.com',
    product_type: 'monthly',
    status: 'active',
    access_end: '2030-01-01T00:00:00.000Z',
    access_start: '2026-01-01T00:00:00.000Z',
  }];
  const order = courseOrder();
  const result = await provisionAdminCourseOrder({ supabase: db, order, email: 'Brian@Example.com' });
  assert.equal(result.detailer.action, 'upgraded');
  assert.equal(result.detailer.plan, 'business');
  assert.equal(result.detailer.subscription_status, 'comped');
  assert.equal(result.detailer.subscription_source, 'course_bundle');
  assert.equal(result.detailer.must_change_password, false);
  assert.equal(db.tables.detailers.length, 1);
  assert.equal(db.tables.detailers[0].id, 'brian-1');
  assert.equal(db.tables.detailers[0].password_hash, 'keep-me');
  assert.equal(db.tables.app_access.length, 1);
  assert.equal(db.tables.app_access[0].access_end, '2030-01-01T00:00:00.000Z');
  assert.equal(db.tables.app_access[0].product_type, 'online_course_annual');

  const again = await provisionAdminCourseOrder({ supabase: db, order, email: 'brian@example.com' });
  assert.equal(again.already_provisioned, true);
  assert.equal(again.detailer.action, 'unchanged');
  assert.equal(db.tables.detailers.length, 1);
  assert.equal(db.tables.detailers[0].password_hash, 'keep-me');
  assert.equal(db.tables.app_access[0].access_end, '2030-01-01T00:00:00.000Z');
});

check('running the webhook path twice for the same emailed order does not insert a second detailer', async () => {
  const db = memorySupabase();
  const payload = courseOrder({
    id: 8001,
    email: 'once@example.com',
    customer: { first_name: 'Once', last_name: 'Buyer', email: 'once@example.com', phone: '+15550001' },
    line_items: [{ title: 'On-Site Corporate Training', sku: 'ONSITE' }],
  });
  await handleOrderPaid(db, payload);
  const hash = db.tables.detailers[0].password_hash;
  const drips = db.tables.drip_messages.length;
  await handleOrderPaid(db, payload);
  assert.equal(db.tables.detailers.length, 1);
  assert.equal(db.tables.detailers[0].password_hash, hash);
  assert.equal(db.tables.drip_messages.length, drips);
  assert.equal(db.tables.app_access.length, 1);
  assert.equal(db.tables.app_access[0].product_type, 'onsite_annual');
});

check('manual fields and Shopify order lookup', async () => {
  const manual = orderFromAdminFields({
    order_number: '#2068',
    customer_name: 'Arturo Vega',
    phone: '+15551212',
    product_title: 'Aircraft Detailing Masterclass',
  });
  assert.equal(manual.name, '#2068');
  assert.equal(manual.customer.first_name, 'Arturo');
  assert.equal(manual.line_items[0].title, 'Aircraft Detailing Masterclass');
  const db = memorySupabase();
  const result = await provisionAdminCourseOrder({ supabase: db, order: manual, email: 'arturo@example.com' });
  assert.equal(result.detailer.action, 'created');
  assert.equal(result.detailer.email, 'arturo@example.com');
  assert.equal(db.tables.detailers[0].name, 'Arturo Vega');

  assert.equal((await fetchShopifyOrder({ orderRef: '#2068', env: {} })).error, 'shopify_not_configured');
  const fetched = await fetchShopifyOrder({
    orderRef: '2068',
    env: { SHOPIFY_ACCESS_TOKEN: 'shpat_test', SHOPIFY_STORE_URL: 'shinyjets.myshopify.com' },
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.endsWith('/orders/2068.json')) return new Response('{}', { status: 404 });
      if (u.includes('name=%232068')) {
        return new Response(JSON.stringify({ orders: [{ id: 999, name: '#2068', line_items: [{ title: 'Online Aircraft Detailing Course' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 500 });
    },
  });
  assert.equal(fetched.order.id, 999);
  assert.equal(fetched.source, 'shopify');
});

check('admin route is admin-only and uses the shared provisioner', () => {
  const route = fs.readFileSync('app/api/admin/course-provision/route.js', 'utf8');
  assert.match(route, /requireAdmin\(user, supabase\)/);
  assert.match(route, /provisionAdminCourseOrder/);
  assert.match(route, /fetchShopifyOrder/);
  const webhook = fs.readFileSync('app/api/webhooks/shopify/route.js', 'utf8');
  assert.match(webhook, /shopify-webhook-handlers/);
  const handlers = fs.readFileSync('lib/shopify-webhook-handlers.js', 'utf8');
  assert.match(handlers, /notifyMissingCourseEmail/);
  assert.match(handlers, /export async function handleOrderPaid/);
  const migration = fs.readFileSync('supabase/migrations/20261009_course_missing_email_alert.sql', 'utf8');
  assert.match(migration, /webhook_logs_course_missing_email_order_uidx/);
  assert.match(migration, /course_missing_email_alerted/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n  ${e.stack || e.message}`);
  }
}
globalThis.fetch = realFetch;
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
