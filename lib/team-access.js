// Team-member CRM access. Pure module (no Next / Supabase) so middleware
// and `node` tests can import it.
//
// A team member is not a second tenant. Their session carries the owning
// shop's detailer id and plan. Navigation is role-scoped:
//   manager (and a team row stored as owner) — the full CRM except billing
//   lead_tech / employee / contractor — jobs, quotes, calendar, customers, aircraft
//
// There is no separate "admin" or "staff" role in the product. Those words
// map onto manager and employee so an older row still lands in the right nav.

import { normalizePlan } from './plans';

export const TEAM_ROLES = ['owner', 'manager', 'lead_tech', 'employee', 'contractor'];

const ROLE_ALIASES = {
  admin: 'manager',
  staff: 'employee',
  detailer: 'employee',
  tech: 'lead_tech',
  technician: 'lead_tech',
};

export function normalizeTeamRole(role) {
  const r = String(role || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (TEAM_ROLES.includes(r)) return r;
  if (ROLE_ALIASES[r]) return ROLE_ALIASES[r];
  return 'employee';
}

// Workers see the working surfaces. Manager / team-owner see the rest of the
// CRM. Billing and account ownership stay with the detailer login only.
export function isWorkerRole(role) {
  const r = normalizeTeamRole(role);
  return r === 'lead_tech' || r === 'employee' || r === 'contractor';
}

export const WORKER_NAV_HREFS = ['/jobs', '/quotes', '/calendar', '/customers', '/aircraft'];

export function homePathForRole(role) {
  return isWorkerRole(role) ? '/jobs' : '/dashboard';
}

export function navItemVisible(href, user) {
  if (!user || user.account_kind !== 'team') return true;
  if (!isWorkerRole(user.team_role)) return true;
  const path = String(href || '');
  return WORKER_NAV_HREFS.some((p) => path === p || path.startsWith(`${p}/`));
}

export function canSeeSettings(user) {
  if (!user || user.account_kind !== 'team') return true;
  return !isWorkerRole(user.team_role);
}

export function canSeeBilling(user) {
  return !user || user.account_kind !== 'team';
}

export function withTeamIdentity(ownerUser, member) {
  const team_role = normalizeTeamRole(member?.role || member?.type);
  const ownerId = ownerUser?.id || member?.detailer_id || null;
  return {
    ...ownerUser,
    id: ownerId,
    email: member?.email || ownerUser?.email || null,
    name: member?.name || ownerUser?.name || null,
    is_admin: false,
    plan: normalizePlan(ownerUser?.plan_raw || ownerUser?.plan),
    account_kind: 'team',
    team_member_id: member?.id || null,
    team_role,
    detailer_id: ownerId,
    home_path: homePathForRole(team_role),
  };
}

export function teamTokenClaims(member, ownerId) {
  const team_role = normalizeTeamRole(member?.role || member?.type);
  return {
    id: ownerId,
    email: member?.email || null,
    name: member?.name || null,
    account_kind: 'team',
    team_member_id: member?.id || null,
    team_role,
    detailer_id: ownerId,
  };
}

const BILLING_PAGES = ['/upgrade', '/settings/payments', '/admin'];
const BILLING_APIS = [
  '/api/stripe',
  '/api/upgrade',
  '/api/email-domain',
  '/api/user/stripe-mode',
  '/api/user/pass-fee',
  '/api/user/cc-fee',
  '/api/auth/set-password',
  '/api/auth/webauthn',
  '/api/admin',
];

// Extra APIs a worker does not need for jobs / quotes / calendar / customers.
const WORKER_DENIED_APIS = [
  '/api/team',
  '/api/reports',
  '/api/analytics',
  '/api/marketing',
  '/api/dispatch',
  '/api/settings',
  '/api/model-offers',
];

const WORKER_PAGE_PREFIXES = [
  ...WORKER_NAV_HREFS,
  '/login',
  '/forgot-password',
  '/reset-password',
  '/logout',
  '/auth',
  '/invite',
  '/crew',
  '/q',
  '/review',
];

function normalizePath(pathname) {
  if (!pathname) return '/';
  const path = String(pathname).split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path || '/';
}

function startsWithAny(path, prefixes) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

function isStaticAsset(pathname) {
  if (pathname.startsWith('/_next/') || pathname.startsWith('/icons/')) return true;
  return /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|woff2?|ttf|txt|xml|webmanifest)$/i.test(pathname);
}

/**
 * @returns {{ type: 'allow' } | { type: 'redirect', location: string } | { type: 'forbidden' }}
 */
export function teamAccessDecision({ pathname, accountKind, teamRole, method } = {}) {
  if (accountKind !== 'team') return { type: 'allow' };
  const path = normalizePath(pathname);
  if (isStaticAsset(path)) return { type: 'allow' };

  const role = normalizeTeamRole(teamRole);
  const home = homePathForRole(role);
  const verb = String(method || 'GET').toUpperCase();

  const billing = path.startsWith('/api/')
    ? startsWithAny(path, BILLING_APIS)
    : startsWithAny(path, BILLING_PAGES);
  if (billing) {
    return path.startsWith('/api/')
      ? { type: 'forbidden' }
      : { type: 'redirect', location: home };
  }

  if (!isWorkerRole(role)) return { type: 'allow' };

  if (path.startsWith('/api/')) {
    if (startsWithAny(path, WORKER_DENIED_APIS)) return { type: 'forbidden' };
    if (path === '/api/user/profile' && verb !== 'GET') return { type: 'forbidden' };
    return { type: 'allow' };
  }

  if (path === '/') return { type: 'redirect', location: home };
  if (startsWithAny(path, WORKER_PAGE_PREFIXES)) return { type: 'allow' };
  return { type: 'redirect', location: home };
}
