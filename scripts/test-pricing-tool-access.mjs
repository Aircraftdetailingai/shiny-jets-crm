/**
 * Tests for lib/pricing-tool-access.js (Pricing Tool → app_access grants).
 * Run: node scripts/test-pricing-tool-access.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// lib/*.js is loaded by Next as ESM; plain node treats .js as CJS here, so
// load the source as an ES module via a data: URL.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'lib', 'pricing-tool-access.js'), 'utf8');
const lib = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { isPricingSku, pricingPurchaseFromLineItems, computePricingGrant } = lib;

const NOW = new Date('2026-09-27T17:00:00Z');
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('SKU detection');
check('PRICING-MONTHLY is pricing', isPricingSku('PRICING-MONTHLY'));
check('lowercase pricing-quarterly is pricing', isPricingSku('pricing-quarterly'));
check('SJ-CRM-PRO is not pricing', !isPricingSku('SJ-CRM-PRO'));
check('blank sku is not pricing', !isPricingSku(''));

console.log('Line items');
check('no pricing items → null', pricingPurchaseFromLineItems([{ sku: 'SJ-CRM-PRO' }]) === null);
const m = pricingPurchaseFromLineItems([{ sku: 'PRICING-MONTHLY', quantity: 1 }, { sku: '8517748_11550' }]);
check('monthly → 30 days', m.days === 30 && m.productType === 'monthly');
const q = pricingPurchaseFromLineItems([{ sku: 'PRICING-QUARTERLY', quantity: 1 }]);
check('quarterly → 90 days', q.days === 90 && q.productType === 'quarterly');
const m2 = pricingPurchaseFromLineItems([{ sku: 'PRICING-MONTHLY', quantity: 2 }]);
check('quantity 2 monthly → 60 days', m2.days === 60);

console.log('Grants');
let g = computePricingGrant({ existing: null, email: 'a@x.com', orderId: 1, productType: 'monthly', days: 30, now: NOW });
check('new buyer → create, now+30', g.mode === 'create' && g.row.access_end === iso(NOW.getTime() + 30 * DAY) && g.row.shopify_order_id === '1');

const activeMonthly = { product_type: 'monthly', status: 'active', access_start: '2026-09-10T00:00:00Z', access_end: '2026-10-10T00:00:00Z', shopify_order_id: '9' };
g = computePricingGrant({ existing: activeMonthly, email: 'a@x.com', orderId: 2, productType: 'monthly', days: 30, now: NOW });
check('renewal stacks on current end (10/10 + 30)', g.mode === 'renew' && g.row.access_end === iso(Date.parse('2026-10-10T00:00:00Z') + 30 * DAY));
check('renewal keeps original access_start', g.row.access_start === activeMonthly.access_start);

const lapsed = { ...activeMonthly, access_end: '2026-09-01T00:00:00Z' };
g = computePricingGrant({ existing: lapsed, email: 'a@x.com', orderId: 3, productType: 'monthly', days: 30, now: NOW });
check('lapsed → reactivate from now', g.mode === 'reactivate' && g.row.access_end === iso(NOW.getTime() + 30 * DAY) && g.row.access_start === NOW.toISOString());

const crmFree = { product_type: 'crm_free', status: 'active', access_start: '2026-09-04T00:00:00Z', access_end: '2026-10-05T00:00:00Z', shopify_order_id: '6694971080889' };
g = computePricingGrant({ existing: crmFree, email: 'a@x.com', orderId: 4, productType: 'monthly', days: 30, now: NOW });
check('active crm_free keeps product_type', g.mode === 'extend_preserve_type' && g.row.product_type === 'crm_free');
check('active crm_free keeps shopify_order_id', g.row.shopify_order_id === '6694971080889');
check('active crm_free end extended (10/5 + 30)', g.row.access_end === iso(Date.parse('2026-10-05T00:00:00Z') + 30 * DAY));

const course = { product_type: 'masterclass_annual', status: 'active', access_start: '2026-03-01T00:00:00Z', access_end: '2027-03-01T00:00:00Z', shopify_order_id: '77' };
g = computePricingGrant({ existing: course, email: 'a@x.com', orderId: 5, productType: 'quarterly', days: 90, now: NOW });
check('active course row keeps masterclass_annual', g.row.product_type === 'masterclass_annual' && g.row.access_end === iso(Date.parse('2027-03-01T00:00:00Z') + 90 * DAY));

const crmProLapsed = { product_type: 'crm_pro', status: 'active', access_start: '2026-08-10T00:00:00Z', access_end: '2026-09-10T00:00:00Z', shopify_order_id: '66' };
g = computePricingGrant({ existing: crmProLapsed, email: 'a@x.com', orderId: 6, productType: 'quarterly', days: 90, now: NOW });
check('lapsed crm_pro row is taken over as quarterly', g.mode === 'reactivate' && g.row.product_type === 'quarterly' && g.row.shopify_order_id === '6');

const expiredStatusFutureEnd = { product_type: 'monthly', status: 'expired', access_start: '2026-09-01T00:00:00Z', access_end: '2026-10-01T00:00:00Z' };
g = computePricingGrant({ existing: expiredStatusFutureEnd, email: 'a@x.com', orderId: 7, productType: 'monthly', days: 30, now: NOW });
check('never shortens: stacks on future end even if status expired', g.row.access_end === iso(Date.parse('2026-10-01T00:00:00Z') + 30 * DAY) && g.row.status === 'active');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
