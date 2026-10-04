// Failed-login limiter. In-memory sliding window, per server instance —
// same trade-off as the signup limiter in app/api/auth/signup/route.js
// (a cold start resets the counters). Counts failures only.
//
// 10 failures per email / 15 minutes, and 30 failures per IP / 15 minutes
// so one shared address cannot spray passwords across many accounts, while
// one person mistyping a password does not lock a whole office NAT.

export const LOGIN_EMAIL_FAIL_LIMIT = 10;
export const LOGIN_IP_FAIL_LIMIT = 30;
export const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MESSAGE = 'Too many login attempts. Please try again in a few minutes.';

const emailFails = new Map();
const ipFails = new Map();

function keyEmail(email) {
  return String(email || '').trim().toLowerCase().slice(0, 320);
}

function keyIp(ip) {
  return String(ip || '').trim().slice(0, 200) || 'unknown';
}

function prune(map, key, now) {
  const arr = (map.get(key) || []).filter((t) => now - t < LOGIN_FAIL_WINDOW_MS);
  if (arr.length) map.set(key, arr);
  else map.delete(key);
  return arr;
}

function sweep(map, now) {
  if (map.size <= 5000) return;
  for (const [key, arr] of map) {
    const fresh = arr.filter((t) => now - t < LOGIN_FAIL_WINDOW_MS);
    if (fresh.length) map.set(key, fresh);
    else map.delete(key);
    if (map.size <= 4000) return;
  }
  if (map.size > 5000) map.clear();
}

/** First X-Forwarded-For hop, else X-Real-IP. Matches the signup route. */
export function clientIpFromRequest(request) {
  const xff = request?.headers?.get?.('x-forwarded-for') || '';
  const first = String(xff).split(',')[0].trim();
  return first || request?.headers?.get?.('x-real-ip') || 'unknown';
}

/**
 * @returns {{ limited: boolean, retryAfter: number }}
 * retryAfter is seconds until the blocking window expires (0 when allowed).
 */
export function loginRateLimit(email, ip, now = Date.now()) {
  const emailHits = prune(emailFails, keyEmail(email), now);
  const ipHits = prune(ipFails, keyIp(ip), now);
  const emailBlocked = emailHits.length >= LOGIN_EMAIL_FAIL_LIMIT;
  const ipBlocked = ipHits.length >= LOGIN_IP_FAIL_LIMIT;
  if (!emailBlocked && !ipBlocked) return { limited: false, retryAfter: 0 };
  const waits = [];
  if (emailBlocked) waits.push(LOGIN_FAIL_WINDOW_MS - (now - emailHits[0]));
  if (ipBlocked) waits.push(LOGIN_FAIL_WINDOW_MS - (now - ipHits[0]));
  return { limited: true, retryAfter: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
}

export function recordLoginFailure(email, ip, now = Date.now()) {
  const ek = keyEmail(email);
  const ik = keyIp(ip);
  const emailHits = prune(emailFails, ek, now);
  const ipHits = prune(ipFails, ik, now);
  emailHits.push(now);
  ipHits.push(now);
  emailFails.set(ek, emailHits);
  ipFails.set(ik, ipHits);
  sweep(emailFails, now);
  sweep(ipFails, now);
}

/** Test-only. */
export function resetLoginRateLimits() {
  emailFails.clear();
  ipFails.clear();
}
