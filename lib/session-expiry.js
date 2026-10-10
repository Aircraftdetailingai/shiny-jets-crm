// Decide whether a 401 should end the CRM session.
//
// The CRM session is the localStorage vector_token (a 30-day app JWT).
// SessionGuard used to treat every same-origin /api 401 as "session expired"
// whenever that token existed. Two normal navigations then logged people out:
//   - /portal calls /api/portal/me, which 401s without a portal_token
//   - /api/user/plan-status is polled with the cookie only; a missing cookie
//     401s even while the bearer token is still valid
// A Supabase auth refresh failure is the same class of problem: it is not
// the CRM JWT, and it must not clear vector_token.

const FOREIGN_API_PREFIXES = [
  '/api/portal',
  '/api/vendor',
  '/api/crew',
  '/api/customer',
  '/api/cron',
];

function normalizePath(url) {
  try {
    const path = String(url || '').split('?')[0].split('#')[0];
    return path || '/';
  } catch {
    return '/';
  }
}

function bearerFrom(authorization) {
  const header = String(authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

/**
 * @param {{ status?: number, pathname?: string, authorization?: string, crmToken?: string }} input
 * @returns {boolean}
 */
export function crmSessionExpired({ status, pathname, authorization, crmToken } = {}) {
  if (status !== 401) return false;
  const path = normalizePath(pathname);
  if (!path.startsWith('/api/')) return false;
  if (path === '/api/auth' || path.startsWith('/api/auth/')) return false;
  if (FOREIGN_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;
  const token = typeof crmToken === 'string' ? crmToken : '';
  if (!token) return false;
  // Only a request that actually presented this CRM token and was rejected.
  // Cookie-only polls and other apps' 401s leave the CRM session alone.
  const bearer = bearerFrom(authorization);
  return bearer.length > 0 && bearer === token;
}
