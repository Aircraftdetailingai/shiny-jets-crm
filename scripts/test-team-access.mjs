/**
 * Team CRM sessions: role aliases, sidebar visibility, and page/API gates.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-team-access.mjs
 */
import {
  normalizeTeamRole,
  isWorkerRole,
  homePathForRole,
  navItemVisible,
  canSeeSettings,
  canSeeBilling,
  withTeamIdentity,
  teamTokenClaims,
  teamAccessDecision,
  WORKER_NAV_HREFS,
} from '../lib/team-access.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const owner = { id: 'shop-1', account_kind: undefined, plan: 'business', team_role: undefined };
const manager = { id: 'shop-1', account_kind: 'team', team_role: 'manager', plan: 'business' };
const employee = { id: 'shop-1', account_kind: 'team', team_role: 'employee', plan: 'business' };
const lead = { id: 'shop-1', account_kind: 'team', team_role: 'lead_tech', plan: 'business' };
const contractor = { id: 'shop-1', account_kind: 'team', team_role: 'contractor', plan: 'business' };

console.log('role aliases');
check('admin → manager', normalizeTeamRole('admin') === 'manager');
check('staff / detailer → employee', normalizeTeamRole('staff') === 'employee' && normalizeTeamRole('Detailer') === 'employee');
check('tech → lead_tech', normalizeTeamRole('technician') === 'lead_tech' && normalizeTeamRole('tech') === 'lead_tech');
check('unknown → employee', normalizeTeamRole('intern') === 'employee' && normalizeTeamRole('') === 'employee');
check('canonical roles stay put', ['owner', 'manager', 'lead_tech', 'employee', 'contractor'].every((r) => normalizeTeamRole(r) === r));
check('workers are lead/employee/contractor', isWorkerRole('lead_tech') && isWorkerRole('employee') && isWorkerRole('contractor') && !isWorkerRole('manager') && !isWorkerRole('admin') && !isWorkerRole('owner'));
check('homes', homePathForRole('manager') === '/dashboard' && homePathForRole('employee') === '/jobs' && homePathForRole('admin') === '/dashboard');

console.log('sidebar');
const hrefs = ['/dashboard', '/jobs', '/quotes', '/calendar', '/customers', '/aircraft', '/invoices', '/team', '/reports', '/upgrade'];
for (const href of hrefs) {
  check(`owner sees ${href}`, navItemVisible(href, owner));
  check(`manager sees ${href}`, navItemVisible(href, manager));
}
for (const href of WORKER_NAV_HREFS) {
  check(`employee sees ${href}`, navItemVisible(href, employee));
  check(`lead sees ${href}`, navItemVisible(href, lead));
  check(`contractor sees ${href}`, navItemVisible(href, contractor));
}
for (const href of ['/dashboard', '/invoices', '/team', '/reports', '/marketing', '/settings']) {
  check(`employee hides ${href}`, !navItemVisible(href, employee));
}
check('manager settings, no billing', canSeeSettings(manager) && !canSeeBilling(manager));
check('employee no settings, no billing', !canSeeSettings(employee) && !canSeeBilling(employee));
check('owner sees settings and billing', canSeeSettings(owner) && canSeeBilling(owner) && canSeeBilling(null));

console.log('identity overlay');
const overlaid = withTeamIdentity(
  { id: 'shop-1', email: 'saul@topflight.test', name: 'Saul', plan: 'business', plan_raw: 'enterprise', is_admin: true, company: 'Topflight' },
  { id: 'mem-1', email: 'jesus@topflight.test', name: 'Jesus', role: 'employee', detailer_id: 'shop-1' },
);
check('session id is the owner shop', overlaid.id === 'shop-1' && overlaid.detailer_id === 'shop-1');
check('name and email are the member', overlaid.name === 'Jesus' && overlaid.email === 'jesus@topflight.test');
check('plan is the owner plan, not a new free tenant', overlaid.plan === 'business');
check('legacy enterprise plan_raw normalizes onto the member session', withTeamIdentity({ id: 'shop-1', plan: 'free', plan_raw: 'enterprise' }, { id: 'm', role: 'manager' }).plan === 'business');
check('member is not a platform admin', overlaid.is_admin === false && overlaid.account_kind === 'team' && overlaid.team_member_id === 'mem-1' && overlaid.team_role === 'employee' && overlaid.home_path === '/jobs');
check('company stays the shop', overlaid.company === 'Topflight');
const claims = teamTokenClaims({ id: 'mem-1', email: 'jesus@topflight.test', name: 'Jesus', role: 'admin' }, 'shop-1');
check('token claims point at the owner and map admin → manager', claims.id === 'shop-1' && claims.detailer_id === 'shop-1' && claims.team_role === 'manager' && claims.account_kind === 'team' && claims.team_member_id === 'mem-1');

console.log('access decisions');
check('owner login is unrestricted', teamAccessDecision({ pathname: '/upgrade', accountKind: undefined }).type === 'allow');
check('manager blocked from upgrade page', teamAccessDecision({ pathname: '/upgrade', accountKind: 'team', teamRole: 'manager' }).location === '/dashboard');
check('manager blocked from payments settings', teamAccessDecision({ pathname: '/settings/payments', accountKind: 'team', teamRole: 'admin' }).location === '/dashboard');
check('manager blocked from stripe API', teamAccessDecision({ pathname: '/api/stripe/connect', accountKind: 'team', teamRole: 'manager' }).type === 'forbidden');
check('manager can open the rest of settings', teamAccessDecision({ pathname: '/settings/business', accountKind: 'team', teamRole: 'manager' }).type === 'allow');
check('manager can open dashboard', teamAccessDecision({ pathname: '/dashboard', accountKind: 'team', teamRole: 'manager' }).type === 'allow');
check('worker home is jobs', teamAccessDecision({ pathname: '/', accountKind: 'team', teamRole: 'employee' }).location === '/jobs');
check('worker dashboard redirects', teamAccessDecision({ pathname: '/dashboard', accountKind: 'team', teamRole: 'staff' }).location === '/jobs');
for (const href of [...WORKER_NAV_HREFS, '/quotes/new', '/jobs/abc']) {
  check(`worker allowed ${href}`, teamAccessDecision({ pathname: href, accountKind: 'team', teamRole: 'employee' }).type === 'allow');
}
check('worker invoices redirect', teamAccessDecision({ pathname: '/invoices', accountKind: 'team', teamRole: 'contractor' }).location === '/jobs');
check('worker team page redirects', teamAccessDecision({ pathname: '/team', accountKind: 'team', teamRole: 'lead_tech' }).location === '/jobs');
check('worker team API forbidden', teamAccessDecision({ pathname: '/api/team', accountKind: 'team', teamRole: 'employee', method: 'GET' }).type === 'forbidden');
check('worker reports API forbidden', teamAccessDecision({ pathname: '/api/analytics/revenue', accountKind: 'team', teamRole: 'employee' }).type === 'forbidden');
check('worker cannot write the shop profile', teamAccessDecision({ pathname: '/api/user/profile', accountKind: 'team', teamRole: 'employee', method: 'PUT' }).type === 'forbidden');
check('worker can read the shop profile', teamAccessDecision({ pathname: '/api/user/profile', accountKind: 'team', teamRole: 'employee', method: 'GET' }).type === 'allow');
check('worker can use quotes API', teamAccessDecision({ pathname: '/api/quotes', accountKind: 'team', teamRole: 'employee', method: 'POST' }).type === 'allow');
check('worker cannot edit make and model pins', teamAccessDecision({ pathname: '/api/model-offers', accountKind: 'team', teamRole: 'employee', method: 'PUT' }).type === 'forbidden');
check('manager can open makes and models', teamAccessDecision({ pathname: '/models', accountKind: 'team', teamRole: 'manager' }).type === 'allow');
check('worker makes and models page redirects home', teamAccessDecision({ pathname: '/models', accountKind: 'team', teamRole: 'employee' }).location === '/jobs');
check('static assets stay open', teamAccessDecision({ pathname: '/_next/static/chunk.js', accountKind: 'team', teamRole: 'employee' }).type === 'allow');
check('manager cannot change the owner password', teamAccessDecision({ pathname: '/api/auth/set-password', accountKind: 'team', teamRole: 'manager', method: 'POST' }).type === 'forbidden');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
