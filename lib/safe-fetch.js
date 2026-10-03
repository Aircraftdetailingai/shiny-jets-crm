// Fetch a public web page on behalf of a user without SSRF exposure
// (server only). Used by the FAQ importer.
//
//  - http/https only, default ports only, no user:password@ in the URL
//  - hostnames like localhost, *.local, *.internal and cloud metadata hosts
//    are refused; every DNS answer is checked and private / loopback /
//    link-local / CGNAT / multicast / reserved addresses are refused
//  - the check runs inside the socket's DNS lookup, so the address that is
//    validated is the address that is connected to (no DNS-rebinding gap)
//  - redirects are followed manually (max 3) and re-validated each hop
//  - hard time limit and byte limit (after decompression)
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

export const FETCH_LIMITS = { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 };
const UA = 'ShinyJetsFAQImporter/1.0 (+https://crm.shinyjets.com; imports a shop\'s own FAQ page on request)';

const BLOCKED_HOSTS = new Set([
  'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback', 'broadcasthost',
  'metadata', 'metadata.google.internal', 'metadata.goog', 'metadata.azure.com',
  'instance-data', 'instance-data.ec2.internal', 'kubernetes', 'kubernetes.default', 'kubernetes.default.svc',
]);
const BLOCKED_SUFFIX = /\.(localhost|local|localdomain|internal|intranet|lan|home|corp|private|home\.arpa|svc|cluster\.local)$/i;

export function isBlockedHostname(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (BLOCKED_HOSTS.has(h) || BLOCKED_SUFFIX.test(h)) return true;
  if (!net.isIP(h) && !h.includes('.')) return true; // single-label names resolve on internal DNS
  return false;
}

function v4ToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => [v4ToInt(base), bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0]);
function privateV4(ip) {
  const n = v4ToInt(ip);
  if (n == null) return true;
  return V4_BLOCKS.some(([base, mask]) => ((n & mask) >>> 0) === base);
}
function expandV6(ip) {
  let s = ip.toLowerCase().split('%')[0];
  let tail = [];
  const m = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) {
    const n = v4ToInt(m[1]); if (n == null) return null;
    tail = [(n >>> 16).toString(16), (n & 0xffff).toString(16)];
    s = s.slice(0, -m[1].length).replace(/:$/, '') + (s.endsWith('::' + m[1]) ? ':' : '');
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const [a, b] = s.split('::');
  const left = a ? a.split(':').filter(Boolean) : [];
  const right = b !== undefined ? (b ? b.split(':').filter(Boolean) : []) : null;
  let groups;
  if (right === null) groups = [...left, ...tail];
  else { const fill = 8 - left.length - right.length - tail.length; if (fill < 0) return null; groups = [...left, ...Array(fill).fill('0'), ...right, ...tail]; }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((x) => !Number.isInteger(x) || x < 0 || x > 0xffff) ? null : nums;
}
function privateV6(ip) {
  const g = expandV6(ip);
  if (!g) return true;
  const v4At = (hi, lo) => `${g[hi] >> 8}.${g[hi] & 255}.${g[lo] >> 8}.${g[lo] & 255}`;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return privateV4(v4At(6, 7)); // v4-mapped / compat
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(v4At(6, 7)); // NAT64
  if (g[0] === 0x2002) return privateV4(v4At(1, 2)); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7 (incl. fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link/site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard 100::/64
  return false;
}
export function isPrivateIp(ip) {
  const s = String(ip || '').replace(/^\[|\]$/g, '');
  const v = net.isIP(s);
  if (v === 4) return privateV4(s);
  if (v === 6) return privateV6(s);
  return true;
}

export class FetchBlockedError extends Error {
  constructor(message, code = 'blocked') { super(message); this.code = code; }
}

const MSG = {
  invalid: 'That isn’t a web page link. Use a public http:// or https:// address.',
  blocked: 'That address isn’t allowed. Use your public website’s FAQ page.',
  notfound: 'We couldn’t find that website. Check the link.',
  timeout: 'The page took too long to load. Try again, or paste the FAQ page itself.',
  toomany: 'The page redirected too many times.',
  type: 'That link isn’t a web page (it looks like a file or an image).',
  status: (n) => `The website returned an error (${n}). Check the link works in your browser.`,
  network: 'We couldn’t load that page. Check the link works in your browser.',
};

// Validate a URL before connecting. Returns a URL object or throws.
export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { throw new FetchBlockedError(MSG.invalid, 'invalid'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchBlockedError(MSG.invalid, 'invalid');
  if (u.username || u.password) throw new FetchBlockedError(MSG.invalid, 'invalid');
  if (u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443'))) throw new FetchBlockedError(MSG.blocked, 'blocked');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(host)) throw new FetchBlockedError(MSG.blocked, 'blocked');
  if (net.isIP(host) && isPrivateIp(host)) throw new FetchBlockedError(MSG.blocked, 'blocked');
  return u;
}

// DNS lookup that refuses private answers; used as the socket's lookup().
export function safeLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  const opts = typeof options === 'number' ? { family: options } : (options || {});
  if (isBlockedHostname(hostname)) return cb(new FetchBlockedError(MSG.blocked, 'blocked'));
  dns.lookup(hostname, { all: true, family: opts.family || 0, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs?.length) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    if (addrs.some((a) => isPrivateIp(a.address))) return cb(new FetchBlockedError(MSG.blocked, 'blocked'));
    if (opts.all) return cb(null, addrs);
    return cb(null, addrs[0].address, addrs[0].family);
  });
}

function requestOnce(u, { deadline, maxBytes }) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const remaining = Math.max(1, deadline - Date.now());
    const req = lib.request(u, {
      method: 'GET',
      lookup: safeLookup,
      agent: false,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5,*/*;q=0.1',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.8',
      },
      timeout: remaining,
    });
    const timer = setTimeout(() => req.destroy(new FetchBlockedError(MSG.timeout, 'timeout')), remaining);
    const done = (fn, v) => { clearTimeout(timer); fn(v); };
    req.on('timeout', () => req.destroy(new FetchBlockedError(MSG.timeout, 'timeout')));
    req.on('error', (e) => done(reject, e));
    req.on('response', (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return done(resolve, { redirect: res.headers.location, status });
      }
      if (status < 200 || status >= 300) { res.resume(); return done(reject, new FetchBlockedError(MSG.status(status), 'status')); }
      const ctype = String(res.headers['content-type'] || '').toLowerCase();
      if (ctype && !/text\/html|application\/xhtml\+xml|text\/plain/.test(ctype)) { res.destroy(); return done(reject, new FetchBlockedError(MSG.type, 'type')); }
      const len = Number(res.headers['content-length'] || 0);
      if (len && len > maxBytes * 4) { res.destroy(); return done(reject, new FetchBlockedError('That page is too large to import.', 'size')); }
      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      if (enc.includes('br')) stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
      else if (enc.includes('deflate')) stream = res.pipe(zlib.createInflate());
      const chunks = []; let total = 0; let truncated = false;
      const finish = () => {
        const buf = Buffer.concat(chunks).subarray(0, maxBytes);
        const cs = (/charset=([^;\s]+)/.exec(ctype)?.[1] || 'utf-8').replace(/["']/g, '');
        let body;
        try { body = new TextDecoder(cs, { fatal: false }).decode(buf); } catch { body = new TextDecoder('utf-8').decode(buf); }
        done(resolve, { status, body, contentType: ctype, truncated });
      };
      stream.on('data', (c) => {
        if (truncated) return;
        chunks.push(c); total += c.length;
        if (total >= maxBytes) { truncated = true; res.destroy(); finish(); }
      });
      stream.on('end', () => { if (!truncated) finish(); });
      stream.on('error', (e) => { if (!truncated) done(reject, e); });
    });
    req.end();
  });
}

function friendly(e) {
  if (e instanceof FetchBlockedError) return { error: e.message, code: e.code };
  const code = e?.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') return { error: MSG.notfound, code: 'notfound' };
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return { error: MSG.timeout, code: 'timeout' };
  return { error: MSG.network, code: 'network' };
}

// -> { ok: true, url, status, html, truncated } | { ok: false, error, code }
export async function safeFetchPage(rawUrl, limits = {}) {
  const { timeoutMs, maxBytes, maxRedirects } = { ...FETCH_LIMITS, ...limits };
  const deadline = Date.now() + timeoutMs;
  let current = rawUrl;
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const u = checkUrl(current);
      const r = await requestOnce(u, { deadline, maxBytes });
      if (r.redirect) {
        if (hop === maxRedirects) throw new FetchBlockedError(MSG.toomany, 'redirects');
        current = new URL(r.redirect, u).href;
        continue;
      }
      return { ok: true, url: u.href, status: r.status, html: r.body, truncated: r.truncated };
    }
    throw new FetchBlockedError(MSG.toomany, 'redirects');
  } catch (e) {
    return { ok: false, ...friendly(e) };
  }
}
