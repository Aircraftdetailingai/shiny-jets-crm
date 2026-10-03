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

// ---------------------------------------------------------------------------
// Rupes brand scrub (Brett, Sep 28 2026: "never ever ever mention Rupes product").
// Used by the knowledge loader (every excerpt, public + private rows, at load time — the DB is
// never edited), by scripts that clean the private source files, and by the chat route's output
// guard (only when the user did not ask about Rupes).
// ---------------------------------------------------------------------------
const RUPES_MODEL = String.raw`(?:bigfoot|lhr|lk|mille|nano|ibrid|mark\s*(?:ii|iii|2|3))[\w-]*(?:\.\d+)?`;
const RUPES_RULES = [
  [/\bmini\s+rupes\s+nano\s+ibrid\b/gi, 'mini DA polisher'],
  [/\brupes(?:['’]s?)?\s+blue\s+wool(?:\s+pads?)?\b/gi, 'wool cutting pad'],
  // "Rupes 3"" / "Rupes Bigfoot LHR15 5"" -> "3"" / "5"" (size stays, brand goes)
  [new RegExp(String.raw`\brupes(?:['’]s?)?\s+(?:${RUPES_MODEL}\s+)*(?=\d)`, 'gi'), ''],
  // "Rupes Bigfoot LHR15" / "Rupes Mille" -> "DA polisher"
  [new RegExp(String.raw`\brupes(?:['’]s?)?(?:\s+${RUPES_MODEL})+`, 'gi'), 'DA polisher'],
  [new RegExp(String.raw`\bbigfoot(?:\s+${RUPES_MODEL})*\b`, 'gi'), 'DA polisher'],
  // "Rupes yellow foam pad" -> "yellow foam pad"; "The Rupes pads" -> "The pads"
  [/\brupes(?:['’]s?)?[ \t]+/gi, ''],
  [/\brupes\b(?:['’]s?)?/gi, ''],
];

// True when position `offset` of `str` starts a sentence / list item / line.
function atSentenceStart(str, offset) {
  const before = str.slice(0, offset).replace(/[ \t"'*(_]+$/, '');
  return before === '' || /[.!?:\n]$/.test(before) || /(^|\n)[ \t]*(?:[-*•]|\d+[.)])$/.test(before);
}

export function scrubRupes(text) {
  let out = String(text ?? '');
  if (!/rupes|bigfoot/i.test(out)) return out;
  for (const [re, rep] of RUPES_RULES) {
    out = out.replace(re, (m, ...args) => {
      const str = args[args.length - 1];
      const offset = args[args.length - 2];
      if (!atSentenceStart(str, offset)) return rep;
      if (rep) return rep[0].toUpperCase() + rep.slice(1);
      // Removed a sentence-initial brand word: capitalize the word that now starts the sentence.
      return '\u0000CAP';
    });
    out = out.replace(/\u0000CAP(.)/g, (m, c) => c.toUpperCase()).replace(/\u0000CAP/g, '');
  }
  return out;
}

export function mentionsRupes(text) {
  return /\brupes\b|\bbigfoot\b/i.test(String(text ?? ''));
}

// True when the latest user message, or one of the recent user turns, asked about Rupes.
export function userAskedAboutRupes(messages, recentUserTurns = 3) {
  const users = (Array.isArray(messages) ? messages : []).filter((m) => m?.role === 'user');
  return users.slice(-recentUserTurns).some((m) => mentionsRupes(m.content));
}

// ---------------------------------------------------------------------------
// "Fly Shiny Compound Pro" does not exist (Brett, Oct 3 2026: there NEVER was a product by that
// name). Never mention or recommend it. Used by the knowledge loader (every excerpt, public +
// private rows, at load time) and by the chat route's output guard / quote-line scrub.
// ---------------------------------------------------------------------------
// Matches "Fly Shiny Compound Pro", "FlyShiny Compound Pro", "Shiny Compound Pro", "Compound Pro",
// "compound-pro", and a bare "Fly Shiny Compound" (no such product either). "compound product" is safe.
const COMPOUND_PRO_SOURCE = String.raw`\b(?:fly[\s_-]*)?(?:shiny[\s_-]*)?compound[\s_-]*pro\b|\bfly[\s_-]*shiny[\s_-]*compound\b`;
const COMPOUND_PRO_TEST = new RegExp(COMPOUND_PRO_SOURCE, 'i');

export const COMPOUND_PRO_EXCERPT_MARKER = '[non-existent product removed]';

export function mentionsCompoundPro(text) {
  return COMPOUND_PRO_TEST.test(String(text ?? ''));
}

// Replace every mention. `replacement` defaults to the model-facing marker (excerpts); the output
// guard passes the generic word "compound" so a sentence still reads naturally.
export function scrubCompoundPro(text, replacement = COMPOUND_PRO_EXCERPT_MARKER) {
  const out = String(text ?? '');
  if (!mentionsCompoundPro(out)) return out;
  return out.replace(new RegExp(COMPOUND_PRO_SOURCE, 'gi'), replacement);
}

// True when one of the recent user turns asked about "Compound Pro" (the route then lets the
// model's "there is no such Shiny Jets product" answer through).
export function userAskedAboutCompoundPro(messages, recentUserTurns = 3) {
  const users = (Array.isArray(messages) ? messages : []).filter((m) => m?.role === 'user');
  return users.slice(-recentUserTurns).some((m) => mentionsCompoundPro(m.content));
}
