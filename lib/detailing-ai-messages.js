// Detailing AI request helpers (server-only, no secrets).
//
// normalizeChatMessages(): the chat page seeds its history with an assistant
// greeting, so the raw history always *starts* with an assistant turn. The
// Anthropic Messages API rejects that ("messages: first message must use the
// \"user\" role", HTTP 400) and also rejects empty text blocks, so every request
// is normalized here before it reaches a provider:
//   - keep only user/assistant turns with non-empty string content
//   - drop assistant turns that come before the first user turn
//   - merge consecutive same-role turns
//   - keep the last `maxTurns` turns, re-trimming so the list still starts with user
//   - the list must end on a user turn (otherwise it is treated as a prefill)
//
// describeProviderError(): turns an upstream HTTP error into a short, loggable
// summary (status, error type, message, request id) and a stable reason code.

export const FRIENDLY_PROVIDER_ERROR =
  'Detailing AI is temporarily unavailable. Please try again in a minute.';
export const FRIENDLY_NOT_CONFIGURED =
  'Detailing AI is not available right now. Please try again later or contact Shiny Jets support.';

export function normalizeChatMessages(incoming, { maxTurns = 20, maxChars = 8000 } = {}) {
  const cleaned = (Array.isArray(incoming) ? incoming : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, maxChars) }))
    .filter((m) => m.content.length > 0);

  const merged = [];
  for (const m of cleaned) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${m.content}`;
    else merged.push({ ...m });
  }

  let out = merged.slice(-maxTurns);
  const firstUser = out.findIndex((m) => m.role === 'user');
  if (firstUser === -1) return [];
  out = out.slice(firstUser);
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

export function classifyProviderError(status, type = '', message = '') {
  const t = String(type || '').toLowerCase();
  const msg = String(message || '').toLowerCase();
  if (status === 401 || t === 'authentication_error') return 'invalid_api_key';
  if (status === 403 || t === 'permission_error') return 'key_permission_denied';
  if (msg.includes('credit balance') || msg.includes('billing') || msg.includes('insufficient_quota') || t === 'insufficient_quota') {
    return 'no_credits';
  }
  if (status === 404 || t === 'not_found_error' || (msg.includes('model') && msg.includes('not found'))) return 'model_not_found';
  if (status === 413 || msg.includes('prompt is too long') || msg.includes('context length') || t === 'request_too_large') {
    return 'prompt_too_long';
  }
  if (status === 429 || t === 'rate_limit_error') return 'rate_limited';
  if (status === 529 || t === 'overloaded_error') return 'overloaded';
  if (status >= 500) return 'provider_server_error';
  if (status === 400 || t === 'invalid_request_error') return 'bad_request';
  return 'provider_error';
}

export function describeProviderError(status, bodyText, requestId = null) {
  let type = null;
  let message = null;
  try {
    const parsed = JSON.parse(bodyText);
    const err = parsed?.error || {};
    type = err.type || err.code || null;
    message = err.message || null;
  } catch {
    message = String(bodyText || '').slice(0, 300) || null;
  }
  return {
    status,
    type,
    message: message ? String(message).slice(0, 500) : null,
    requestId: requestId || null,
    reason: classifyProviderError(status, type, message),
  };
}
