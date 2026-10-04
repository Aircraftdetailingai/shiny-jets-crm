/**
 * Auth hardening: OAuth session minting must use a verified Supabase user,
 * login failures are rate limited, and duplicate detailers emails still resolve.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-auth-hardening.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { identityFromSupabaseUser, readBearerToken } from '../lib/oauth-identity.js';
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

check('oauth-complete verifies the bearer token and ignores body email', () => {
  const route = read('app/api/auth/oauth-complete/route.js');
  assert.match(route, /readBearerToken\(request\.headers\.get\('authorization'\)\)/);
  assert.match(route, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(route, /identityFromSupabaseUser\(verified\?\.user\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /const \{ email, oauth_id \} = identity/);
  assert.doesNotMatch(route, /body\.email/);
  assert.doesNotMatch(route, /body\.oauth_id/);
  assert.match(route, /return Response\.json\(\{ token, user, redirect \}\)/);
});

check('Google callback sends the Supabase access token', () => {
  const page = read('app/auth/callback/page.jsx');
  assert.match(page, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(page, /session\?\.access_token/);
  assert.match(page, /localStorage\.setItem\('vector_token', result\.token\)/);
  assert.match(page, /window\.location\.href = result\.redirect \|\| '\/dashboard'/);
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
