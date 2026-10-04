/**
 * Standalone Detailing AI (Shopify "Aircraft Detailing AI") → ai_access_until.
 * Run: node scripts/test-detailing-ai-access.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isAiSku, isAiLineItem, aiPurchaseFromLineItems, aiTermForLineItem, computeAiAccessUntil, hasStandaloneAi } from '../lib/detailing-ai-access.js';
import { resolveCrmLineItem, crmPurchaseFromLineItems, classifySubscriptionItems, decideCancellation, billingAffectsCrm } from '../lib/crm-plan-grants.js';
import { pricingPurchaseFromLineItems } from '../lib/pricing-tool-access.js';
import { requireFeature } from '../lib/plan-gate.js';

const NOW = new Date('2026-10-03T17:00:00Z');
const DAY = 86400000;
const days = (v) => Math.round((new Date(v).getTime() - NOW.getTime()) / DAY);
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('SKU / line item detection');
check('SJ-AI-STANDALONE is AI', isAiSku('SJ-AI-STANDALONE'));
check('lowercase sj-ai-standalone-yearly is AI', isAiSku('sj-ai-standalone-yearly'));
check('SJ-CRM-BUSINESS is not AI', !isAiSku('SJ-CRM-BUSINESS'));
check('no-SKU "Aircraft Detailing AI" title is AI', isAiLineItem({ title: 'Aircraft Detailing AI', price: '59.95' }));
check('CRM title mentioning Detailing AI is not AI', !isAiLineItem({ title: 'Shiny Jets CRM — Business (Detailing AI included)' }));
check('Pricing Tool is not AI', !isAiLineItem({ sku: 'PRICING-MONTHLY', title: 'Aircraft Pricing Tool' }));

console.log('Days');
check('monthly → 30', aiPurchaseFromLineItems([{ sku: 'SJ-AI-STANDALONE', quantity: 1 }]).days === 30);
check('yearly → 365', aiPurchaseFromLineItems([{ sku: 'SJ-AI-STANDALONE-YEARLY' }]).days === 365);
check('qty 2 monthly → 60', aiPurchaseFromLineItems([{ sku: 'SJ-AI-STANDALONE', quantity: 2 }]).days === 60);
check('partial SJ-AI-STANDALONE-ANNUAL → 365', aiPurchaseFromLineItems([{ sku: 'SJ-AI-STANDALONE-ANNUAL' }]).days === 365);
check('no-SKU annual variant title → 365', aiPurchaseFromLineItems([{ title: 'Aircraft Detailing AI', variant_title: 'Annual' }]).days === 365);
check('CRM-only order → null', aiPurchaseFromLineItems([{ sku: 'SJ-CRM-BUSINESS' }]) === null);

console.log('Live product, no SKUs: variant ID first');
const MONTHLY = 67640132174009, YEARLY = 67640132206777, PRODUCT = 15410802557113;
const live = (extra) => ({ product_id: PRODUCT, title: 'Aircraft Detailing AI', sku: null, quantity: 1, ...extra });
check('monthly variant, no SKU → 30', aiPurchaseFromLineItems([live({ variant_id: MONTHLY, price: '59.95' })]).days === 30);
check('yearly variant, no SKU → 365', aiPurchaseFromLineItems([live({ variant_id: YEARLY, price: '599.00' })]).days === 365);
check('variant id as string works', aiPurchaseFromLineItems([{ variant_id: String(YEARLY), sku: '' }]).days === 365);
check('variant GID works', aiPurchaseFromLineItems([{ variant_id: `gid://shopify/ProductVariant/${YEARLY}` }]).days === 365);
check('variant id alone (odd title, empty SKU) is AI', isAiLineItem({ variant_id: MONTHLY, title: 'Something', sku: '' }));
check('variant id wins even with an unrelated SKU set', aiPurchaseFromLineItems([{ variant_id: YEARLY, sku: 'XYZ-1' }]).days === 365);
check('yearly variant + monthly-looking title still 365', aiPurchaseFromLineItems([live({ variant_id: YEARLY, variant_title: 'Monthly', price: '59.95' })]).days === 365);
check('yearly variant matched_by variant_id', aiPurchaseFromLineItems([live({ variant_id: YEARLY })]).sources[0] === 'variant_id');
check('variant id recorded for the grant log', aiPurchaseFromLineItems([live({ variant_id: MONTHLY })]).variants[0] === String(MONTHLY));
check('product id alone (unknown variant) is AI', isAiLineItem({ product_id: PRODUCT, title: 'X', sku: '' }));
check('SKU still honored when present (yearly)', aiPurchaseFromLineItems([{ sku: 'SJ-AI-STANDALONE-YEARLY', title: 'Aircraft Detailing AI' }]).days === 365);

console.log('Fallbacks when the variant ID is unknown (new/changed variant)');
check('Seal yearly selling plan id → 365', aiPurchaseFromLineItems([live({ variant_id: 1, selling_plan_allocation: { selling_plan: { id: 5903876281, name: 'Monthly' } } })]).days === 365);
check('Seal monthly selling plan id → 30', aiPurchaseFromLineItems([live({ variant_id: 1, selling_plan_allocation: { selling_plan: { id: 5903843513, name: 'x' } } })]).days === 30);
check('selling plan name "Yearly subscription" → 365', aiPurchaseFromLineItems([live({ variant_id: 1, selling_plan_allocation: { selling_plan: { id: 9, name: 'Yearly subscription' } } })]).days === 365);
check('selling plan name "Deliver every 12 months" → 365', aiPurchaseFromLineItems([live({ variant_id: 1, selling_plan_allocation: { selling_plan: { id: 9, name: 'Deliver every 12 months' } } })]).days === 365);
check('selling plan name "Monthly subscription" → 30', aiPurchaseFromLineItems([live({ variant_id: 1, selling_plan_allocation: { selling_plan: { id: 9, name: 'Monthly subscription' } } })]).days === 30);
check('variant title "Annual" → 365', aiPurchaseFromLineItems([live({ variant_id: 1, variant_title: 'Annual' })]).days === 365);
check('variant title "Yearly - $599/yr" → 365', aiPurchaseFromLineItems([live({ variant_id: 1, variant_title: 'Yearly - $599/yr' })]).days === 365);
check('variant title "Monthly" → 30', aiPurchaseFromLineItems([live({ variant_id: 1, variant_title: 'Monthly' })]).days === 30);
check('name "Aircraft Detailing AI - Yearly" → 365', aiPurchaseFromLineItems([{ title: 'Aircraft Detailing AI', name: 'Aircraft Detailing AI - Yearly' }]).days === 365);
check('Seal property "Subscription: Every 1 year" → 365', aiPurchaseFromLineItems([live({ variant_id: 1, properties: [{ name: 'Subscription', value: 'Every 1 year' }] })]).days === 365);
check('no term text, $599 price → 365 (never 30)', aiPurchaseFromLineItems([live({ variant_id: 1, price: '599.00' })]).days === 365);
check('no term text, $59.95 price → 30', aiPurchaseFromLineItems([live({ variant_id: 1, price: '59.95' })]).days === 30);
check('terms line properties do not read as a term', aiPurchaseFromLineItems([live({ variant_id: 1, price: '59.95', properties: [{ name: 'Terms version', value: '2026-10-03' }, { name: 'Terms accepted', value: 'Yes' }] })]).days === 30);
check('no-SKU AI item without any signal defaults to 30, labeled default', aiTermForLineItem({ title: 'Aircraft Detailing AI' }).source === 'default');

console.log('Yearly can never come out as 30 days');
const yearlyShapes = [
  live({ variant_id: YEARLY }),
  live({ variant_id: YEARLY, variant_title: 'Monthly', price: '59.95' }),
  live({ variant_id: MONTHLY, selling_plan_allocation: { selling_plan: { id: 5903876281 } } }),
  live({ variant_id: 1, selling_plan_allocation: { selling_plan: { id: 5903876281 } } }),
  live({ variant_id: 1, variant_title: 'Yearly' }),
  live({ variant_id: 1, selling_plan_allocation: { selling_plan: { name: 'Annual plan' } } }),
  live({ variant_id: 1, price: '599.00' }),
  { sku: 'SJ-AI-STANDALONE-YEARLY' },
];
check(`all ${yearlyShapes.length} yearly shapes → 365`, yearlyShapes.every((it) => aiPurchaseFromLineItems([it]).days === 365),
  JSON.stringify(yearlyShapes.map((it) => aiPurchaseFromLineItems([it]).days)));

console.log('Seal renewal orders (recurring orders/paid) extend access');
const firstOrder = { id: 1001, line_items: [live({ variant_id: MONTHLY, price: '59.95' })] };
const renewalOrder = { id: 1002, tags: 'Seal Subscriptions, Recurring order', source_name: 'subscription_contract', line_items: [live({ variant_id: MONTHLY, price: '59.95', properties: [] })] };
const yearlyRenewal = { id: 2002, tags: 'Seal Subscriptions', line_items: [{ variant_id: YEARLY, product_id: PRODUCT, title: 'Aircraft Detailing AI', price: '599.00', quantity: 1 }] };
const afterFirst = computeAiAccessUntil({ current: null, days: aiPurchaseFromLineItems(firstOrder.line_items).days, now: NOW });
const afterRenewal = computeAiAccessUntil({ current: afterFirst, days: aiPurchaseFromLineItems(renewalOrder.line_items).days, now: new Date(NOW.getTime() + 29 * DAY) });
check('first monthly order → +30d', days(afterFirst) === 30);
check('monthly renewal (new order id) stacks → +60d from first order', days(afterRenewal) === 60);
check('yearly renewal → +365d onto remaining time', days(computeAiAccessUntil({ current: new Date(NOW.getTime() + 3 * DAY).toISOString(), days: aiPurchaseFromLineItems(yearlyRenewal.line_items).days, now: NOW })) === 368);

console.log('Webhook wiring (source)');
const hook = readFileSync(new URL('../app/api/webhooks/shopify/route.js', import.meta.url), 'utf8');
const fwd = readFileSync(new URL('../app/api/shopify/webhook/route.js', import.meta.url), 'utf8');
const orderPaidBody = hook.slice(hook.indexOf('async function handleOrderPaid'), hook.indexOf('async function handleSubscriptionUpdate'));
check('handleOrderPaid calls handleDetailingAiAccess (isolated in try/catch)', /try \{\s*await handleDetailingAiAccess\(supabase, payload\);/.test(orderPaidBody));
const switchBody = hook.slice(hook.indexOf("case 'orders/paid':"), hook.indexOf("case 'subscription_contracts/update':"));
check("orders/paid: full mode → handleOrderPaid, else ask-expert only (#52 split kept)", /orderPaidMode\(request\.url\) === 'full'[\s\S]*handleOrderPaid[\s\S]*else[\s\S]*handleAskExpertPaid/.test(switchBody) && !/handleDetailingAiAccess/.test(switchBody));
check('handleDetailingAiAccess is called exactly once in the file', (hook.match(/await handleDetailingAiAccess\(/g) || []).length === 1);
check('/api/shopify/webhook forwards to the canonical handler', /import\('@\/app\/api\/webhooks\/shopify\/route'\)/.test(fwd));
check('grant is idempotent per order id', /alreadyLogged\(supabase, 'detailing_ai_access_granted', orderId\)/.test(hook));
check('AI product is never treated as a course (no Business grant)', /async function isCourseProduct\(item\) \{\s*if \(isAiLineItem\(item\)\) return false;/.test(hook));
check('no financial/source filter skips renewal orders in the AI grant', !/source_name[^\n]*return null/.test(hook.slice(hook.indexOf('async function handleDetailingAiAccess'), hook.indexOf('async function handleAskExpertPaid'))));

check('renewals that extend live access send no welcome email', /mode === 'extend' && !hasStandaloneAi\(detailer\)/.test(hook));

console.log('Free-plan standalone buyers pass the Detailing AI gates (source)');
function walk(dir) {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const apiRoutes = walk(new URL('../app/api/detailing-ai', import.meta.url).pathname).filter((p) => p.endsWith('route.js'));
check(`found Detailing AI API routes (${apiRoutes.length})`, apiRoutes.length >= 9);
for (const p of apiRoutes) {
  const src = readFileSync(p, 'utf8');
  const rel = p.split('/app/api/')[1];
  check(`${rel}: gated by requireFeature('detailingAi') (standalone-aware)`, /requireFeature\(request, 'detailingAi'/.test(src));
}
for (const r of ['chat', 'ask-expert']) {
  const src = readFileSync(new URL(`../app/api/detailing-ai/${r}/route.js`, import.meta.url), 'utf8');
  const gate = src.indexOf("requireFeature(request, 'detailingAi'");
  const terms = src.indexOf('requireTermsAccepted(');
  check(`${r}: #53 terms gate still applies after the plan gate`, gate > -1 && terms > gate);
}
const planGate = readFileSync(new URL('../lib/plan-gate.js', import.meta.url), 'utf8');
check("requireFeature falls back to ai_access_until only for 'detailingAi'", /gate && feature === 'detailingAi' && await loadStandaloneAiAccess/.test(planGate));
const pg = readFileSync(new URL('../components/PlanGate.jsx', import.meta.url), 'utf8');
check('PlanGate allows detailingAi with active ai_access_until', /feature === 'detailingAi' && hasStandaloneAi\(user\)/.test(pg));
check('PlanGate asks the server before showing the upgrade prompt', /refreshStandaloneAi\(\)/.test(pg) && /\/api\/user\/plan-status/.test(pg));
const layout = readFileSync(new URL('../app/detailing-ai/layout.jsx', import.meta.url), 'utf8');
check('/detailing-ai layout uses PlanGate feature="detailingAi"', /PlanGate feature="detailingAi"/.test(layout));
const login = readFileSync(new URL('../app/api/auth/login/route.js', import.meta.url), 'utf8');
check('login returns ai_access_until (separate, failure-safe read)', /select\('ai_access_until'\)/.test(login) && /user\.ai_access_until =/.test(login));
const sidebar = readFileSync(new URL('../components/Sidebar.jsx', import.meta.url), 'utf8');
check('sidebar shows no upgrade badge on Detailing AI for standalone users', /item\.feature === 'detailingAi' && hasStandaloneAi\(user\)/.test(sidebar));
const status = readFileSync(new URL('../app/api/user/plan-status/route.js', import.meta.url), 'utf8');
check('plan-status returns ai_access_until', /ai_access_until: aiAccessUntil/.test(status));

console.log('Server plan gate (behavior, fake Supabase)');
function fakeSupabase(row, { aiColumnMissing = false } = {}) {
  return {
    from() {
      let cols = '';
      const q = {
        select(c) { cols = c; return q; },
        eq() { return q; },
        async maybeSingle() {
          if (cols.includes('ai_access_until') && aiColumnMissing) return { data: null, error: { message: 'column detailers.ai_access_until does not exist' } };
          return { data: row, error: null };
        },
      };
      return q;
    },
  };
}
const future = new Date(Date.now() + 5 * DAY).toISOString();
const past = new Date(Date.now() - 1 * DAY).toISOString();
const req = new Request('https://crm.shinyjets.com/api/detailing-ai/chat');
const freeAi = { id: 'd1', email: 'buyer@example.com', plan: 'free', is_admin: false, ai_access_until: future };
check('Free + active ai_access_until → detailingAi allowed', (await requireFeature(req, 'detailingAi', { user: { id: 'd1' }, supabase: fakeSupabase(freeAi) })) === null);
const expired = await requireFeature(req, 'detailingAi', { user: { id: 'd1' }, supabase: fakeSupabase({ ...freeAi, ai_access_until: past }) });
check('Free + expired ai_access_until → 403 upgrade', expired?.status === 403);
const none = await requireFeature(req, 'detailingAi', { user: { id: 'd1' }, supabase: fakeSupabase({ ...freeAi, ai_access_until: null }) });
check('Free without standalone → 403 upgrade', none?.status === 403);
const missing = await requireFeature(req, 'detailingAi', { user: { id: 'd1' }, supabase: fakeSupabase({ ...freeAi, ai_access_until: undefined }, { aiColumnMissing: true }) });
check('column missing (SQL not applied) → plain 403, no crash', missing?.status === 403);
const other = await requireFeature(req, 'invoices', { user: { id: 'd1' }, supabase: fakeSupabase(freeAi) });
check('standalone AI unlocks only Detailing AI (invoices still gated)', other?.status === 403);
check('Lite plan still has Detailing AI', (await requireFeature(req, 'detailingAi', { user: { id: 'd1' }, supabase: fakeSupabase({ ...freeAi, plan: 'lite', ai_access_until: null }) })) === null);

console.log('Isolation from CRM plans and Pricing Tool');
check('no-SKU monthly variant never resolves to a CRM plan', resolveCrmLineItem(live({ variant_id: MONTHLY, price: '59.95' })) === null);
check('no-SKU yearly variant never resolves to a CRM plan', resolveCrmLineItem(live({ variant_id: YEARLY, price: '599.00' })) === null);
check('no-SKU AI subscription cancel is AI-only', classifySubscriptionItems([live({ variant_id: MONTHLY })]).aiOnly === true);
check('AI SKU never resolves to a CRM plan', resolveCrmLineItem({ sku: 'SJ-AI-STANDALONE', title: 'Aircraft Detailing AI', price: '59.95' }) === null);
check('AI no-SKU title never resolves to a CRM plan', resolveCrmLineItem({ title: 'Aircraft Detailing AI', price: '599.00' }) === null);
check('mixed cart: Business plan still resolves', crmPurchaseFromLineItems([{ sku: 'SJ-AI-STANDALONE' }, { sku: 'SJ-CRM-BUSINESS', price: '89.95' }])?.plan === 'business');
check('AI order gives no Pricing Tool access', pricingPurchaseFromLineItems([{ sku: 'SJ-AI-STANDALONE' }]) === null);
check('AI subscription cancel is not a CRM cancel', classifySubscriptionItems([{ sku: 'SJ-AI-STANDALONE' }]).hasCrm === false);

const aiCls = classifySubscriptionItems([{ sku: 'SJ-AI-STANDALONE', title: 'Aircraft Detailing AI' }]);
check('AI subscription is a known, AI-only product', aiCls.known && aiCls.aiOnly && !aiCls.hasCrm);
const liteUser = { plan: 'lite', subscription_source: 'shopify', subscription_status: 'active', plan_expires_at: null };
check('cancelling AI never downgrades a Lite CRM plan', decideCancellation({ detailer: liteUser, classification: aiCls, hasActivePricingRow: false }) === 'ignore_ai_only');
check('AI billing failure never suspends the CRM account', billingAffectsCrm({ classification: aiCls, hasActivePricingRow: false }) === false);
const mixed = classifySubscriptionItems([{ sku: 'SJ-AI-STANDALONE' }, { sku: 'SJ-CRM-LITE' }]);
check('mixed AI + Lite subscription still counts as CRM', mixed.hasCrm && !mixed.aiOnly);

console.log('Access dates');
check('fresh grant → now + 30d', days(computeAiAccessUntil({ current: null, days: 30, now: NOW })) === 30);
check('renewal stacks onto remaining time', days(computeAiAccessUntil({ current: new Date(NOW.getTime() + 10 * DAY).toISOString(), days: 30, now: NOW })) === 40);
check('lapsed access restarts from now', days(computeAiAccessUntil({ current: new Date(NOW.getTime() - 5 * DAY).toISOString(), days: 365, now: NOW })) === 365);
check('0 days → null', computeAiAccessUntil({ current: null, days: 0, now: NOW }) === null);
check('active access → hasStandaloneAi', hasStandaloneAi({ ai_access_until: new Date(NOW.getTime() + DAY).toISOString() }, NOW));
check('expired access → no AI', !hasStandaloneAi({ ai_access_until: new Date(NOW.getTime() - DAY).toISOString() }, NOW));
check('missing column/value → no AI', !hasStandaloneAi({}, NOW));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
