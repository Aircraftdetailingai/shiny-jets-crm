/**
 * Paid "Ask a Shiny Jets expert" button (Brett, Oct 3 2026): $4.99 = ONE question.
 * AI-initiated escalations stay free. Usage:
 *   node --import ./scripts/test-support/register.mjs scripts/test-ask-expert-payment.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import {
  ASK_EXPERT_PRICE, ASK_EXPERT_PRICE_LABEL, ASK_EXPERT_ONE_QUESTION, ASK_EXPERT_FOLLOW_UP, PAYMENT_TTL_MS,
  askExpertVariantId, isAskExpertEnabled, askExpertConfig, buildCheckoutUrl, askExpertFromOrder,
  canMarkPaid, isPaymentExpired, paymentExpiry, storeUrl, askExpertPointerText,
} from '../lib/ask-expert-payment.js';
import { TUTORIAL_SLIDES } from '../lib/detailing-ai-tutorial.js';
import { ESCALATION_PROMPT, brettEmail, pollItem } from '../lib/ask-brett.js';

const tests = [];
const check = (name, fn) => tests.push([name, fn]);
const ID = '5f0c7a3e-1b2c-4d5e-8f90-123456789abc';
const VAR = '44112233445566';
const read = (f) => fs.readFileSync(f, 'utf8');

check('price + copy: $4.99 buys one question; follow-up needs a new payment', () => {
  assert.equal(ASK_EXPERT_PRICE, '4.99');
  assert.equal(ASK_EXPERT_PRICE_LABEL, '$4.99');
  assert.equal(ASK_EXPERT_ONE_QUESTION, '$4.99 for one question answered by a Shiny Jets expert');
  assert.match(ASK_EXPERT_FOLLOW_UP, /follow-up question needs a new payment/);
  assert.equal(PAYMENT_TTL_MS, 24 * 3600 * 1000);
});

check('ASK_EXPERT_VARIANT_ID: unset / junk = Coming soon; numeric or gid = enabled', () => {
  for (const v of [undefined, '', 'TODO', '12ab', '123']) {
    assert.equal(askExpertVariantId({ ASK_EXPERT_VARIANT_ID: v }), null, String(v));
    assert.equal(isAskExpertEnabled({ ASK_EXPERT_VARIANT_ID: v }), false);
  }
  assert.equal(askExpertVariantId({ ASK_EXPERT_VARIANT_ID: ` ${VAR} ` }), VAR);
  assert.equal(askExpertVariantId({ ASK_EXPERT_VARIANT_ID: `gid://shopify/ProductVariant/${VAR}` }), VAR);
  assert.deepEqual(askExpertConfig({}), { enabled: false, price: '4.99', price_label: '$4.99', status: 'coming_soon' });
  assert.equal(askExpertConfig({ ASK_EXPERT_VARIANT_ID: VAR }).status, 'available');
});

check('checkout: shinyjets.com cart permalink with the id as cart attribute AND line-item property', () => {
  const url = buildCheckoutUrl({ variantId: VAR, escalationId: ID, email: 'ana@acme.example', returnUrl: 'https://crm.shinyjets.com/detailing-ai?c=x', store: storeUrl({}) });
  const u = new URL(url);
  assert.equal(u.origin, 'https://shinyjets.com');
  assert.equal(u.pathname, `/cart/${VAR}:1`);
  assert.equal(u.searchParams.get('attributes[ask_expert_id]'), ID);
  assert.equal(u.searchParams.get('properties[ask_expert_id]'), ID);
  assert.equal(u.searchParams.get('attributes[ask_expert_return]'), 'https://crm.shinyjets.com/detailing-ai?c=x');
  assert.equal(u.searchParams.get('checkout[email]'), 'ana@acme.example');
  assert.equal(buildCheckoutUrl({ variantId: VAR, escalationId: 'not-a-uuid' }), null);
  assert.equal(buildCheckoutUrl({ variantId: 'abc', escalationId: ID }), null);
  assert.equal(storeUrl({ ASK_EXPERT_STORE_URL: 'javascript:alert(1)' }), 'https://shinyjets.com');
});

const order = (over = {}) => ({ id: 9001, name: '#1042', financial_status: 'paid', line_items: [{ variant_id: Number(VAR), quantity: 1, properties: [{ name: 'ask_expert_id', value: ID }] }], note_attributes: [], ...over });
check('orders/paid: finds the ONE escalation from the line-item property or the cart attribute', () => {
  assert.deepEqual(askExpertFromOrder(order(), VAR), { orderId: '9001', orderName: '#1042', escalationId: ID, error: null });
  const viaAttr = order({ line_items: [{ variant_id: VAR, properties: [] }], note_attributes: [{ name: 'ask_expert_id', value: ID.toUpperCase() }] });
  assert.equal(askExpertFromOrder(viaAttr, VAR).escalationId, ID);
  assert.equal(askExpertFromOrder(order({ line_items: [{ variant_id: 1234567, properties: [{ name: 'ask_expert_id', value: ID }] }] }), VAR), null, 'other products are ignored');
  assert.equal(askExpertFromOrder(order({ line_items: [{ variant_id: VAR, properties: [] }] }), VAR).error, 'no_escalation_id');
  assert.match(askExpertFromOrder(order({ financial_status: 'pending' }), VAR).error, /financial_status_pending/);
  assert.equal(askExpertFromOrder(order(), null), null);
});

check('status rules: only awaiting_payment (or a late-paid expired one) opens; 24 h expiry', () => {
  assert.ok(canMarkPaid('awaiting_payment') && canMarkPaid('expired'));
  assert.ok(!canMarkPaid('open') && !canMarkPaid('answered'));
  const now = Date.parse('2026-10-04T05:00:00Z');
  assert.equal(paymentExpiry(now), '2026-10-05T05:00:00.000Z');
  assert.ok(isPaymentExpired({ status: 'awaiting_payment', payment_expires_at: '2026-10-04T04:59:59Z' }, now));
  assert.ok(!isPaymentExpired({ status: 'awaiting_payment', payment_expires_at: '2026-10-04T05:00:01Z' }, now));
  assert.ok(!isPaymentExpired({ status: 'open', payment_expires_at: '2026-10-01T00:00:00Z' }, now));
});

check('ask-expert API: Coming soon without the variant; saves awaiting_payment; never notifies Brett', () => {
  const src = read('app/api/detailing-ai/ask-expert/route.js');
  assert.match(src, /if \(!variantId\) return Response\.json\(\{[^}]*code: 'COMING_SOON'/);
  assert.match(src, /status: STATUS_AWAITING_PAYMENT,\s*payment_expires_at: paymentExpiry\(\)/);
  assert.match(src, /reason: 'user_asked'/);
  assert.ok(!/notifyBrett/.test(src), 'no Brett notification before payment');
  assert.match(src, /checkout_url: checkoutUrl/);
  assert.ok(src.indexOf('COMING_SOON') < src.indexOf('.insert('), 'nothing saved while Coming soon');
});

check('AI-initiated escalations stay FREE: created open and Brett is notified right away', () => {
  const src = read('app/api/detailing-ai/escalations/route.js');
  assert.match(src, /status: 'open',/);
  assert.match(src, /await notifyBrett\(/);
  assert.match(src, /if \(t\.reason === 'user_asked'\) return Response\.json\([^\n]*code: 'PAID_QUESTION'/);
  const chat = read('app/api/detailing-ai/chat/route.js');
  assert.match(chat, /esc\.escalate && esc\.escalate\.reason === 'user_asked'/);
  assert.match(chat, /signEscalationTicket\(/, 'AI escalations still get a free ticket');
  assert.match(chat, /code: 'ASK_EXPERT_PAID'/);
  assert.ok(!/askExpertRawReply/.test(chat));
  assert.ok(!/or the detailer asks for a person/.test(ESCALATION_PROMPT));
  assert.match(ESCALATION_PROMPT, /These escalations are free/);
  assert.match(ESCALATION_PROMPT, /\$4\.99 for one question answered by a Shiny Jets expert/);
  assert.match(askExpertPointerText(true), /\$4\.99 for one question answered by a Shiny Jets expert/);
  assert.match(askExpertPointerText(false), /coming soon/i);
});

check('Shopify webhook: HMAC first, orders/paid opens the paid question and only then notifies', () => {
  const src = read('app/api/webhooks/shopify/route.js');
  const post = src.slice(src.indexOf('export async function POST'));
  assert.ok(post.indexOf('verifyHmac(rawBody, signature, secret)') < post.indexOf('switch (topic)'));
  assert.match(src, /async function handleOrderPaid\(supabase, payload\) \{\s*\/\/ Paid expert question[^\n]*\n\s*try \{\s*await handleAskExpertPaid\(supabase, payload\);/);
  const server = read('lib/ask-brett-server.js');
  const fn = server.slice(server.indexOf('export async function markEscalationPaid'), server.indexOf('export async function expireUnpaid'));
  assert.ok(fn.indexOf("status: 'open'") < fn.indexOf('notifyBrett('), 'open first, notify after');
  assert.match(fn, /already_applied/);
  assert.match(fn, /order_already_used/);
  assert.match(fn, /\.in\('status', \['awaiting_payment', 'expired'\]\)/);
});

check('unpaid expire after 24 h (cron + per-account sweep), photos removed, never notifies', () => {
  const server = read('lib/ask-brett-server.js');
  const fn = server.slice(server.indexOf('export async function expireUnpaid'));
  assert.match(fn, /\.eq\('status', 'awaiting_payment'\)\s*\.lt\('payment_expires_at'/);
  assert.match(fn, /status: 'expired', photo_paths: \[\]/);
  assert.ok(!/notify/i.test(fn.slice(0, fn.indexOf('/** Unpaid button question'))));
  assert.match(read('app/api/cron/ask-brett-retention/route.js'), /expireUnpaid\(supabase/);
});

check('admin queue + poll only ever show open questions (unpaid never reach Brett)', () => {
  assert.match(read('app/api/admin/ask-brett/open/route.js'), /\.eq\('status', 'open'\)/);
  assert.match(read('app/api/admin/ask-brett/route.js'), /=== 'answered' \? 'answered' : 'open'/);
});

check('migration: statuses, payment columns, one order = one question', () => {
  const sql = read('supabase/migrations/20261007_ask_expert_paid.sql');
  assert.match(sql, /CHECK \(status IN \('awaiting_payment', 'open', 'answered', 'expired'\)\)/);
  for (const c of ['payment_expires_at', 'paid_at', 'shopify_order_id', 'shopify_order_name']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`));
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS detailing_ai_escalations_shopify_order_uidx/);
});

check('UI: price on the button, confirm step before redirect, Coming soon, free vs paid wording', () => {
  const page = read('app/detailing-ai/page.jsx');
  assert.match(page, /\{ASK_EXPERT_LABEL\} · \{ASK_EXPERT_PRICE_LABEL\}/);
  assert.match(page, /\{ASK_EXPERT_LABEL\} · Coming soon/);
  assert.match(page, /role="dialog"\s*aria-modal="true"\s*aria-labelledby="ask-expert-title"/);
  assert.match(page, /for one question answered by a Shiny Jets expert\./);
  assert.match(page, /\{ASK_EXPERT_FOLLOW_UP\}/);
  assert.match(page, /Continue to checkout · \$\{ASK_EXPERT_PRICE_LABEL\}/);
  assert.ok(page.indexOf('const openExpertConfirm') < page.indexOf('window.location.assign(data.checkout_url)'));
  assert.match(page, /Waiting for payment · \$\{ASK_EXPERT_PRICE_LABEL\}/);
  assert.ok(!/ask_expert: true/.test(page), 'no free ask_expert chat call');
  const stuck = TUTORIAL_SLIDES.find((x) => x.id === 'stuck');
  assert.match(stuck.lead, /\$4\.99 for one question answered by a Shiny Jets expert/);
  assert.ok(stuck.points.some((p) => /for free/.test(p)));
});

check("Brett's email says paid vs free; poll item carries paid", () => {
  const paid = brettEmail({ escalation: { id: ID, reason: 'user_asked', question: 'q', paid: true, shopify_order_name: '#1042' }, account: { email: 'a@b.c' }, appUrl: 'https://x' });
  assert.match(paid.html, /Paid question<\/strong> \(\$4\.99, one question, Shopify order #1042\)/);
  const free = brettEmail({ escalation: { id: ID, reason: 'white_paint', question: 'q' }, account: {}, appUrl: 'https://x' });
  assert.match(free.text, /\[free AI escalation\]/);
  assert.equal(pollItem({ id: ID, shopify_order_id: '9001' }, null, 'https://x').paid, true);
  assert.equal(pollItem({ id: ID }, null, 'https://x').paid, false);
});

let failed = 0;
for (const [n, f] of tests) { try { await f(); console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n  ${e.message}`); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
