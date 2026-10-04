/**
 * Detailing AI: when to retry a failed Anthropic chat once on OpenAI.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-provider-fallback.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import {
  describeProviderError,
  shouldFallbackToOpenAI,
  resolveDetailingProvider,
  FRIENDLY_PROVIDER_ERROR,
} from '../lib/detailing-ai-messages.js';

const tests = [];
function check(name, fn) { tests.push([name, fn]); }

function apiError(status, type, message) {
  const body = JSON.stringify({ type: 'error', error: { type, message } });
  return { error: 'api_error', info: describeProviderError(status, body) };
}

const withKey = { openaiConfigured: true };
const noKey = { openaiConfigured: false };

check('billing, auth, rate limit, overload, and 5xx fall back only when an OpenAI key is set', () => {
  const cases = [
    apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
    apiError(400, 'invalid_request_error', 'Please update your billing details.'),
    apiError(402, 'invalid_request_error', 'Payment required'),
    apiError(401, 'authentication_error', 'invalid x-api-key'),
    apiError(403, 'permission_error', 'key not allowed'),
    apiError(429, 'rate_limit_error', 'slow down'),
    apiError(500, 'api_error', 'internal'),
    apiError(502, 'api_error', 'bad gateway'),
    apiError(503, 'api_error', 'unavailable'),
    apiError(529, 'overloaded_error', 'Overloaded'),
    { error: 'api_error', info: describeProviderError(502, '<html>bad gateway</html>') },
    { error: 'api_error', info: describeProviderError(429, JSON.stringify({ error: { code: 'insufficient_quota', message: 'insufficient_quota' } })) },
  ];
  for (const result of cases) {
    assert.equal(shouldFallbackToOpenAI(result, withKey), true, JSON.stringify(result.info));
    assert.equal(shouldFallbackToOpenAI(result, noKey), false, JSON.stringify(result.info));
  }
});

check('bad requests, missing models, overlong prompts, and network errors do not fall back', () => {
  const cases = [
    apiError(400, 'invalid_request_error', 'messages: first message must use the "user" role'),
    apiError(404, 'not_found_error', 'model: claude-x'),
    apiError(413, 'request_too_large', 'prompt is too long: 250000 tokens > 200000 maximum'),
    { error: 'api_error', info: { status: 0, type: 'network_error', message: 'fetch failed', reason: 'network_error' } },
    { error: 'missing_key' },
    { reply: 'Use a wool pad on the leading edge.' },
    null,
  ];
  for (const result of cases) {
    assert.equal(shouldFallbackToOpenAI(result, withKey), false, JSON.stringify(result));
  }
});

check('a bare 5xx or 401 still falls back when the body did not classify', () => {
  assert.equal(shouldFallbackToOpenAI({ error: 'api_error', info: { status: 500 } }, withKey), true);
  assert.equal(shouldFallbackToOpenAI({ error: 'api_error', info: { status: 401 } }, withKey), true);
  assert.equal(shouldFallbackToOpenAI({ error: 'api_error', info: { status: 403 } }, withKey), true);
  assert.equal(shouldFallbackToOpenAI({ error: 'api_error', info: { status: 504, reason: 'provider_error' } }, withKey), true);
});

check('Anthropic success never calls OpenAI', async () => {
  let openai = 0;
  const completion = await resolveDetailingProvider({
    anthropicConfigured: true,
    openaiConfigured: true,
    callAnthropic: async () => ({ reply: 'from anthropic' }),
    callOpenAI: async () => { openai += 1; return { reply: 'from openai' }; },
  });
  assert.equal(openai, 0);
  assert.equal(completion.provider, 'anthropic');
  assert.equal(completion.fallback, false);
  assert.equal(completion.result.reply, 'from anthropic');
});

check('an eligible Anthropic failure retries OpenAI once with the same request', async () => {
  const request = {
    system: 'system prompt + protection + canary',
    messages: [{ role: 'user', content: 'oxidation on a King Air' }],
    images: [{ media_type: 'image/jpeg' }],
  };
  let anthropic = 0;
  const seen = [];
  const completion = await resolveDetailingProvider({
    anthropicConfigured: true,
    openaiConfigured: true,
    callAnthropic: async () => {
      anthropic += 1;
      return apiError(529, 'overloaded_error', 'Overloaded');
    },
    callOpenAI: async () => {
      seen.push(request);
      return { reply: 'Finish with a soft pad.' };
    },
  });
  assert.equal(anthropic, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], request);
  assert.equal(completion.provider, 'openai');
  assert.equal(completion.fallback, true);
  assert.equal(completion.result.reply, 'Finish with a soft pad.');
  assert.equal(completion.anthropicError.reason, 'overloaded');
  assert.equal(completion.anthropicError.status, 529);
  assert.ok(!JSON.stringify(completion).includes('sk-') && !JSON.stringify(completion).includes('API_KEY'));
});

check('ineligible Anthropic failures and a missing OpenAI key are not retried', async () => {
  let openai = 0;
  const callOpenAI = async () => { openai += 1; return { reply: 'nope' }; };
  const bad = await resolveDetailingProvider({
    anthropicConfigured: true,
    openaiConfigured: true,
    callAnthropic: async () => apiError(400, 'invalid_request_error', 'messages: first message must use the "user" role'),
    callOpenAI,
  });
  assert.equal(openai, 0);
  assert.equal(bad.provider, null);
  assert.equal(bad.fallback, false);
  assert.equal(bad.result.info.reason, 'bad_request');

  const noOpenAI = await resolveDetailingProvider({
    anthropicConfigured: true,
    openaiConfigured: false,
    callAnthropic: async () => apiError(401, 'authentication_error', 'invalid x-api-key'),
    callOpenAI,
  });
  assert.equal(openai, 0);
  assert.equal(noOpenAI.fallback, false);
  assert.equal(noOpenAI.result.info.reason, 'invalid_api_key');
});

check('when both providers fail, the OpenAI error is returned and nobody is marked as answering', async () => {
  let openai = 0;
  const completion = await resolveDetailingProvider({
    anthropicConfigured: true,
    openaiConfigured: true,
    callAnthropic: async () => apiError(500, 'api_error', 'upstream down'),
    callOpenAI: async () => {
      openai += 1;
      return apiError(429, 'rate_limit_error', 'slow down');
    },
  });
  assert.equal(openai, 1);
  assert.equal(completion.provider, null);
  assert.equal(completion.fallback, true);
  assert.equal(completion.result.error, 'api_error');
  assert.equal(completion.result.info.reason, 'rate_limited');
  assert.equal(completion.anthropicError.reason, 'provider_server_error');
});

check('with no Anthropic key, OpenAI is the only call; with neither key, nothing is called', async () => {
  let anthropic = 0;
  let openai = 0;
  const onlyOpenAI = await resolveDetailingProvider({
    anthropicConfigured: false,
    openaiConfigured: true,
    callAnthropic: async () => { anthropic += 1; return { reply: 'a' }; },
    callOpenAI: async () => { openai += 1; return { reply: 'from openai' }; },
  });
  assert.equal(anthropic, 0);
  assert.equal(openai, 1);
  assert.equal(onlyOpenAI.provider, 'openai');
  assert.equal(onlyOpenAI.fallback, false);

  const none = await resolveDetailingProvider({
    anthropicConfigured: false,
    openaiConfigured: false,
    callAnthropic: async () => { anthropic += 1; return { reply: 'a' }; },
    callOpenAI: async () => { openai += 1; return { reply: 'b' }; },
  });
  assert.equal(anthropic, 0);
  assert.equal(openai, 1);
  assert.equal(none.result.error, 'missing_key');
  assert.equal(none.provider, null);
});

check('chat route sends the fallback through the same system prompt, brand rules, and output guard', () => {
  const src = fs.readFileSync(new URL('../app/api/detailing-ai/chat/route.js', import.meta.url), 'utf8');
  const protectAt = src.indexOf('protectionPrompt(canary');
  const providerAt = src.indexOf('resolveDetailingProvider({');
  const brandAt = src.indexOf('applyBrandRules(');
  const guardAt = src.indexOf('guardOutput(brandSafe');
  assert.ok(protectAt > 0 && providerAt > protectAt, 'protection prompt is part of the system string before either provider');
  assert.ok(brandAt > providerAt && guardAt > brandAt, 'brand rules and guardOutput run after the provider, for either answer');
  assert.match(src, /callAnthropic: \(\) => callAnthropic\(\{ system, messages: recent, images \}\)/);
  assert.match(src, /callOpenAI: \(\) => callOpenAI\(\{ system, messages: recent, images \}\)/);
  assert.match(src, /OPENAI_MODEL = process\.env\.OPENAI_MODEL \|\| 'gpt-5\.6-luna'/);
  assert.match(src, /max_completion_tokens: LIMITS\.maxOutputTokens/);
  assert.match(src, /withOpenAIPhotos\(messages, images\)/);
  assert.match(src, /reply: FRIENDLY_PROVIDER_ERROR/);
  assert.equal(FRIENDLY_PROVIDER_ERROR.includes('API_KEY'), false);

  const between = src.slice(providerAt, guardAt);
  const logs = [...between.matchAll(/console\.(?:log|error)\([\s\S]*?\);/g)].map((m) => m[0]);
  assert.ok(logs.length >= 2, 'logs the retry and which provider answered');
  for (const line of logs) {
    assert.doesNotMatch(line, /API_KEY|Bearer|x-api-key|sk-/);
    assert.doesNotMatch(line, /anthropicError\?\.message|info\.message/);
  }
  assert.match(between, /provider answered/);
  assert.match(between, /provider: completion\.provider/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${name}\n  ${err.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
