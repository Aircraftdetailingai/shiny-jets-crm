/**
 * Auth hardening: OAuth session minting must use a verified Supabase user,
 * login failures are rate limited, and duplicate detailers emails still resolve.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-auth-hardening.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { identityFromSupabaseUser, nameFromSupabaseUser, providerFromSupabaseUser, readBearerToken } from '../lib/oauth-identity.js';
import { completeOAuthSession } from '../lib/oauth-complete-session.js';
import { customerCreatePasswordError, customerLoginDecision } from '../lib/customer-account-auth.js';
import {
  detailerEmailQuery,
  exactEmailIlike,
  matchDetailerPassword,
  noteDuplicateDetailers,
  preferredDetailer,
  resolveAuthDetailer,
} from '../lib/auth-detailer-lookup.js';
import {
  LOGIN_EMAIL_FAIL_LIMIT,
  LOGIN_FAIL_WINDOW_MS,
  LOGIN_IP_FAIL_LIMIT,
  LOGIN_RATE_LIMIT_MESSAGE,
  clientIpFromRequest,
  loginRateLimit,
  recordLoginFailure,
  resetLoginRateLimits,
} from '../lib/login-rate-limit.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const tests = [];
const check = (name, fn) => tests.push([name, fn]);

function headers(map) {
  const lower = {};
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v;
  return { get: (name) => lower[String(name).toLowerCase()] ?? null };
}

function captureError(fn) {
  const logs = [];
  const orig = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const value = fn();
    return { value, logs };
  } finally {
    console.error = orig;
  }
}

const compare = async (password, hash) => {
  if (hash === 'throw') throw new Error('unreadable hash');
  return password === hash;
};

// ── OAuth identity ──────────────────────────────────────────────────────────
check('bearer token: missing, wrong scheme, and empty are rejected', () => {
  assert.equal(readBearerToken(undefined), '');
  assert.equal(readBearerToken(''), '');
  assert.equal(readBearerToken('Basic abc'), '');
  assert.equal(readBearerToken('Bearer'), '');
  assert.equal(readBearerToken('Bearer   '), '');
  assert.equal(readBearerToken('bearer abc'), '');
});

check('bearer token: returns the trimmed access token', () => {
  assert.equal(readBearerToken('Bearer supabase-access-token'), 'supabase-access-token');
  assert.equal(readBearerToken('Bearer   eyJ.token.here  '), 'eyJ.token.here');
});

check('verified user: lower-cases email and keeps the auth user id', () => {
  assert.deepEqual(
    identityFromSupabaseUser({ email: '  Brett@ShinyJets.com ', id: 'user-123' }),
    { email: 'brett@shinyjets.com', oauth_id: 'user-123' },
  );
});

check('verified user: missing email or id is not an identity', () => {
  assert.equal(identityFromSupabaseUser(null), null);
  assert.equal(identityFromSupabaseUser({ email: 'a@b.com' }), null);
  assert.equal(identityFromSupabaseUser({ id: 'user-1' }), null);
  assert.equal(identityFromSupabaseUser({ email: '   ', id: 'user-1' }), null);
  assert.equal(identityFromSupabaseUser({ email: 'a@b.com', id: '   ' }), null);
});

check('display name and provider come from the auth user, not a default client string', () => {
  const user = {
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Pat Pilot' },
  };
  assert.equal(nameFromSupabaseUser(user), 'Pat Pilot');
  assert.equal(providerFromSupabaseUser(user), 'google');
  assert.equal(nameFromSupabaseUser({ user_metadata: { given_name: 'Pat', family_name: 'Pilot' } }), 'Pat Pilot');
  assert.equal(providerFromSupabaseUser({ identities: [{ provider: 'email' }, { provider: 'google' }] }), 'google');
  assert.equal(providerFromSupabaseUser({ app_metadata: { provider: 'email' } }), 'email');
  assert.equal(providerFromSupabaseUser({ app_metadata: { provider: 'facebook' } }), 'facebook');
  assert.equal(providerFromSupabaseUser({ app_metadata: { providers: ['email', 'apple'] } }), 'apple');
  assert.equal(nameFromSupabaseUser(null), '');
  assert.equal(providerFromSupabaseUser(null), '');
});

check('oauth-complete route does not read the JSON body', () => {
  const route = read('app/api/auth/oauth-complete/route.js');
  const session = read('lib/oauth-complete-session.js');
  assert.match(route, /readBearerToken\(request\.headers\.get\('authorization'\)\)/);
  assert.match(route, /completeOAuthSession\(/);
  assert.doesNotMatch(route, /request\.json\(/);
  assert.doesNotMatch(route, /body\.email/);
  assert.doesNotMatch(route, /body\.oauth_id/);
  assert.doesNotMatch(session, /body\.email/);
  assert.doesNotMatch(session, /body\.oauth_id/);
  assert.doesNotMatch(session, /body\.provider/);
  assert.doesNotMatch(session, /body\.name/);
  assert.match(session, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(session, /identityFromSupabaseUser\(verified\?\.user\)/);
  assert.match(session, /hasVerifiedOAuthProvider\(authUser\)/);
  assert.match(session, /detailerEmailQuery\(/);
  assert.match(session, /status: 401/);
});

check('Google callback sends the Supabase access token', () => {
  const page = read('app/auth/callback/page.jsx');
  assert.match(page, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(page, /session\?\.access_token/);
  assert.match(page, /localStorage\.setItem\('vector_token', result\.token\)/);
  assert.match(page, /window\.location\.href = result\.redirect \|\| '\/dashboard'/);
});

// In-memory Supabase stand-in. Only the calls oauth completion makes.
function fakeSupabase({ getUser, rows, serviceCount = 0, insertError = null }) {
  const state = { rows: rows.map((row) => ({ ...row })) };
  const inserted = [];
  const updates = [];
  let tokensSeen = [];
  const client = {
    inserted,
    updates,
    tokensSeen,
    auth: {
      async getUser(token) {
        tokensSeen.push(token);
        return getUser(token);
      },
    },
    from(table) {
      const op = { table, filters: [], action: 'select', row: null };
      const q = {
        select() { return q; },
        ilike(col, val) { op.filters.push(['ilike', col, val]); return q; },
        eq(col, val) { op.filters.push(['eq', col, val]); return q; },
        order() { return q; },
        limit() { return q; },
        insert(row) { op.action = 'insert'; op.row = row; return q; },
        update(row) { op.action = 'update'; op.row = row; return q; },
        upsert(row) { op.action = 'upsert'; op.row = row; return q; },
        maybeSingle() { return q.exec(true); },
        single() { return q.exec(true); },
        then(resolve, reject) { return q.exec(false).then(resolve, reject); },
        exec(single) {
          if (table === 'detailers' && op.action === 'select') {
            const emailFilter = op.filters.find((f) => f[0] === 'ilike' && f[1] === 'email');
            const slugFilter = op.filters.find((f) => f[0] === 'eq' && f[1] === 'slug');
            let data = state.rows;
            if (emailFilter) {
              data = state.rows.filter((row) => String(row.email).toLowerCase() === String(emailFilter[2]).toLowerCase());
            } else if (slugFilter) {
              data = state.rows.filter((row) => row.slug === slugFilter[2]);
            }
            if (single) return Promise.resolve({ data: data[0] || null, error: null });
            return Promise.resolve({ data, error: null, count: data.length });
          }
          if (table === 'detailers' && op.action === 'insert') {
            if (insertError) return Promise.resolve({ data: null, error: insertError });
            const row = { id: `new-${inserted.length + 1}`, phone: null, ...op.row };
            inserted.push(row);
            state.rows.push(row);
            const payload = single ? row : [row];
            return Promise.resolve({ data: payload, error: null });
          }
          if (table === 'detailers' && op.action === 'update') {
            updates.push(op);
            const idFilter = op.filters.find((f) => f[0] === 'eq' && f[1] === 'id');
            if (idFilter) {
              const row = state.rows.find((item) => item.id === idFilter[2]);
              if (row) Object.assign(row, op.row);
            }
            return Promise.resolve({ data: null, error: null });
          }
          if (table === 'services') {
            return Promise.resolve({ data: null, error: null, count: serviceCount });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
  return client;
}

const googleUser = {
  id: 'sb-user-1',
  email: 'Buyer@Shop.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'google' },
  user_metadata: { full_name: 'Buyer Shop' },
};

function acceptToken(token) {
  if (token !== 'valid-supabase-access-token') {
    return { data: { user: null }, error: { message: 'invalid claim' } };
  }
  return { data: { user: googleUser }, error: null };
}

const issued = [];
const createToken = async (payload) => {
  issued.push(payload);
  return `crm-jwt-${payload.id}`;
};

check('oauth attack: no session is rejected and no CRM token is minted', async () => {
  issued.length = 0;
  const supabase = fakeSupabase({
    getUser: acceptToken,
    rows: [{ id: 'admin', email: 'brett@shinyjets.com', plan: 'business', password_hash: 'x', updated_at: '2026-01-01T00:00:00Z' }],
  });
  const result = await completeOAuthSession({
    supabase,
    accessToken: '',
    createToken,
  });
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'Unauthorized');
  assert.equal(result.body.token, undefined);
  assert.equal(issued.length, 0);
  assert.equal(supabase.inserted.length, 0);
  assert.deepEqual(supabase.tokensSeen, []);
});

check('oauth attack: forged bearer and a body email do not sign in as that email', async () => {
  issued.length = 0;
  const supabase = fakeSupabase({
    getUser: acceptToken,
    rows: [{ id: 'admin', email: 'brett@shinyjets.com', name: 'Brett', plan: 'business', password_hash: 'secret', updated_at: '2026-06-01T00:00:00Z' }],
  });
  const result = await completeOAuthSession({
    supabase,
    accessToken: 'not-a-token',
    createToken,
  });
  assert.equal(result.status, 401);
  assert.equal(result.body.token, undefined);
  assert.equal(issued.length, 0);
  assert.equal(supabase.inserted.length, 0);
  assert.deepEqual(supabase.tokensSeen, ['not-a-token']);
});

check('oauth attack: an email-provider Supabase session cannot take over a CRM account', async () => {
  issued.length = 0;
  const emailUser = {
    id: 'sb-email',
    email: 'brett@shinyjets.com',
    app_metadata: { provider: 'email' },
    identities: [{ provider: 'email', identity_data: { email: 'brett@shinyjets.com' } }],
  };
  const supabase = fakeSupabase({
    getUser: async () => ({ data: { user: emailUser }, error: null }),
    rows: [{ id: 'admin', email: 'brett@shinyjets.com', plan: 'business', password_hash: 'x', name: 'Brett', updated_at: '2026-01-01T00:00:00Z' }],
  });
  const result = await completeOAuthSession({
    supabase,
    accessToken: 'email-user-access-token',
    createToken,
  });
  assert.equal(result.status, 401);
  assert.equal(result.body.token, undefined);
  assert.equal(issued.length, 0);
  assert.equal(supabase.inserted.length, 0);
});

check('oauth happy path: verified Google user signs into the existing account, ignoring a forged email', async () => {
  issued.length = 0;
  const course = {
    id: 'course-1',
    email: 'buyer@shop.com',
    name: 'Buyer Shop',
    company: 'Hangar Co',
    plan: 'business',
    subscription_status: 'comped',
    subscription_source: 'course_bundle',
    password_hash: 'temp-hash',
    must_change_password: true,
    onboarding_complete: false,
    updated_at: '2026-04-01T00:00:00Z',
    status: 'active',
  };
  const admin = {
    id: 'admin',
    email: 'brett@shinyjets.com',
    name: 'Brett',
    plan: 'business',
    password_hash: 'admin-hash',
    updated_at: '2026-05-01T00:00:00Z',
  };
  const supabase = fakeSupabase({ getUser: acceptToken, rows: [course, admin], serviceCount: 3 });
  const result = await completeOAuthSession({
    supabase,
    accessToken: 'valid-supabase-access-token',
    createToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.token, 'crm-jwt-course-1');
  assert.equal(result.body.user.id, 'course-1');
  assert.equal(result.body.user.email, 'buyer@shop.com');
  assert.equal(result.body.user.plan, 'business');
  assert.equal(result.body.user.subscription_source, 'course_bundle');
  assert.equal(result.body.redirect, '/dashboard');
  assert.equal(supabase.inserted.length, 0);
  assert.deepEqual(issued, [{ id: 'course-1', email: 'buyer@shop.com' }]);
  assert.equal(result.body.user.password_hash, undefined);
});

check('oauth happy path: new Google signup is created from the verified email and sent to onboarding', async () => {
  issued.length = 0;
  const supabase = fakeSupabase({ getUser: acceptToken, rows: [] });
  const result = await completeOAuthSession({
    supabase,
    accessToken: 'valid-supabase-access-token',
    createToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.redirect, '/onboarding');
  assert.equal(result.body.user.email, 'buyer@shop.com');
  assert.equal(result.body.user.plan, 'free');
  assert.equal(supabase.inserted.length, 1);
  assert.equal(supabase.inserted[0].email, 'buyer@shop.com');
  assert.equal(supabase.inserted[0].name, 'Buyer Shop');
  assert.equal(supabase.inserted[0].oauth_provider, 'google');
  assert.equal(supabase.inserted[0].oauth_id, 'sb-user-1');
  assert.notEqual(result.body.user.email, 'brett@shinyjets.com');
});

check('oauth: duplicate detailer rows sign in to the account that has a password, not a new row', async () => {
  issued.length = 0;
  const newerEmpty = {
    id: 'empty',
    email: 'buyer@shop.com',
    password_hash: null,
    plan: 'free',
    updated_at: '2026-08-01T00:00:00Z',
  };
  const course = {
    id: 'course-1',
    email: 'Buyer@Shop.com',
    password_hash: 'temp',
    plan: 'enterprise',
    subscription_source: 'course_bundle',
    updated_at: '2026-01-01T00:00:00Z',
    name: 'Buyer',
  };
  const supabase = fakeSupabase({ getUser: acceptToken, rows: [newerEmpty, course] });
  const result = await completeOAuthSession({
    supabase,
    accessToken: 'valid-supabase-access-token',
    createToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.id, 'course-1');
  assert.equal(result.body.user.plan, 'business');
  assert.equal(supabase.inserted.length, 0);
});

check('new-signup onboarding writes only the signed-in user', () => {
  const route = read('app/api/onboarding/route.js');
  assert.match(route, /const user = await getAuthUser\(request\)/);
  assert.match(route, /if \(!user\) return Response\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/);
  assert.match(route, /\.eq\('id', user\.id\)/);
  assert.doesNotMatch(route, /body\.userId/);
  assert.doesNotMatch(route, /password_hash/);
});

check('course first login still matches the temporary password on that account', async () => {
  const course = {
    id: 'course-1',
    email: 'buyer@shop.com',
    password_hash: 'temp-hash',
    must_change_password: true,
    plan: 'business',
    subscription_source: 'course_bundle',
    updated_at: '2026-04-01T00:00:00Z',
  };
  const matched = await matchDetailerPassword([course], 'temp-hash', compare);
  assert.equal(matched.id, 'course-1');
  assert.equal(matched.must_change_password, true);
  assert.equal(matched.subscription_source, 'course_bundle');
  const login = read('app/api/auth/login/route.js');
  assert.match(login, /matchDetailerPassword\(matches, password, comparePassword\)/);
  assert.match(login, /createToken\(\{ id: data\.id, email: data\.email \}\)/);
  assert.match(login, /must_change_password: data\.must_change_password/);
  assert.doesNotMatch(login, /supabase\.auth\.getUser/);
});

check('customer account: email alone or a wrong password does not mint a session', () => {
  const missing = customerLoginDecision({ account: { id: 'a', password_hash: 'h' }, password: '', passwordMatches: false });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 401);
  const noHash = customerLoginDecision({ account: { id: 'a', password_hash: null }, password: 'secret123', passwordMatches: false });
  assert.equal(noHash.ok, false);
  const wrong = customerLoginDecision({ account: { id: 'a', password_hash: 'h' }, password: 'secret123', passwordMatches: false });
  assert.equal(wrong.ok, false);
  const unknown = customerLoginDecision({ account: null, password: 'secret123', passwordMatches: false });
  assert.equal(unknown.ok, false);
  const ok = customerLoginDecision({ account: { id: 'a', password_hash: 'h' }, password: 'secret123', passwordMatches: true });
  assert.equal(ok.ok, true);
  assert.equal(customerCreatePasswordError(''), 'Password must be at least 8 characters');
  assert.equal(customerCreatePasswordError('short'), 'Password must be at least 8 characters');
  assert.equal(customerCreatePasswordError('longenough'), null);
  const route = read('app/api/customer/account/route.js');
  assert.match(route, /customerLoginDecision\(/);
  assert.match(route, /customerCreatePasswordError\(password\)/);
  assert.doesNotMatch(route, /fallback-secret/);
});

check('complete-onboarding route is gone and has no callers', () => {
  assert.equal(fs.existsSync(path.join(root, 'app/api/auth/complete-onboarding/route.js')), false);
  const hits = [];
  const skip = new Set(['node_modules', '.git', '.next']);
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      if (entry.name === 'test-auth-hardening.mjs') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx|mjs|ts|tsx|md)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes('complete-onboarding') || text.includes('/api/auth/complete-onboarding')) {
          hits.push(path.relative(root, full));
        }
      }
    }
  }
  walk(root);
  assert.deepEqual(hits, []);
});

// ── Duplicate detailer emails ───────────────────────────────────────────────
check('email ilike pattern is exact and case-insensitive', () => {
  assert.equal(exactEmailIlike('  Brett@X.com '), 'brett@x.com');
  assert.equal(exactEmailIlike('a_b%c@x.com'), 'a\\_b\\%c@x.com');
});

check('detailer lookup fetches at most 2 rows, newest first', () => {
  const calls = [];
  const query = {
    ilike(col, val) { calls.push(['ilike', col, val]); return this; },
    order(col, opts) { calls.push(['order', col, opts]); return this; },
    limit(n) { calls.push(['limit', n]); return this; },
  };
  const returned = detailerEmailQuery(query, 'A_B@X.com');
  assert.equal(returned, query);
  assert.deepEqual(calls, [
    ['ilike', 'email', 'a\\_b@x.com'],
    ['order', 'updated_at', { ascending: false, nullsFirst: false }],
    ['limit', 2],
  ]);
});

check('single detailer row is used as-is, even with no password hash', () => {
  const only = { id: 'one', email: 'a@b.com', password_hash: null, updated_at: '2024-01-01T00:00:00Z' };
  const { value, logs } = captureError(() => preferredDetailer([only]));
  assert.equal(value, only);
  assert.deepEqual(logs, []);
  const resolved = captureError(() => resolveAuthDetailer([only], 'a@b.com'));
  assert.equal(resolved.value, only);
  assert.deepEqual(resolved.logs, []);
});

check('duplicates: log and pick the newest row that has a password hash', () => {
  const older = { id: 'old', password_hash: 'hash-old', updated_at: '2020-01-01T00:00:00Z' };
  const newerNoHash = { id: 'new', password_hash: null, updated_at: '2024-06-01T00:00:00Z' };
  const { value, logs } = captureError(() => resolveAuthDetailer([newerNoHash, older], 'dup@shinyjets.com'));
  assert.equal(value.id, 'old');
  assert.deepEqual(logs, [['[auth] duplicate detailers for', 'dup@shinyjets.com']]);
});

check('duplicates: newest hashed row wins when both have a password', () => {
  const older = { id: 'old', password_hash: 'hash-old', updated_at: '2020-01-01T00:00:00Z' };
  const newer = { id: 'new', password_hash: 'hash-new', updated_at: '2024-06-01T00:00:00Z' };
  assert.equal(preferredDetailer([older, newer]).id, 'new');
});

check('duplicates: newest row wins when neither has a password hash', () => {
  const older = { id: 'old', password_hash: null, updated_at: '2020-01-01T00:00:00Z' };
  const newer = { id: 'new', password_hash: '', updated_at: '2024-06-01T00:00:00Z' };
  assert.equal(preferredDetailer([older, newer]).id, 'new');
});

check('login tries each candidate hash and can match the older row', async () => {
  const older = { id: 'old', password_hash: 'correct', updated_at: '2020-01-01T00:00:00Z' };
  const newer = { id: 'new', password_hash: 'other', updated_at: '2024-06-01T00:00:00Z' };
  const matched = await matchDetailerPassword([newer, older], 'correct', compare);
  assert.equal(matched.id, 'old');
  const first = await matchDetailerPassword([newer, older], 'other', compare);
  assert.equal(first.id, 'new');
  assert.equal(await matchDetailerPassword([newer, older], 'nope', compare), null);
});

check('login skips an unreadable hash and tries the next candidate', async () => {
  const bad = { id: 'bad', password_hash: 'throw', updated_at: '2024-06-01T00:00:00Z' };
  const good = { id: 'good', password_hash: 'correct', updated_at: '2020-01-01T00:00:00Z' };
  const matched = await matchDetailerPassword([bad, good], 'correct', compare);
  assert.equal(matched.id, 'good');
});

check('duplicate log is not emitted for an empty lookup', () => {
  const { logs } = captureError(() => noteDuplicateDetailers(null, 'a@b.com'));
  assert.deepEqual(logs, []);
  assert.equal(resolveAuthDetailer(null, 'a@b.com'), null);
});

check('login and forgot-password use the shared lookup', () => {
  const login = read('app/api/auth/login/route.js');
  const forgot = read('app/api/auth/forgot-password/route.js');
  assert.match(login, /detailerEmailQuery\(/);
  assert.match(login, /matchDetailerPassword\(matches, password, comparePassword\)/);
  assert.match(login, /noteDuplicateDetailers\(matches, normalizedEmail\)/);
  assert.doesNotMatch(login, /\.single\(\)/);
  assert.match(forgot, /detailerEmailQuery\(/);
  assert.match(forgot, /resolveAuthDetailer\(matches, normalizedEmail\)/);
  assert.doesNotMatch(forgot, /\.single\(\)/);
  assert.match(read('lib/auth-detailer-lookup.js'), /console\.error\('\[auth\] duplicate detailers for', email\)/);
});

// ── Login rate limit ────────────────────────────────────────────────────────
check('login rate limit: 10 failed attempts per email per 15 minutes', () => {
  resetLoginRateLimits();
  assert.equal(LOGIN_EMAIL_FAIL_LIMIT, 10);
  assert.equal(LOGIN_FAIL_WINDOW_MS, 15 * 60 * 1000);
  for (let i = 0; i < 9; i++) recordLoginFailure('a@b.com', '1.2.3.4', 1_000);
  assert.equal(loginRateLimit('a@b.com', '1.2.3.4', 1_000).limited, false);
  recordLoginFailure('a@b.com', '1.2.3.4', 1_000);
  const blocked = loginRateLimit('a@b.com', '1.2.3.4', 1_000);
  assert.equal(blocked.limited, true);
  assert.equal(blocked.retryAfter, 15 * 60);
  assert.equal(loginRateLimit('other@b.com', '9.9.9.9', 1_000).limited, false);
  assert.equal(loginRateLimit('A@B.com', '1.2.3.4', 1_000).limited, true);
  assert.equal(loginRateLimit('a@b.com', '1.2.3.4', 1_000 + LOGIN_FAIL_WINDOW_MS).limited, false);
});

check('login rate limit: per-IP cap is independent of the email cap', () => {
  resetLoginRateLimits();
  assert.equal(LOGIN_IP_FAIL_LIMIT, 30);
  for (let i = 0; i < LOGIN_IP_FAIL_LIMIT; i++) {
    recordLoginFailure(`user${i}@b.com`, '5.5.5.5', 5_000);
  }
  assert.equal(loginRateLimit('fresh@b.com', '5.5.5.5', 5_000).limited, true);
  assert.equal(loginRateLimit('fresh@b.com', '6.6.6.6', 5_000).limited, false);
  assert.match(LOGIN_RATE_LIMIT_MESSAGE, /try again/i);
});

check('login route returns 429 with the friendly message', () => {
  const login = read('app/api/auth/login/route.js');
  assert.match(login, /loginRateLimit\(normalizedEmail, ip\)/);
  assert.match(login, /status: 429/);
  assert.match(login, /LOGIN_RATE_LIMIT_MESSAGE/);
  assert.match(login, /recordLoginFailure\(normalizedEmail, ip\)/);
  assert.match(login, /'Retry-After'/);
});

check('client ip uses the first forwarded hop', () => {
  assert.equal(clientIpFromRequest({ headers: headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }) }), '203.0.113.5');
  assert.equal(clientIpFromRequest({ headers: headers({ 'x-real-ip': '198.51.100.9' }) }), '198.51.100.9');
  assert.equal(clientIpFromRequest({ headers: headers({}) }), 'unknown');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.stack || err.message}`);
  }
}
console.log(`\nauth-hardening: ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
