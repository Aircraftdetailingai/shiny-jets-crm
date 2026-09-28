/**
 * Detailing AI request-shape + error-message tests.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-messages.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import {
  normalizeChatMessages,
  describeProviderError,
  FRIENDLY_PROVIDER_ERROR,
  FRIENDLY_NOT_CONFIGURED,
} from '../lib/detailing-ai-messages.js';

let failed = 0;
let total = 0;
function check(name, fn) {
  total += 1;
  try { fn(); console.log(`PASS ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.message}`); }
}

const GREETING = { role: 'assistant', content: "I'm Detailing AI — diagnostic help ..." };

check('leading assistant greeting is dropped (Anthropic requires first turn = user)', () => {
  const out = normalizeChatMessages([GREETING, { role: 'user', content: 'Oxidation on a King Air' }]);
  assert.deepEqual(out, [{ role: 'user', content: 'Oxidation on a King Air' }]);
});

check('consecutive same-role turns are merged; roles alternate; ends on user', () => {
  const out = normalizeChatMessages([
    GREETING,
    { role: 'user', content: 'a' },
    { role: 'user', content: 'b' },
    { role: 'assistant', content: 'c' },
    { role: 'assistant', content: 'd' },
    { role: 'user', content: 'e' },
  ]);
  assert.deepEqual(out.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(out[0].content, 'a\n\nb');
  assert.equal(out[1].content, 'c\n\nd');
});

check('empty / whitespace / non-string / system turns are removed', () => {
  const out = normalizeChatMessages([
    { role: 'system', content: 'x' },
    { role: 'user', content: '   ' },
    { role: 'assistant', content: '' },
    { role: 'user', content: 42 },
    null,
    { role: 'user', content: 'real question' },
  ]);
  assert.deepEqual(out, [{ role: 'user', content: 'real question' }]);
});

check('trailing assistant turn is dropped; greeting-only history is empty', () => {
  assert.deepEqual(normalizeChatMessages([GREETING]), []);
  const out = normalizeChatMessages([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }]);
  assert.deepEqual(out.map((m) => m.role), ['user']);
});

check('turn cap keeps the newest turns and still starts with user', () => {
  const hist = [GREETING];
  for (let i = 0; i < 30; i += 1) {
    hist.push({ role: 'user', content: `u${i}` }, { role: 'assistant', content: `a${i}` });
  }
  hist.push({ role: 'user', content: 'last' });
  const out = normalizeChatMessages(hist, { maxTurns: 20 });
  assert.ok(out.length <= 20);
  assert.equal(out[0].role, 'user');
  assert.equal(out[out.length - 1].content, 'last');
  for (let i = 1; i < out.length; i += 1) assert.notEqual(out[i].role, out[i - 1].role);
});

check('long content is truncated to maxChars', () => {
  const out = normalizeChatMessages([{ role: 'user', content: 'x'.repeat(9000) }], { maxChars: 8000 });
  assert.equal(out[0].content.length, 8000);
});

check('provider errors are classified from status + Anthropic error body', () => {
  const body = (type, message) => JSON.stringify({ type: 'error', error: { type, message } });
  assert.equal(describeProviderError(401, body('authentication_error', 'invalid x-api-key')).reason, 'invalid_api_key');
  assert.equal(describeProviderError(400, body('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')).reason, 'no_credits');
  assert.equal(describeProviderError(404, body('not_found_error', 'model: claude-x')).reason, 'model_not_found');
  assert.equal(describeProviderError(400, body('invalid_request_error', 'prompt is too long: 250000 tokens > 200000 maximum')).reason, 'prompt_too_long');
  assert.equal(describeProviderError(429, body('rate_limit_error', 'slow down')).reason, 'rate_limited');
  assert.equal(describeProviderError(529, body('overloaded_error', 'Overloaded')).reason, 'overloaded');
  assert.equal(describeProviderError(400, body('invalid_request_error', 'messages: first message must use the "user" role')).reason, 'bad_request');
  const d = describeProviderError(401, body('authentication_error', 'invalid x-api-key'), 'req_123');
  assert.equal(d.requestId, 'req_123');
  assert.equal(d.type, 'authentication_error');
  assert.equal(describeProviderError(502, '<html>bad gateway</html>').reason, 'provider_server_error');
});

check('user-facing messages never mention env var names or API keys', () => {
  for (const msg of [FRIENDLY_PROVIDER_ERROR, FRIENDLY_NOT_CONFIGURED]) {
    assert.ok(!/API_KEY|ANTHROPIC|OPENAI|env|api key/i.test(msg), msg);
  }
  const route = fs.readFileSync(new URL('../app/api/detailing-ai/chat/route.js', import.meta.url), 'utf8');
  const replies = [...route.matchAll(/reply:\s*(['"`])([\s\S]*?)\1/g)].map((m) => m[2]);
  for (const r of replies) assert.ok(!/API_KEY|in env/i.test(r), `route reply leaks config detail: ${r}`);
  assert.ok(route.includes('normalizeChatMessages('), 'route must normalize messages before calling the provider');
});

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
