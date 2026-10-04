/**
 * Required password change after a temporary-password login.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-set-password.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { comparePassword, createToken, hashPassword } from '../lib/auth.js';
import {
  applySetPassword,
  destinationAfterPasswordChange,
  passwordChangeDecision,
  postLoginPath,
  readTokenPasswordChangeFlag,
  sessionTokenClaims,
  validateSetPasswordInput,
} from '../lib/password-change.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-for-set-password';

const tests = [];
const check = (name, fn) => tests.push([name, fn]);

const tempPassword = 'TempPass12';
let tempHash;
const newPassword = 'newpassword1';

function account(overrides = {}) {
  return {
    id: 'user-a',
    email: 'buyer@shop.com',
    password_hash: tempHash,
    must_change_password: true,
    onboarding_complete: false,
    onboarding_completed: null,
    ...overrides,
  };
}

function harness(body, { sessionUser = { id: 'user-a', email: 'buyer@shop.com' }, row = account(), failSave = false } = {}) {
  const calls = { fetched: [], saved: [] };
  return {
    calls,
    run: () => applySetPassword({
      sessionUser,
      body,
      fetchAccount: async (id) => {
        calls.fetched.push(id);
        if (!row || row.id !== id) return { account: null };
        return { account: row };
      },
      savePassword: async (id, fields) => {
        calls.saved.push({ id, fields });
        if (failSave) return { ok: false };
        return { ok: true };
      },
      comparePassword,
      hashPassword,
      createToken,
    }),
  };
}

check('no session = 401 and the account is not read', async () => {
  const h = harness({ password: newPassword, confirm: newPassword }, { sessionUser: null });
  const result = await h.run();
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'Unauthorized');
  assert.equal(result.token, undefined);
  assert.deepEqual(h.calls.fetched, []);
  assert.deepEqual(h.calls.saved, []);

  const missingId = harness({ password: newPassword, confirm: newPassword }, { sessionUser: { email: 'buyer@shop.com' } });
  const again = await missingId.run();
  assert.equal(again.status, 401);
  assert.deepEqual(missingId.calls.fetched, []);

  const route = read('app/api/auth/set-password/route.js');
  assert.match(route, /const sessionUser = await getAuthUser\(request\)/);
  assert.match(route, /if \(!sessionUser\?\.id\)/);
  assert.match(route, /status: 401/);
  assert.doesNotMatch(route, /body\.userId/);
  assert.doesNotMatch(route, /body\.id/);
  assert.match(route, /hashPassword/);
  assert.match(route, /must_change_password: false/);
  assert.match(route, /\.eq\('id', id\)/);
  assert.match(route, /getAuthUser\(request\)/);
});

check('another user id on the body is ignored', async () => {
  const h = harness({
    password: newPassword,
    confirm: newPassword,
    userId: 'user-b',
    id: 'user-b',
    email: 'other@evil.com',
  });
  const result = await h.run();
  assert.equal(result.status, 200);
  assert.deepEqual(h.calls.fetched, ['user-a']);
  assert.equal(h.calls.saved.length, 1);
  assert.equal(h.calls.saved[0].id, 'user-a');
  assert.equal(h.calls.saved[0].fields.must_change_password, false);
  const claims = sessionTokenClaims({ id: 'user-a', email: 'buyer@shop.com', must_change_password: false });
  assert.deepEqual(claims, { id: 'user-a', email: 'buyer@shop.com' });
  assert.equal(readTokenPasswordChangeFlag(result.token), false);
  assert.equal(await comparePassword(newPassword, h.calls.saved[0].fields.password_hash), true);
  assert.equal(await comparePassword(tempPassword, h.calls.saved[0].fields.password_hash), false);
});

check('short password is rejected and nothing is saved', async () => {
  const empty = await harness({ password: '', confirm: '' }).run();
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, 'Enter a new password.');
  for (const password of ['short', '1234567']) {
    const h = harness({ password, confirm: password });
    const result = await h.run();
    assert.equal(result.status, 400, `expected 400 for ${JSON.stringify(password)}`);
    assert.equal(result.body.error, 'Password must be at least 8 characters.');
    assert.deepEqual(h.calls.saved, []);
  }
  const mismatch = await harness({ password: newPassword, confirm: 'different1' }).run();
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error, 'Passwords do not match.');
  assert.equal(validateSetPasswordInput({ password: '12345678', confirm: '12345678' }), null);
});

check('reusing the temporary password is rejected', async () => {
  const h = harness({ password: tempPassword, confirm: tempPassword });
  const result = await h.run();
  assert.equal(result.status, 400);
  assert.match(result.body.error, /temporary password/i);
  assert.deepEqual(h.calls.saved, []);
});

check('flag is cleared on success and the next step follows onboarding', async () => {
  const needsSetup = harness({ password: newPassword, confirm: newPassword });
  const first = await needsSetup.run();
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);
  assert.equal(first.body.must_change_password, false);
  assert.equal(first.body.redirect, '/onboarding');
  assert.equal(needsSetup.calls.saved[0].fields.must_change_password, false);
  assert.equal(first.body.password_hash, undefined);

  const done = harness(
    { password: newPassword, confirm: newPassword, next: '/detailing-ai' },
    { row: account({ onboarding_complete: true }) },
  );
  const second = await done.run();
  assert.equal(second.body.redirect, '/detailing-ai');
  assert.equal(second.body.onboarding_complete, true);

  const finishedElsewhere = harness(
    { password: newPassword, confirm: newPassword, next: 'https://evil.example/phish' },
    { row: account({ onboarding_complete: false, onboarding_completed: true }) },
  );
  const third = await finishedElsewhere.run();
  assert.equal(third.body.redirect, '/dashboard');

  assert.equal(destinationAfterPasswordChange({ onboarding_complete: false }, '/detailing-ai'), '/onboarding');
  assert.equal(destinationAfterPasswordChange({ onboarding_complete: null }), '/onboarding');
});

check('an account that already changed its password is not written again', async () => {
  const h = harness(
    { password: newPassword, confirm: newPassword, userId: 'user-b' },
    { row: account({ must_change_password: false, onboarding_complete: true }) },
  );
  const result = await h.run();
  assert.equal(result.status, 200);
  assert.equal(result.body.already_set, true);
  assert.equal(result.body.redirect, '/dashboard');
  assert.deepEqual(h.calls.saved, []);
  assert.equal(readTokenPasswordChangeFlag(result.token), false);
});

check('redirect gating sends app pages back and leaves logout open', () => {
  const gate = (pathname, destination) => passwordChangeDecision({
    pathname,
    mustChangePassword: true,
    destination,
  });
  assert.deepEqual(gate('/dashboard'), { type: 'redirect', location: '/set-password' });
  assert.deepEqual(gate('/onboarding'), { type: 'redirect', location: '/set-password' });
  assert.deepEqual(gate('/settings'), { type: 'redirect', location: '/set-password' });
  assert.deepEqual(gate('/admin'), { type: 'redirect', location: '/set-password' });
  assert.deepEqual(gate('/detailing-ai'), { type: 'redirect', location: '/set-password?next=%2Fdetailing-ai' });
  assert.deepEqual(gate('/customers/abc'), { type: 'redirect', location: '/set-password' });
  assert.deepEqual(gate('/set-password'), { type: 'allow' });
  assert.deepEqual(gate('/login'), { type: 'allow' });
  assert.deepEqual(gate('/api/auth/logout'), { type: 'allow' });
  assert.deepEqual(gate('/api/auth/set-password'), { type: 'allow' });
  assert.deepEqual(gate('/api/auth/login'), { type: 'allow' });
  assert.deepEqual(gate('/api/onboarding'), { type: 'forbidden' });
  assert.deepEqual(gate('/api/user/me'), { type: 'forbidden' });
  assert.deepEqual(gate('/logos/shiny-jets-dark.png', 'image'), { type: 'allow' });
  assert.equal(passwordChangeDecision({ pathname: '/dashboard', mustChangePassword: false }).type, 'allow');
  assert.equal(passwordChangeDecision({ pathname: '/dashboard', mustChangePassword: null }).type, 'allow');

  const middleware = read('middleware.js');
  assert.match(middleware, /passwordChangeDecision\(/);
  assert.match(middleware, /payload\.must_change_password === true/);
  assert.match(middleware, /NextResponse\.redirect/);
  assert.match(middleware, /status: 403/);

  const login = read('app/login/page.jsx');
  assert.match(login, /postLoginPath\(/);
  assert.match(login, /\/set-password/);
  assert.equal(postLoginPath({ mustChangePassword: true, onboardingComplete: false, next: '/detailing-ai' }), '/set-password?next=%2Fdetailing-ai');
  assert.equal(postLoginPath({ mustChangePassword: true, onboardingComplete: true }), '/set-password');
  assert.equal(postLoginPath({ mustChangePassword: false, onboardingComplete: false }), '/onboarding');
  assert.equal(postLoginPath({ mustChangePassword: false, onboardingComplete: true, next: '/detailing-ai' }), '/detailing-ai');
  assert.equal(postLoginPath({ mustChangePassword: false, onboardingComplete: true, next: '/admin' }), '/dashboard');

  const page = read('app/set-password/page.jsx');
  assert.match(page, /Set your password/);
  assert.match(page, /id="new-password"/);
  assert.match(page, /id="confirm-password"/);
  assert.match(page, /htmlFor=\{id\}/);
  assert.match(page, /role="alert"/);
  assert.match(page, /aria-invalid/);
  assert.match(page, /Show \$\{label/);
  assert.match(page, /\/api\/auth\/logout/);
  assert.match(page, /at least 8 characters/);
});

check('login stamps must_change_password only when the row says so', async () => {
  const login = read('app/api/auth/login/route.js');
  assert.match(login, /createToken\(sessionTokenClaims\(data\)\)/);
  assert.match(login, /must_change_password: data\.must_change_password/);
  const flagged = sessionTokenClaims({ id: 'user-a', email: 'buyer@shop.com', must_change_password: true });
  assert.equal(flagged.must_change_password, true);
  const plain = sessionTokenClaims({ id: 'user-a', email: 'buyer@shop.com', must_change_password: false });
  assert.equal(plain.must_change_password, undefined);
  const token = await createToken(flagged);
  assert.equal(readTokenPasswordChangeFlag(token), true);
  assert.equal(readTokenPasswordChangeFlag(await createToken(plain)), false);
});

async function main() {
  tempHash = await hashPassword(tempPassword);
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(err);
    }
  }
  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log(`\n${tests.length} passed`);
}

main();
