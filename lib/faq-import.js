// Import FAQs from a detailer's own web page: pure helpers shared by the
// server routes and the Settings → AI Chat & FAQs page (no I/O, no deps).
//
// Imported pairs are only ever *suggestions*: they go into a review list and
// reach the chat bubble only after the detailer saves them into their FAQ
// list (intake_faqs). "Keep in sync" re-checks a linked page weekly and
// flags changes for review; it never overwrites saved FAQs.
//
// Tested by scripts/test-faq-import.mjs.

import { MAX_Q, MAX_A, tokenize } from './ai-chat.js';

export const MAX_IMPORT_URLS = 5;
export const MAX_FAQ_SOURCES = 10;
export const MAX_PAIRS_PER_PAGE = 60;
export const MAX_PENDING_PER_SOURCE = 100;
export const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// ── URLs ──────────────────────────────────────────────────────────────────
// "acmejets.com/faq" -> "https://acmejets.com/faq". http/https only, no
// user:password@, no #fragment. Returns '' when the input isn't a web link.
export function normalizeImportUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > 2048) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  if (u.username || u.password) return '';
  if (!u.hostname || !u.hostname.includes('.') && !u.hostname.startsWith('[')) return '';
  u.hash = '';
  return u.href;
}

// Split a pasted blob (newlines, spaces, commas) into unique valid links.
export function parseUrlList(text, max = MAX_IMPORT_URLS) {
  const parts = (Array.isArray(text) ? text : String(text || '').split(/[\s,]+/)).map((p) => String(p || '').trim()).filter(Boolean);
  const valid = []; const invalid = [];
  for (const p of parts) {
    const n = normalizeImportUrl(p);
    if (!n) { invalid.push(p.slice(0, 200)); continue; }
    if (!valid.includes(n)) valid.push(n);
  }
  return { urls: valid.slice(0, max), invalid, tooMany: valid.length > max };
}

export function shortUrl(u) {
  try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname + x.search).replace(/\/$/, ''); } catch { return String(u || ''); }
}

// ── Text clean-up ─────────────────────────────────────────────────────────
export function cleanQuestion(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
    .replace(/^(q(uestion)?\s*[:.)-]\s*|\d{1,2}\s*[.)]\s+)/i, '')
    .replace(/\s*[+−–-]\s*$/, '')
    .trim().slice(0, MAX_Q);
}
export function cleanAnswer(s) {
  return String(s || '').replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ')
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
    .replace(/^a(nswer)?\s*[:.)-]\s*/i, '')
    .slice(0, MAX_A).trim();
}

// Stable key for "same question" (case, punctuation and spacing ignored).
export function faqKey(q) {
  return String(q || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

// FNV-1a 32-bit, hex. Used to notice an answer changed between weekly checks.
export function hashText(s) {
  const t = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// Clean, drop empties / self-answers, de-dupe by question, cap the count.
export function finalizePairs(pairs, max = MAX_PAIRS_PER_PAGE) {
  const out = []; const seen = new Set();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const question = cleanQuestion(p?.question);
    const answer = cleanAnswer(p?.answer);
    if (question.length < 4 || answer.length < 2) continue;
    const k = faqKey(question);
    if (!k || seen.has(k) || faqKey(answer) === k) continue;
    seen.add(k);
    out.push({ question, answer });
    if (out.length >= max) break;
  }
  return out;
}

// "Q: ... / A: ..." written out as plain text.
export function extractQaText(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const pairs = []; let cur = null;
  for (const l of lines) {
    const q = /^(?:q|question)\s*[:.)-]\s*(.+)$/i.exec(l);
    const a = /^(?:a|answer)\s*[:.)-]\s*(.+)$/i.exec(l);
    if (q) { if (cur?.answer) pairs.push(cur); cur = { question: q[1], answer: '' }; }
    else if (a && cur) cur.answer = cur.answer ? `${cur.answer}\n${a[1]}` : a[1];
    else if (cur?.answer) cur.answer += `\n${l}`;
  }
  if (cur?.answer) pairs.push(cur);
  return pairs;
}

// ── AI fallback: keep only what the page actually says ───────────────────
function words(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9$%\s]/g, ' ').split(/\s+/).filter(Boolean);
}
// True when (nearly) every word and most word pairs of `s` appear in the page
// text, so an AI-extracted answer can't contain anything the page didn't say.
export function groundedIn(pageText, s, { wordShare = 0.9, pairShare = 0.7 } = {}) {
  const page = words(pageText);
  const w = words(s);
  if (!w.length) return false;
  const pageSet = new Set(page);
  const wHit = w.filter((x) => pageSet.has(x)).length / w.length;
  if (wHit < wordShare) return false;
  if (w.length < 3) return true;
  const pagePairs = new Set();
  for (let i = 0; i < page.length - 1; i++) pagePairs.add(`${page[i]} ${page[i + 1]}`);
  let pHit = 0;
  for (let i = 0; i < w.length - 1; i++) if (pagePairs.has(`${w[i]} ${w[i + 1]}`)) pHit += 1;
  return pHit / (w.length - 1) >= pairShare;
}

// Parse the model's JSON array and drop anything not grounded in the page.
export function parseAiPairs(raw, pageText) {
  const s = String(raw || '');
  const a = s.indexOf('['); const b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  let arr;
  try { arr = JSON.parse(s.slice(a, b + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return finalizePairs(arr.filter((p) => p && typeof p.question === 'string' && typeof p.answer === 'string'
    && groundedIn(pageText, p.question, { wordShare: 0.6, pairShare: 0 }) && groundedIn(pageText, p.answer)));
}

// ── Review list: flag pairs that are already in the FAQ list ─────────────
function jaccard(a, b) {
  const A = new Set(tokenize(a)); const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const t of A) if (B.has(t)) n += 1;
  return n / (A.size + B.size - n);
}
// Returns pairs with duplicateOf = the existing question it matches (or '').
export function markDuplicates(pairs, existing) {
  const ex = (Array.isArray(existing) ? existing : []).filter((f) => f && f.question);
  const taken = [];
  return (pairs || []).map((p) => {
    const k = faqKey(p.question);
    let dup = ex.find((f) => faqKey(f.question) === k) || ex.find((f) => jaccard(f.question, p.question) >= 0.8);
    let dupOf = dup ? dup.question : '';
    if (!dupOf) {
      const t = taken.find((q) => faqKey(q) === k || jaccard(q, p.question) >= 0.8);
      if (t) dupOf = t;
    }
    taken.push(p.question);
    return { ...p, duplicateOf: dupOf };
  });
}

// ── Keep in sync ──────────────────────────────────────────────────────────
export function buildSnapshot(pairs) {
  return finalizePairs(pairs).map((p) => ({ k: faqKey(p.question), q: p.question, h: hashText(p.answer) }));
}
export function normalizeSnapshot(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.k === 'string' && typeof x.h === 'string')
    .slice(0, MAX_PAIRS_PER_PAGE)
    .map((x) => ({ k: x.k.slice(0, 400), q: String(x.q || '').slice(0, MAX_Q), h: x.h.slice(0, 16) }));
}

// What changed on the page since the last check.
export function computeSyncDiff(snapshot, pairs) {
  const prev = new Map(normalizeSnapshot(snapshot).map((x) => [x.k, x]));
  const now = finalizePairs(pairs);
  const nowKeys = new Set();
  const items = [];
  for (const p of now) {
    const k = faqKey(p.question); nowKeys.add(k);
    const old = prev.get(k);
    if (!old) items.push({ type: 'added', key: k, question: p.question, answer: p.answer });
    else if (old.h !== hashText(p.answer)) items.push({ type: 'changed', key: k, question: p.question, answer: p.answer });
  }
  for (const [k, old] of prev) if (!nowKeys.has(k)) items.push({ type: 'removed', key: k, question: old.q, answer: '' });
  return items;
}

// Newer findings replace older unreviewed ones for the same question.
export function mergePending(existing, items, now = new Date().toISOString()) {
  const map = new Map();
  for (const it of Array.isArray(existing) ? existing : []) if (it?.key) map.set(it.key, it);
  for (const it of items || []) map.set(it.key, { ...it, detected_at: now });
  return [...map.values()].slice(-MAX_PENDING_PER_SOURCE);
}

const PENDING_TYPES = new Set(['added', 'changed', 'removed']);
export function normalizeFaqSources(list) {
  const out = []; const seen = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    const url = normalizeImportUrl(s?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      keep_in_sync: s.keep_in_sync === true,
      method: typeof s.method === 'string' ? s.method.slice(0, 20) : '',
      added_at: typeof s.added_at === 'string' ? s.added_at : null,
      last_checked_at: typeof s.last_checked_at === 'string' ? s.last_checked_at : null,
      last_status: ['ok', 'error', 'empty'].includes(s.last_status) ? s.last_status : null,
      last_error: typeof s.last_error === 'string' ? s.last_error.slice(0, 200) : '',
      count: Number.isFinite(s.count) ? s.count : null,
      snapshot: normalizeSnapshot(s.snapshot),
      pending: (Array.isArray(s.pending) ? s.pending : []).filter((p) => p && PENDING_TYPES.has(p.type) && typeof p.key === 'string')
        .slice(-MAX_PENDING_PER_SOURCE)
        .map((p) => ({ type: p.type, key: p.key.slice(0, 400), question: String(p.question || '').slice(0, MAX_Q), answer: String(p.answer || '').slice(0, MAX_A), detected_at: typeof p.detected_at === 'string' ? p.detected_at : null })),
    });
    if (out.length >= MAX_FAQ_SOURCES) break;
  }
  return out;
}

// What the Settings page gets (no snapshots).
export function publicSources(list) {
  return normalizeFaqSources(list).map(({ snapshot, ...rest }) => rest);
}

export function syncDue(source, now = Date.now()) {
  if (!source?.keep_in_sync) return false;
  const t = source.last_checked_at ? Date.parse(source.last_checked_at) : 0;
  return !t || now - t >= SYNC_INTERVAL_MS - 60 * 60 * 1000;
}

// Keep source_url on saved FAQs only when it's a real web link.
export function cleanSourceUrl(u) {
  const n = normalizeImportUrl(u);
  return n && /^https?:\/\//i.test(String(u || '').trim()) ? n : '';
}

export const METHOD_LABEL = {
  jsonld: 'From the page’s FAQ data',
  details: 'From the page’s expandable FAQs',
  accordion: 'From the page’s FAQ accordion',
  headings: 'From the page’s headings',
  text: 'From Q: / A: text on the page',
  ai: 'Found by AI on the page: check the wording',
};
