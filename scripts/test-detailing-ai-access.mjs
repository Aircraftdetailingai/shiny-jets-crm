/**
 * Standalone Detailing AI (Shopify "Aircraft Detailing AI") → ai_access_until.
 * Run: node scripts/test-detailing-ai-access.mjs
 */
import { isAiSku, isAiLineItem, aiPurchaseFromLineItems, computeAiAccessUntil, hasStandaloneAi } from '../lib/detailing-ai-access.js';
import { resolveCrmLineItem, crmPurchaseFromLineItems, classifySubscriptionItems, decideCancellation, billingAffectsCrm } from '../lib/crm-plan-grants.js';
import { pricingPurchaseFromLineItems } from '../lib/pricing-tool-access.js';

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

console.log('Isolation from CRM plans and Pricing Tool');
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
