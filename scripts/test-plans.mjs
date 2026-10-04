/**
 * Plan / tier helpers (lib/plans.js, lib/pricing-tiers.js) and server gate
 * helpers (lib/plan-gate.js, with a fake Supabase client).
 * Run: npm test   (or node --import ./scripts/test-support/register.mjs scripts/test-plans.mjs)
 */
import {
  normalizePlan, planRank, planAtLeast, hasFeature, requiredPlanFor, platformFeeForPlan,
  seatLimitForPlan, canAddSeat, quotesPerMonth, planLookupKeys, upgradeUrlFor, planRequiredBody,
  PLAN_PRICES, PLAN_MARKETING, FEATURES,
} from '../lib/plans.js';
import { resolveFeeRate, platformFeeRate, getNextTier } from '../lib/pricing-tiers.js';
import { requireFeature, requireSeat, countUsedSeats, detailerHasFeature } from '../lib/plan-gate.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('normalizePlan / aliases');
check('pro → lite', normalizePlan('pro') === 'lite');
check('enterprise → business', normalizePlan('enterprise') === 'business');
check('starter → free', normalizePlan('starter') === 'free');
check('null/garbage → free', normalizePlan(null) === 'free' && normalizePlan('platinum') === 'free');
check('case-insensitive', normalizePlan(' Business ') === 'business' && normalizePlan('LITE') === 'lite');
check('rank order free < lite < business', planRank('free') < planRank('lite') && planRank('lite') < planRank('business'));
check('legacy enterprise ranks as business', planRank('enterprise') === planRank('business'));
check('planAtLeast(pro, lite)', planAtLeast('pro', 'lite') && !planAtLeast('pro', 'business'));

console.log('Prices / marketing copy');
check('Lite $39.95', PLAN_PRICES.lite.monthly === 39.95);
check('Business $89.95 / $899', PLAN_PRICES.business.monthly === 89.95 && PLAN_PRICES.business.yearly === 899);
check('marketing has exactly free/lite/business', Object.keys(PLAN_MARKETING).join(',') === 'free,lite,business');
const copy = JSON.stringify(PLAN_MARKETING);
check('no unbuilt features advertised', !/SMS|FlightAware|API key|fuel|QuickBooks|\$299|\$149|\$79\b/i.test(copy), copy.match(/SMS|FlightAware|API key|fuel|QuickBooks|\$299|\$149|\$79\b/i)?.[0]);

console.log('Feature gates');
const liteFeatures = ['unlimitedQuotes', 'quoteFollowups', 'scheduledSend', 'googleCalendar', 'invoices', 'deposits',
  'bookNowPayLater', 'jobs', 'customerPortal', 'reviewRequests', 'customLogo'];
const businessFeatures = ['detailingAi', 'team', 'crewApp', 'timeClock', 'payroll', 'dispatch', 'changeOrders', 'reports',
  'recurring', 'marketing', 'products', 'equipment', 'whiteLabel', 'customEmailDomain', 'directoryPriority', 'pricingTool'];
for (const f of liteFeatures) {
  check(`${f}: free ✗ / lite ✓ / business ✓`, !hasFeature('free', f) && hasFeature('lite', f) && hasFeature('business', f));
}
for (const f of businessFeatures) {
  check(`${f}: lite ✗ / business ✓ / enterprise ✓`, !hasFeature('lite', f) && hasFeature('business', f) && hasFeature('enterprise', f));
}
check('legacy pro gets Lite features', hasFeature('pro', 'invoices') && !hasFeature('pro', 'team'));
check('admin bypass (object)', hasFeature({ plan: 'free', is_admin: true }, 'team'));
check('admin bypass (opts)', hasFeature('free', 'dispatch', { isAdmin: true }));
check('unknown feature is open', hasFeature('free', 'somethingElse'));
check('every FEATURES entry maps to lite/business', Object.values(FEATURES).every((p) => p === 'lite' || p === 'business'));
check('requiredPlanFor(invoices)=lite', requiredPlanFor('invoices') === 'lite');
check('upgradeUrlFor(team)', upgradeUrlFor('team') === '/upgrade?plan=business');
const body = planRequiredBody('invoices', 'pro');
check('403 body shape', body.code === 'PLAN_REQUIRED' && body.required_plan === 'lite' && body.upgrade_url === '/upgrade?plan=lite' && /\$39\.95/.test(body.error), JSON.stringify(body));

console.log('Fees');
check('free 5% / lite 2% / business 0%', platformFeeForPlan('free') === 0.05 && platformFeeForPlan('lite') === 0.02 && platformFeeForPlan('business') === 0);
check('legacy enterprise → 0% (was the 5% report bug)', platformFeeRate('enterprise') === 0 && resolveFeeRate({ plan: 'enterprise' }) === 0);
check('legacy pro → 2%', resolveFeeRate({ plan: 'pro' }) === 0.02);
check('legacy business default 1% stored → 0%', resolveFeeRate({ plan: 'business', platform_fee_percent: 1 }) === 0);
check('explicit override honored (free @ 3%)', resolveFeeRate({ plan: 'free', platform_fee_percent: 3 }) === 0.03);
check('next tier free → lite → business', getNextTier('free') === 'lite' && getNextTier('pro') === 'business' && !getNextTier('enterprise'));

console.log('Quotes + seats');
check('free 5 quotes/month, paid unlimited', quotesPerMonth('free') === 5 && quotesPerMonth('lite') === Infinity && quotesPerMonth('enterprise') === Infinity);
check('seat limits 1/1/3', seatLimitForPlan('free') === 1 && seatLimitForPlan('lite') === 1 && seatLimitForPlan('business') === 3);
check('business: owner + 1 member → can add', canAddSeat('business', 2));
check('business: owner + 2 members → full', !canAddSeat('business', 3));
check('lite: owner only → cannot add', !canAddSeat('lite', 1));
check('admin can always add', canAddSeat({ plan: 'free', is_admin: true }, 10));
check('planLookupKeys(lite) falls back to pro', JSON.stringify(planLookupKeys('lite')).includes('pro'));
check('planLookupKeys(enterprise) tries raw first', planLookupKeys('enterprise')[0] === 'enterprise' && planLookupKeys('enterprise').includes('business'));

// ── plan-gate with a fake Supabase ─────────────────────────────────────────
function fakeSupabase({ detailers = {}, activeMembers = {} }) {
  return {
    from(table) {
      const q = { table, filters: {} };
      const api = {
        select(_cols, opts) { q.count = opts?.count; return api; },
        eq(col, val) { q.filters[col] = val; return api; },
        neq(col, val) { q.filters[`!${col}`] = val; return api; },
        async maybeSingle() { return { data: detailers[q.filters.id] || null, error: null }; },
        then(resolve) {
          // count query on team_members
          const n = activeMembers[q.filters.detailer_id] || 0;
          resolve({ count: n, error: null });
        },
      };
      return api;
    },
  };
}
const sb = fakeSupabase({
  detailers: {
    d_free: { id: 'd_free', plan: 'free', email: 'a@x.com' },
    d_pro: { id: 'd_pro', plan: 'pro', email: 'b@x.com' },
    d_biz: { id: 'd_biz', plan: 'business', email: 'c@x.com' },
    d_ent: { id: 'd_ent', plan: 'enterprise', email: 'd@x.com' },
    d_admin: { id: 'd_admin', plan: 'free', email: 'e@x.com', is_admin: true },
  },
  activeMembers: { d_biz: 2, d_ent: 1, d_pro: 0 },
});

console.log('Server gates (requireFeature / requireSeat)');
const req = new Request('http://localhost/api/invoices');
check('free user blocked from invoices (403)', (await requireFeature(req, 'invoices', { user: { id: 'd_free' }, supabase: sb }))?.status === 403);
const r403 = await requireFeature(req, 'invoices', { user: { id: 'd_free' }, supabase: sb });
const j403 = await r403.json();
check('403 JSON has upgrade_url', j403.upgrade_url === '/upgrade?plan=lite' && j403.code === 'PLAN_REQUIRED');
check('legacy pro allowed invoices', (await requireFeature(req, 'invoices', { user: { id: 'd_pro' }, supabase: sb })) === null);
check('legacy pro blocked from team', (await requireFeature(req, 'team', { user: { id: 'd_pro' }, supabase: sb }))?.status === 403);
check('crew JWT gated on owner plan (detailer_id)', (await requireFeature(req, 'crewApp', { user: { id: 'crew1', detailer_id: 'd_biz' }, supabase: sb })) === null);
check('crew of lite owner blocked', (await requireFeature(req, 'crewApp', { user: { id: 'crew2', detailer_id: 'd_pro' }, supabase: sb }))?.status === 403);
check('admin bypass', (await requireFeature(req, 'dispatch', { user: { id: 'd_admin' }, supabase: sb })) === null);
check('no user → defer to route 401', (await requireFeature(req, 'invoices', { user: null, supabase: sb })) === null);
check('detailerHasFeature(enterprise, timeClock)', await detailerHasFeature('d_ent', 'timeClock', sb));
check('countUsedSeats = owner + active members', (await countUsedSeats(sb, 'd_biz')) === 3);
check('business with 2 members: seat cap reached (403 SEAT_LIMIT)', (await requireSeat(sb, 'd_biz'))?.status === 403);
const seatBody = await (await requireSeat(sb, 'd_biz')).json();
check('seat 403 code', seatBody.code === 'SEAT_LIMIT' && seatBody.seat_limit === 3 && seatBody.seats_used === 3, JSON.stringify(seatBody));
check('enterprise (→business) with 1 member: can add', (await requireSeat(sb, 'd_ent')) === null);
const liteSeat = await requireSeat(sb, 'd_pro');
check('lite: adding a member requires Business', liteSeat?.status === 403 && (await liteSeat.json()).code === 'PLAN_REQUIRED');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
