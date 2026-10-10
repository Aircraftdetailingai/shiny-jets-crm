/**
 * CRM session expiry should ignore foreign 401s and cookie-only polls.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-session-expiry.mjs
 */
import { crmSessionExpired } from '../lib/session-expiry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

const token = 'crm-jwt';

console.log('session expiry');
check('portal 401 does not expire the CRM session', !crmSessionExpired({
  status: 401, pathname: '/api/portal/me', authorization: '', crmToken: token,
}));
check('cookie-only plan poll does not expire the CRM session', !crmSessionExpired({
  status: 401, pathname: '/api/user/plan-status', authorization: '', crmToken: token,
}));
check('auth routes do not expire the session', !crmSessionExpired({
  status: 401, pathname: '/api/auth/login', authorization: `Bearer ${token}`, crmToken: token,
}));
check('a rejected CRM bearer does expire the session', crmSessionExpired({
  status: 401, pathname: '/api/user/me', authorization: `Bearer ${token}`, crmToken: token,
}));
check('a different bearer does not expire this session', !crmSessionExpired({
  status: 401, pathname: '/api/user/me', authorization: 'Bearer other', crmToken: token,
}));
check('non-401 does not expire', !crmSessionExpired({
  status: 403, pathname: '/api/user/me', authorization: `Bearer ${token}`, crmToken: token,
}));
check('no stored token does not expire', !crmSessionExpired({
  status: 401, pathname: '/api/user/me', authorization: 'Bearer crm-jwt', crmToken: '',
}));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
