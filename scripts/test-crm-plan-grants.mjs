/**
 * Shopify webhook plan logic (lib/crm-plan-grants.js):
 * SKU mapping, legacy SKUs, price fallback, quarterly → Lite, stacking,
 * never-downgrade, Business → Pricing Tool access, cancellation / billing
 * isolation, HTML escaping.
 * Run: npm test
 */
import {
  resolveCrmLineItem, crmPurchaseFromLineItems, quarterlyLiteDaysFromLineItems, computeCrmPlanGrant,
  computeBusinessPricingAccess, subscriptionItems, classifySubscriptionItems, decideCancellation,
  billingAffectsCrm, escapeHtml, planIsActive, DAY_MS,
} from '../lib/crm-plan-grants.js';
import { pricingPurchaseFromLineItems, pricingToolAccessEmail } from '../lib/pricing-tool-access.js';

const NOW = new Date('2026-09-27T17:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const inDays = (d) => iso(NOW.getTime() + d * DAY_MS);
const daysFromNow = (v) => Math.round((new Date(v).getTime() - NOW.getTime()) / DAY_MS);
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}
const r = (item) => resolveCrmLineItem(item);

console.log('SKU mapping (new)');
check('SJ-CRM-FREE → free', r({ sku: 'SJ-CRM-FREE', price: '0.00' })?.plan === 'free');
check('SJ-CRM-LITE → lite 30d', r({ sku: 'SJ-CRM-LITE', price: '39.95' })?.plan === 'lite' && r({ sku: 'SJ-CRM-LITE' }).days === 30);
check('SJ-CRM-BUSINESS → business 30d', r({ sku: 'SJ-CRM-BUSINESS', price: '89.95' })?.plan === 'business' && r({ sku: 'SJ-CRM-BUSINESS' }).days === 30);
check('SJ-CRM-BUSINESS-YEARLY → business 365d', r({ sku: 'SJ-CRM-BUSINESS-YEARLY', price: '899' })?.days === 365);
check('lowercase sku accepted', r({ sku: 'sj-crm-lite' })?.plan === 'lite');
check('partial SJ-CRM-BUSINESS-ANNUAL → 365d', r({ sku: 'SJ-CRM-BUSINESS-ANNUAL' })?.days === 365);

console.log('SKU mapping (legacy)');
check('SJ-CRM-PRO → lite', r({ sku: 'SJ-CRM-PRO', price: '79.00' })?.plan === 'lite');
check('SJ-CRM-ENTERPRISE → business', r({ sku: 'SJ-CRM-ENTERPRISE', price: '299.00' })?.plan === 'business');
check('SJ-CRM-ENTERPRISE at $899 → 365d', r({ sku: 'SJ-CRM-ENTERPRISE', price: '899.00' })?.days === 365);

console.log('Title + price fallback');
check('title "Shiny Jets CRM — Lite" → lite', r({ title: 'Shiny Jets CRM — Lite', price: '39.95' })?.plan === 'lite');
check('title "Shiny Jets CRM Pro" → lite', r({ title: 'Shiny Jets CRM Pro' })?.plan === 'lite');
check('title Business (Annual) → 365d', r({ title: 'Shiny Jets CRM — Business (Annual)' })?.days === 365);
check('no SKU, $39.95 → lite', r({ title: 'Subscription', price: '39.95' })?.plan === 'lite');
check('no SKU, $89.95 → business', r({ title: 'Subscription', price: '89.95' })?.plan === 'business');
check('no SKU, $899 → business 365d', r({ title: 'Subscription', price: '899.00' })?.days === 365);
check('old $850–950 range guessing removed ($900 → null)', r({ title: 'Subscription', price: '900.00' }) === null);
check('old $70–90 range guessing removed ($79.95 → null)', r({ title: 'Something', price: '79.95' }) === null);
check('non-CRM SKU with CRM price is ignored', r({ sku: 'TSHIRT-L', title: 'T-Shirt', price: '39.95' }) === null);
check('"Product Pro Kit" (no "crm") is not a plan', r({ sku: 'KIT-1', title: 'Product Pro Kit', price: '12' }) === null);
check('Pricing Tool SKUs never read as CRM', r({ sku: 'PRICING-QUARTERLY', title: 'Pricing Tool CRM', price: '89.95' }) === null);

console.log('Order aggregation');
const o1 = crmPurchaseFromLineItems([{ sku: 'SJ-CRM-LITE', quantity: 3 }]);
check('quantity 3 Lite → 90 days', o1?.plan === 'lite' && o1.days === 90);
const o2 = crmPurchaseFromLineItems([{ sku: 'SJ-CRM-LITE' }, { sku: 'SJ-CRM-BUSINESS' }]);
check('highest plan wins', o2?.plan === 'business' && o2.days === 30);
check('no CRM items → null', crmPurchaseFromLineItems([{ sku: 'PRICING-MONTHLY' }]) === null);

console.log('Quarterly Pricing → Lite');
check('PRICING-QUARTERLY ×1 → 90 Lite days', quarterlyLiteDaysFromLineItems([{ sku: 'PRICING-QUARTERLY', quantity: 1 }]) === 90);
check('PRICING-QUARTERLY ×2 → 180 Lite days', quarterlyLiteDaysFromLineItems([{ sku: 'PRICING-QUARTERLY', quantity: 2 }]) === 180);
check('PRICING-MONTHLY does NOT grant Lite', quarterlyLiteDaysFromLineItems([{ sku: 'PRICING-MONTHLY', quantity: 1 }]) === 0);
check('quarterly still grants Pricing Tool 90d', pricingPurchaseFromLineItems([{ sku: 'PRICING-QUARTERLY' }])?.days === 90);

console.log('Plan grants (stacking / never downgrade)');
let g = computeCrmPlanGrant({ detailer: { plan: 'free' }, plan: 'lite', days: 90, now: NOW });
check('free → Lite 90d', g.mode === 'grant' && g.update.plan === 'lite' && daysFromNow(g.update.plan_expires_at) === 90);
g = computeCrmPlanGrant({ detailer: { plan: 'lite', plan_expires_at: inDays(20) }, plan: 'lite', days: 90, now: NOW });
check('Lite with 20d left + quarterly → stacks to 110d', g.mode === 'stack' && daysFromNow(g.update.plan_expires_at) === 110);
g = computeCrmPlanGrant({ detailer: { plan: 'pro', plan_expires_at: inDays(5) }, plan: 'lite', days: 30, now: NOW });
check('legacy pro counts as Lite for stacking', g.mode === 'stack' && daysFromNow(g.update.plan_expires_at) === 35);
g = computeCrmPlanGrant({ detailer: { plan: 'business', plan_expires_at: inDays(100) }, plan: 'lite', days: 90, now: NOW });
check('active Business + quarterly → no downgrade', g.mode === 'skip_higher_plan' && g.update === null);
g = computeCrmPlanGrant({ detailer: { plan: 'enterprise', plan_expires_at: null, subscription_source: 'comp_invite' }, plan: 'lite', days: 90, now: NOW });
check('open-ended enterprise comp + quarterly → no downgrade', g.mode === 'skip_higher_plan');
g = computeCrmPlanGrant({ detailer: { plan: 'business', plan_expires_at: inDays(-3) }, plan: 'lite', days: 90, now: NOW });
check('expired Business + quarterly → Lite 90d', g.update?.plan === 'lite' && daysFromNow(g.update.plan_expires_at) === 90);
g = computeCrmPlanGrant({ detailer: { plan: 'lite', plan_expires_at: inDays(10) }, plan: 'business', days: 30, now: NOW });
check('Lite → Business upgrade', g.mode === 'upgrade' && g.update.plan === 'business' && daysFromNow(g.update.plan_expires_at) === 30);
g = computeCrmPlanGrant({ detailer: { plan: 'business', plan_expires_at: inDays(200) }, plan: 'business', days: 365, now: NOW });
check('Business yearly renewal stacks', g.mode === 'stack' && daysFromNow(g.update.plan_expires_at) === 565);
g = computeCrmPlanGrant({ detailer: { plan: 'business', plan_expires_at: null, subscription_source: 'course_bundle' }, plan: 'business', days: 30, now: NOW });
check('open-ended course comp kept open-ended', g.mode === 'keep_open_ended_comp' && g.update === null);
g = computeCrmPlanGrant({ detailer: { plan: 'pro', plan_expires_at: null, subscription_source: 'shopify' }, plan: 'lite', days: 30, now: NOW });
check('legacy open-ended paid sub starts dated term on renewal', g.mode === 'renew_start_dated' && daysFromNow(g.update.plan_expires_at) === 30);
g = computeCrmPlanGrant({ detailer: { plan: 'lite', plan_expires_at: inDays(40) }, plan: 'free', days: 0, now: NOW });
check('Free SKU never downgrades', g.mode === 'noop' && g.update === null);
check('planIsActive: cancelled but paid-through stays active', planIsActive({ plan: 'lite', subscription_status: 'cancelled', plan_expires_at: inDays(3) }, NOW));

console.log('Business → Pricing Tool access (app_access)');
let a = computeBusinessPricingAccess({ existing: null, email: 'x@y.com', orderId: 7, accessEnd: inDays(30), now: NOW });
check('no row → create crm_business active row', a.mode === 'create' && a.row.product_type === 'crm_business' && a.row.status === 'active' && daysFromNow(a.row.access_end) === 30);
a = computeBusinessPricingAccess({ existing: { status: 'active', product_type: 'quarterly', access_end: inDays(80), shopify_order_id: '5' }, email: 'x@y.com', orderId: 7, accessEnd: inDays(30), now: NOW });
check('longer existing row is not clobbered', a.mode === 'keep_longer' && a.row === null);
a = computeBusinessPricingAccess({ existing: { status: 'active', product_type: 'monthly', access_end: inDays(10), shopify_order_id: '5' }, email: 'x@y.com', orderId: 7, accessEnd: inDays(365), now: NOW });
check('shorter active row extended, type + order preserved', a.mode === 'extend_preserve_type' && a.row.product_type === 'monthly' && a.row.shopify_order_id === '5' && daysFromNow(a.row.access_end) === 365);
a = computeBusinessPricingAccess({ existing: { status: 'expired', product_type: 'monthly', access_end: inDays(-10) }, email: 'x@y.com', orderId: 7, accessEnd: inDays(30), now: NOW });
check('expired row reactivated as crm_business', a.mode === 'reactivate' && a.row.product_type === 'crm_business' && a.row.status === 'active');

console.log('Cancellation isolation');
const pricingOnly = classifySubscriptionItems(subscriptionItems({ line_items: [{ sku: 'PRICING-QUARTERLY', title: 'Pricing Tool' }] }));
const crmLite = classifySubscriptionItems(subscriptionItems({ lines: { edges: [{ node: { sku: 'SJ-CRM-LITE', title: 'Shiny Jets CRM — Lite' } }] } }));
const unknown = classifySubscriptionItems([]);
const liteUser = { plan: 'lite', plan_expires_at: inDays(12), subscription_source: 'shopify' };
check('Pricing Tool cancel never touches CRM plan', decideCancellation({ detailer: liteUser, classification: pricingOnly, hasActivePricingRow: true, now: NOW }) === 'ignore_pricing_only');
check('unknown product + active Pricing sub → leave CRM alone', decideCancellation({ detailer: liteUser, classification: unknown, hasActivePricingRow: true, now: NOW }) === 'ignore_unresolved');
check('CRM Lite cancel with paid time → keep until expiry', decideCancellation({ detailer: liteUser, classification: crmLite, hasActivePricingRow: false, now: NOW }) === 'keep_until_expiry');
check('CRM cancel, open-ended legacy sub → downgrade now', decideCancellation({ detailer: { plan: 'pro', plan_expires_at: null }, classification: crmLite, hasActivePricingRow: false, now: NOW }) === 'downgrade_now');
check('cancelling Lite while on Business → ignored', decideCancellation({ detailer: { plan: 'business', plan_expires_at: inDays(30) }, classification: crmLite, hasActivePricingRow: false, now: NOW }) === 'ignore_higher_plan');
check('comped account ignored', decideCancellation({ detailer: { plan: 'enterprise', subscription_source: 'course_bundle' }, classification: crmLite, hasActivePricingRow: false, now: NOW }) === 'ignore_comped');
check('billing failure on Pricing sub does not affect CRM', billingAffectsCrm({ classification: pricingOnly, hasActivePricingRow: true }) === false);
check('billing failure on CRM sub affects CRM', billingAffectsCrm({ classification: crmLite, hasActivePricingRow: true }) === true);
check('unknown billing event + active Pricing sub → skip CRM', billingAffectsCrm({ classification: unknown, hasActivePricingRow: true }) === false);

console.log('HTML escaping');
check('escapeHtml', escapeHtml('<b>"Tom" & \'Jerry\'</b>') === '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
const mail = pricingToolAccessEmail({ email: 'a@b.com', firstName: '<script>alert(1)</script>', accessEnd: inDays(90), productType: 'quarterly', includesCrmLite: true });
const mailHtml = typeof mail === 'string' ? mail : mail.html;
check('buyer name escaped in Pricing email', !mailHtml.includes('<script>') && mailHtml.includes('&lt;script&gt;'));
check('quarterly email mentions CRM Lite', /Lite/.test(mailHtml));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
