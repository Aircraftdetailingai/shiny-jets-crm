// Detailing AI abuse logging, durable usage counts and login-sharing review (server only).
//
// No new table: review events go to the existing public.webhook_logs table with
// source = 'detailing_ai' (topics below, processed = false until Brett reviews them).
// Admins read them at GET /api/admin/detailing-ai-abuse.
//
// Every helper takes a service-role supabase client (or null) and never throws: if logging or a
// count fails, the chat keeps working and the failure goes to the server log.
import { networkOf, deviceOf, geoOf, clientIpOf } from './detailing-ai-guard.js';

export const ABUSE_SOURCE = 'detailing_ai';
export const TOPICS = {
  flag: 'detailing_ai_abuse_flag', // extraction / injection / prompt-leak / competitor request
  blocked: 'detailing_ai_output_blocked', // reply blocked (canary, prompt leak, bulk verbatim)
  trimmed: 'detailing_ai_output_trimmed', // long verbatim knowledge run trimmed / file names hidden
  refusal: 'detailing_ai_refusal', // the model declined a request
  rateLimited: 'detailing_ai_rate_limited', // a cap was hit (once per account per day per cap)
  throttled: 'detailing_ai_throttled', // auto-throttle switched on for an account
  highVolume: 'detailing_ai_high_volume', // account near its daily cap
  sharing: 'detailing_ai_login_sharing', // one login used from many networks
  seen: 'detailing_ai_seen', // one row per user/network/device/day (input for sharing check)
};
export const REVIEW_TOPICS = Object.values(TOPICS).filter((t) => t !== TOPICS.seen);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Short, single-line excerpt of a user message for the review log. */
export function excerptOf(text, max = 300) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function requestMeta(request) {
  const headers = request?.headers;
  return {
    network: networkOf(clientIpOf(headers)),
    device: deviceOf(typeof headers?.get === 'function' ? headers.get('user-agent') : ''),
    geo: geoOf(headers),
  };
}

export async function logAbuseEvent(supabase, topic, payload, { processed = false } = {}) {
  if (!supabase) {
    console.warn('[detailing-ai/abuse]', topic, JSON.stringify(payload));
    return { ok: false };
  }
  try {
    const { error } = await supabase.from('webhook_logs').insert({ source: ABUSE_SOURCE, topic, payload, processed });
    if (error) {
      console.error('[detailing-ai/abuse] log insert failed:', topic, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[detailing-ai/abuse] log insert failed:', topic, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// Once per (topic, key, day) per server instance — keeps repeat events (rate limits, sharing,
// high volume) to one review row.
const onceKeys = new Map();
export function firstToday(topic, key, now = Date.now()) {
  const k = `${topic}|${key}|${dayKey(now)}`;
  if (onceKeys.has(k)) return false;
  onceKeys.set(k, now);
  if (onceKeys.size > 20000) {
    for (const [kk, t] of onceKeys) { if (now - t > DAY) onceKeys.delete(kk); }
    if (onceKeys.size > 20000) onceKeys.clear();
  }
  return true;
}

export async function logOncePerDay(supabase, topic, key, payload, now = Date.now()) {
  if (!firstToday(topic, key, now)) return { ok: true, skipped: true };
  return logAbuseEvent(supabase, topic, payload);
}

/** Flagged messages for an account in the last 24h (durable, from webhook_logs). */
export async function countRecentFlags(supabase, accountId, now = Date.now()) {
  if (!supabase || !accountId) return null;
  try {
    const { count, error } = await supabase
      .from('webhook_logs')
      .select('id', { count: 'exact', head: true })
      .eq('source', ABUSE_SOURCE)
      .eq('topic', TOPICS.flag)
      .filter('payload->>account_id', 'eq', String(accountId))
      .gte('created_at', new Date(now - DAY).toISOString());
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

// ─── Durable per-account usage (no new table) ───────────────────────────────
// Counts the account's user messages saved in detailing_ai_conversations in the last hour / day,
// cached briefly per instance, plus messages this instance allowed since the last read. The
// in-memory limiter in the route is the first line; this makes caps hold across serverless
// instances and cold starts.
const USAGE_TTL_MS = 30 * 1000;
const usageCache = new Map();

export function countUserMessagesSince(conversations, now = Date.now()) {
  let hourly = 0;
  let daily = 0;
  for (const c of Array.isArray(conversations) ? conversations : []) {
    for (const m of Array.isArray(c?.messages) ? c.messages : []) {
      if (!m || m.role !== 'user') continue;
      const t = Date.parse(m.created_at || '');
      if (!Number.isFinite(t)) continue;
      if (now - t < DAY) daily += 1;
      if (now - t < HOUR) hourly += 1;
    }
  }
  return { hourly, daily };
}

export async function durableUsage(supabase, accountId, now = Date.now()) {
  const key = String(accountId || '');
  if (!supabase || !key) return null;
  const cached = usageCache.get(key);
  if (cached && now - cached.fetchedAt < USAGE_TTL_MS) {
    const local = cached.local.filter((t) => now - t < DAY);
    return { hourly: cached.hourly + local.filter((t) => now - t < HOUR).length, daily: cached.daily + local.length, cached: true };
  }
  try {
    const { data, error } = await supabase
      .from('detailing_ai_conversations')
      .select('messages')
      .eq('detailer_id', key)
      .gte('updated_at', new Date(now - DAY).toISOString())
      .limit(300);
    if (error) return null;
    const counts = countUserMessagesSince(data, now);
    usageCache.set(key, { ...counts, fetchedAt: now, local: [] });
    if (usageCache.size > 5000) usageCache.clear();
    return { ...counts, cached: false };
  } catch {
    return null;
  }
}

/** Remember a message this instance just allowed (until the next durable read). */
export function noteUsage(accountId, now = Date.now()) {
  const c = usageCache.get(String(accountId || ''));
  if (c) c.local.push(now);
}

export function resetUsageCache() {
  usageCache.clear();
  onceKeys.clear();
  seenKeys.clear();
}

// ─── Login sharing (no new table) ───────────────────────────────────────────
// One 'seen' row per user / network / device / day (deduped per instance). When a new one is
// written, count the user's distinct networks over 24h; at the threshold, log a review event.
const seenKeys = new Set();

export function distinctNetworks(rows) {
  const nets = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const p = r?.payload || {};
    if (!p.network || p.network === 'unknown') continue;
    const cur = nets.get(p.network) || { network: p.network, geo: p.geo || null, devices: new Set() };
    if (p.device) cur.devices.add(p.device);
    nets.set(p.network, cur);
  }
  return [...nets.values()].map((n) => ({ network: n.network, geo: n.geo, devices: [...n.devices] }));
}

export async function recordSeen(supabase, { accountId, userId, email = null, meta, threshold }, now = Date.now()) {
  if (!supabase || !userId || !meta) return { ok: false };
  const key = `${userId}|${meta.network}|${meta.device}|${dayKey(now)}`;
  if (seenKeys.has(key)) return { ok: true, skipped: true };
  seenKeys.add(key);
  if (seenKeys.size > 50000) seenKeys.clear();
  await logAbuseEvent(supabase, TOPICS.seen, { account_id: String(accountId), user_id: String(userId), network: meta.network, device: meta.device, geo: meta.geo }, { processed: true });
  try {
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('payload, created_at')
      .eq('source', ABUSE_SOURCE)
      .eq('topic', TOPICS.seen)
      .filter('payload->>user_id', 'eq', String(userId))
      .gte('created_at', new Date(now - DAY).toISOString())
      .limit(200);
    if (error) return { ok: false };
    const nets = distinctNetworks(data);
    if (nets.length >= threshold) {
      await logOncePerDay(supabase, TOPICS.sharing, String(userId), {
        account_id: String(accountId),
        user_id: String(userId),
        email,
        networks_24h: nets.length,
        networks: nets.slice(0, 20),
        note: `One login used from ${nets.length} different networks in 24 hours. Could be travel or phone + shop Wi-Fi; many cities or devices at once suggests a shared login.`,
      }, now);
      return { ok: true, sharing: true, networks: nets.length };
    }
    return { ok: true, sharing: false, networks: nets.length };
  } catch {
    return { ok: false };
  }
}
