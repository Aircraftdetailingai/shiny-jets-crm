// Provider fallback (Oct 4 2026): Anthropic credit / billing / 429 / 529 / 5xx / network failures
// retry the same request on OpenAI when an OpenAI key is set. Run: npm test
import fs from 'fs';
import assert from 'assert/strict';
import { callWithFallback, shouldFallBack, FALLBACK_REASONS } from '../lib/ai-provider-fallback.js';
import { describeProviderError, FRIENDLY_PROVIDER_ERROR } from '../lib/detailing-ai-messages.js';

const tests = [];
const check = (n, f) => tests.push([n, f]);
const quiet = { warn: () => {} };
const apiErr = (status, type, message) => ({ error: 'api_error', info: describeProviderError(status, JSON.stringify({ type: 'error', error: { type, message } })) });
const provider = (name, out) => {
  const p = { name, calls: 0, call: async () => { p.calls += 1; return typeof out === 'function' ? out() : out; } };
  return p;
};

check('fallback-worthy reasons: credits, billing, 402, 429, 529, 5xx, network', () => {
  assert.deepEqual([...FALLBACK_REASONS].sort(), ['network_error', 'no_credits', 'overloaded', 'provider_server_error', 'rate_limited']);
  for (const r of [
    apiErr(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'),
    apiErr(400, 'invalid_request_error', 'Billing issue on this account'),
    apiErr(402, 'payment_required', 'Payment required'),
    apiErr(429, 'rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit'),
    apiErr(529, 'overloaded_error', 'Overloaded'),
    apiErr(500, 'api_error', 'Internal server error'),
    apiErr(503, 'api_error', 'Service unavailable'),
    { error: 'api_error', info: { reason: 'network_error' } },
    { error: 'missing_key' },
  ]) assert.ok(shouldFallBack(r), JSON.stringify(r));
  for (const r of [
    apiErr(400, 'invalid_request_error', 'prompt is too long: 250000 tokens > 200000 maximum'),
    apiErr(400, 'invalid_request_error', 'messages: first message must use the "user" role'),
    apiErr(401, 'authentication_error', 'invalid x-api-key'),
    apiErr(404, 'not_found_error', 'model: claude-x'),
    { reply: 'ok' },
  ]) assert.ok(!shouldFallBack(r), JSON.stringify(r));
});

check('primary answers: fallback not called', async () => {
  const a = provider('anthropic', { reply: 'Use Quick Turn.' });
  const o = provider('openai', { reply: 'other' });
  const r = await callWithFallback({ primary: a, fallback: o, fallbackConfigured: true, log: quiet });
  assert.equal(r.result.reply, 'Use Quick Turn.');
  assert.equal(r.fallback, 'not_needed');
  assert.equal(o.calls, 0);
});

check('out of credits + OpenAI key: same request answered by OpenAI', async () => {
  const a = provider('anthropic', apiErr(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'));
  const o = provider('openai', { reply: 'Fallback answer.' });
  const r = await callWithFallback({ primary: a, fallback: o, fallbackConfigured: true, log: quiet });
  assert.deepEqual([r.result.reply, r.provider, r.fallback, r.primaryReason, a.calls, o.calls], ['Fallback answer.', 'openai', 'used', 'no_credits', 1, 1]);
});

check('overloaded / rate limit / 5xx all fall back', async () => {
  for (const err of [apiErr(529, 'overloaded_error', 'Overloaded'), apiErr(429, 'rate_limit_error', 'slow down'), apiErr(502, 'api_error', 'bad gateway')]) {
    const o = provider('openai', { reply: 'ok' });
    const r = await callWithFallback({ primary: provider('anthropic', err), fallback: o, fallbackConfigured: true, log: quiet });
    assert.equal(r.fallback, 'used');
    assert.equal(o.calls, 1);
  }
});

check('no OpenAI key: the primary error is returned, fallback not called', async () => {
  const o = provider('openai', { reply: 'x' });
  const r = await callWithFallback({ primary: provider('anthropic', apiErr(529, 'overloaded_error', 'Overloaded')), fallback: o, fallbackConfigured: false, log: quiet });
  assert.deepEqual([r.fallback, r.result.info.reason, o.calls], ['not_configured', 'overloaded', 0]);
});

check('non-retryable errors (bad request, prompt too long, bad key) are not retried', async () => {
  const o = provider('openai', { reply: 'x' });
  const r = await callWithFallback({ primary: provider('anthropic', apiErr(400, 'invalid_request_error', 'prompt is too long: 250000 tokens > 200000 maximum')), fallback: o, fallbackConfigured: true, log: quiet });
  assert.deepEqual([r.fallback, r.result.info.reason, o.calls], ['not_retryable', 'prompt_too_long', 0]);
});

check('both fail: fallback error returned; no Anthropic key: OpenAI used directly', async () => {
  const r = await callWithFallback({ primary: provider('anthropic', apiErr(500, 'api_error', 'x')), fallback: provider('openai', apiErr(429, 'rate_limit_error', 'quota')), fallbackConfigured: true, log: quiet });
  assert.deepEqual([r.fallback, r.provider, r.result.info.reason], ['failed', 'openai', 'rate_limited']);
  const r2 = await callWithFallback({ primary: provider('anthropic', { error: 'missing_key' }), fallback: provider('openai', { reply: 'hi' }), fallbackConfigured: true, log: quiet });
  assert.deepEqual([r2.fallback, r2.result.reply], ['used', 'hi']);
});

check('friendly error message: no provider / key / env names, gives a next step', () => {
  assert.ok(!/API_KEY|ANTHROPIC|OPENAI|Claude|GPT|env|api key|credit/i.test(FRIENDLY_PROVIDER_ERROR), FRIENDLY_PROVIDER_ERROR);
  assert.match(FRIENDLY_PROVIDER_ERROR, /try again/i);
  assert.match(FRIENDLY_PROVIDER_ERROR, /hello@shinyjets\.com/);
});

check('route wiring: same system prompt + turns + photos to both providers; brand rules + guard after', () => {
  const route = fs.readFileSync(new URL('../app/api/detailing-ai/chat/route.js', import.meta.url), 'utf8');
  assert.ok(route.includes("primary: { name: 'anthropic', call: () => callAnthropic({ system, messages: recent, images }) }"));
  assert.ok(route.includes("fallback: { name: 'openai', call: () => callOpenAI({ system, messages: recent, images }) }"));
  assert.ok(route.includes('fallbackConfigured: !!process.env.OPENAI_API_KEY'));
  // The protection prompt is part of `system`, which both providers receive.
  assert.match(route, /const system = SYSTEM_PROMPT[^;]*\+ protection \+/);
  // Everything after the provider call works on `result.reply`, whichever provider answered.
  const at = (s) => { const i = route.indexOf(s); assert.ok(i > 0, s); return i; };
  const callAt = at('await callWithFallback(');
  assert.ok(at('const rupesSafe =') > callAt);
  assert.ok(at('applyBrandRules(compoundSafe, messages)') > callAt);
  assert.ok(at('const guard = guardOutput(brandSafe') > callAt);
  assert.ok(!/result = await callAnthropic|result = await callOpenAI/.test(route), 'no direct single-provider call left');
});

let failed = 0;
for (const [n, f] of tests) { try { await f(); console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n  ${e.message}`); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
