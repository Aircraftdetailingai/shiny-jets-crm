// AI provider fallback (Shiny Jets, Oct 4 2026).
//
// When the primary provider (Anthropic) can't answer for a reason the other provider doesn't share
// (out of credits / billing, rate limit, overloaded, 5xx, network failure), the SAME request
// (same system prompt with the protection rules + canary, same messages, same photos) is retried
// once on the fallback provider (OpenAI), if that one is configured. The route then runs the reply
// through the same brand rules and output guard whichever provider answered.
//
// Errors that the other provider would hit too, or that point at a bug or bad config on our side
// (bad request, prompt too long, invalid key, model not found), are NOT retried.
//
// Pure helper (no Next / env access); tested by scripts/test-ai-provider-fallback.mjs.

export const FALLBACK_REASONS = Object.freeze([
  'no_credits', // credit balance too low, billing, insufficient_quota, HTTP 402
  'rate_limited', // HTTP 429
  'overloaded', // HTTP 529 / overloaded_error
  'provider_server_error', // HTTP 5xx
  'network_error', // fetch failed / timed out
]);

/** True when a provider result failed for a reason the fallback provider may not share. */
export function shouldFallBack(result) {
  if (!result || !result.error) return false;
  if (result.error === 'missing_key') return true;
  return result.error === 'api_error' && FALLBACK_REASONS.includes(result.info?.reason);
}

/**
 * Call the primary provider; on a fallback-worthy failure, call the fallback provider with the same
 * request (the caller's closures capture it).
 *
 * @param {object} p
 * @param {{ name: string, call: () => Promise<object> }} p.primary
 * @param {{ name: string, call: () => Promise<object> }} p.fallback
 * @param {boolean} p.fallbackConfigured  e.g. !!process.env.OPENAI_API_KEY
 * @param {{ warn: Function }} [p.log]
 * @returns {Promise<{ result: object, provider: string, fallback: 'not_needed'|'used'|'failed'|'not_configured'|'not_retryable', primaryReason: string|null }>}
 *   result is the answering provider's { reply } or the most useful error ({ error, info }).
 */
export async function callWithFallback({ primary, fallback, fallbackConfigured, log = console }) {
  const first = await primary.call();
  if (!first?.error) return { result: first, provider: primary.name, fallback: 'not_needed', primaryReason: null };

  const primaryReason = first.info?.reason || first.error;
  if (!shouldFallBack(first)) return { result: first, provider: primary.name, fallback: 'not_retryable', primaryReason };
  if (!fallbackConfigured) {
    if (first.error !== 'missing_key') log?.warn?.(`[ai-fallback] ${primary.name} failed (${primaryReason}); no ${fallback.name} fallback configured`);
    return { result: first, provider: primary.name, fallback: 'not_configured', primaryReason };
  }

  if (first.error !== 'missing_key') log?.warn?.(`[ai-fallback] ${primary.name} failed (${primaryReason}); retrying the same request with ${fallback.name}`);
  const second = await fallback.call();
  if (!second?.error) return { result: second, provider: fallback.name, fallback: 'used', primaryReason };
  log?.warn?.(`[ai-fallback] ${fallback.name} fallback failed too (${second.info?.reason || second.error})`);
  // Both providers missing a key = not configured; otherwise report the fallback's error.
  const result = first.error === 'missing_key' && second.error === 'missing_key' ? first : second;
  return { result, provider: fallback.name, fallback: 'failed', primaryReason };
}
