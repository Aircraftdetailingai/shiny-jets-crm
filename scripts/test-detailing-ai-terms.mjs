/**
 * Aircraft Detailing AI Terms gate (Brett, Oct 3 2026).
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-terms.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import { TERMS, TERMS_TEXT, TERMS_VERSION, TERMS_LABEL, parseTerms } from '../lib/detailing-ai-terms.js';
import { getTermsStatus, recordTermsAcceptance, requireTermsAccepted, TERMS_TABLE } from '../lib/detailing-ai-terms-server.js';

const tests = [];
const check = (name, fn) => tests.push([name, fn]);

// Minimal fake of the supabase-js query builder used by the helpers.
function fakeSupabase({ rows = [], error = null } = {}) {
  const calls = [];
  const builder = (table) => {
    const q = { table, filters: {} };
    const api = {
      select() { return api; },
      eq(k, v) { q.filters[k] = v; return api; },
      order() { return api; },
      limit() {
        calls.push(['select', q]);
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: rows.filter((r) => r.user_id === q.filters.user_id && r.terms_version === q.filters.terms_version), error: null });
      },
      upsert(row, opts) {
        calls.push(['upsert', row, opts]);
        if (error) return Promise.resolve({ error });
        if (!rows.some((r) => r.user_id === row.user_id && r.terms_version === row.terms_version)) rows.push(row);
        return Promise.resolve({ error: null });
      },
    };
    return api;
  };
  return { from: builder, calls, rows };
}
const user = { id: 'u-1', detailer_id: '11111111-1111-1111-1111-111111111111', email: 'pilot@example.com' };

check('terms text is Brett\'s approved text (2026-10-04), 17 sections, labeled Aircraft Detailing AI', () => {
  assert.match(TERMS_TEXT, /^AIRCRAFT DETAILING AI TERMS OF SERVICE\n/);
  assert.equal(TERMS.sections.length, 17);
  assert.deepEqual(TERMS.sections.map((s) => Number(s.n)), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.equal(TERMS.sections[0].heading, 'Acceptance');
  assert.match(TERMS.sections[1].body, /\$59\.95 per month or \$599 per year/);
  assert.match(TERMS.sections[4].body, /ignore the AI's warnings, cautions or advice to test a spot first, the result is solely your responsibility/);
  assert.match(TERMS.sections[5].body, /ignoring the AI's warnings, cautions or test-spot advice/);
  assert.deepEqual(TERMS.sections.slice(9, 13).map((s) => s.heading), ['Ownership', 'No copying or competing use', 'No tampering', 'Enforcement']);
  assert.match(TERMS.sections[12].body, /terminate your account immediately with no refund/);
  assert.equal(TERMS.sections[14].heading, 'Changes');
  assert.match(TERMS.sections[14].body, /ask you to accept them again at login/);
  assert.match(TERMS.sections[14].body, new RegExp(`effective version of these terms is ${TERMS_VERSION}\\.`));
  assert.equal(TERMS.sections[16].heading, 'Contact');
  assert.equal(TERMS_VERSION, '2026-10-04');
  assert.equal(TERMS_LABEL, 'Aircraft Detailing AI Terms');
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(parseTerms(TERMS_TEXT), TERMS);
});

check('status: not accepted -> accepted after recording (stores version, time, user and account)', async () => {
  const sb = fakeSupabase();
  assert.deepEqual(await getTermsStatus(sb, user), { ok: true, accepted: false, accepted_at: null });
  const r = await recordTermsAcceptance(sb, user, { userAgent: 'UA', ip: '1.2.3.4' });
  assert.equal(r.accepted, true);
  const [, row, opts] = sb.calls.find((c) => c[0] === 'upsert');
  assert.equal(row.user_id, 'u-1');
  assert.equal(row.detailer_id, user.detailer_id);
  assert.equal(row.terms_version, TERMS_VERSION);
  assert.ok(!Number.isNaN(Date.parse(row.accepted_at)));
  assert.deepEqual(opts, { onConflict: 'user_id,terms_version', ignoreDuplicates: true });
  assert.equal(sb.calls[0][1].table, TERMS_TABLE);
});

check('version change: an older acceptance (incl. 2026-10-03) does not count', async () => {
  const sb = fakeSupabase({ rows: [{ user_id: 'u-1', terms_version: '2020-01-01', accepted_at: '2020-01-01T00:00:00Z' }, { user_id: 'u-1', terms_version: '2026-10-03', accepted_at: '2026-10-03T20:00:00Z' }] });
  assert.equal((await getTermsStatus(sb, user)).accepted, false);
});

check('chat gate: blocks until accepted (403), fails closed on DB error (503), passes after', async () => {
  const sb = fakeSupabase();
  let res = await requireTermsAccepted(sb, user);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'TERMS_REQUIRED');
  res = await requireTermsAccepted(fakeSupabase({ error: { message: 'relation does not exist' } }), user);
  assert.equal(res.status, 503);
  res = await requireTermsAccepted(null, user);
  assert.equal(res.status, 503);
  await recordTermsAcceptance(sb, user);
  assert.equal(await requireTermsAccepted(sb, user), null);
});

check('API routes: chat + ask-expert enforce the gate after the plan gate; terms route only accepts the current version', () => {
  for (const f of ['app/api/detailing-ai/chat/route.js', 'app/api/detailing-ai/ask-expert/route.js']) {
    const src = fs.readFileSync(f, 'utf8');
    const plan = src.indexOf("requireFeature(request, 'detailingAi'");
    const terms = src.indexOf('requireTermsAccepted(getServiceSupabase(), user)');
    assert.ok(plan > 0 && terms > plan, f);
    assert.match(src, /if \(termsGate\) return termsGate;/);
  }
  const t = fs.readFileSync('app/api/detailing-ai/terms/route.js', 'utf8');
  assert.match(t, /body\.terms_version !== TERMS_VERSION/);
  assert.match(t, /export async function GET/);
  assert.match(t, /export async function POST/);
});

check('page: layout wraps Detailing AI in the terms gate; modal is un-skippable and accessible', () => {
  const layout = fs.readFileSync('app/detailing-ai/layout.jsx', 'utf8');
  assert.match(layout, /<DetailingAiTermsGate>\{children\}<\/DetailingAiTermsGate>/);
  const c = fs.readFileSync('components/DetailingAiTermsGate.jsx', 'utf8');
  for (const s of ['role="dialog"', 'aria-modal="true"', 'aria-labelledby="dai-terms-title"', 'aria-describedby="dai-terms-lead"', 'role="alert"', "e.key === 'Escape'", 'min-h-[48px]', 'min-h-[44px]', '100dvh', 'safe-area-inset-bottom', 'I agree', 'tabIndex={0}']) assert.ok(c.includes(s), s);
  assert.ok(!/Skip|onClose|Not now/.test(c), 'modal must not be skippable');
  // children (chat, tutorial) only render once accepted
  assert.match(c, /if \(state === 'accepted' \|\| state === 'signed_out'\) return children;/);
  // AA contrast: white on #007CB1 (4.65:1), not charcoal on gold (4.06:1)
  assert.match(c, /bg-v-gold [^"]*text-white/);
});

check('migration: table, unique (user, version), service-role only', () => {
  const sql = fs.readFileSync('supabase/migrations/20261008_detailing_ai_terms_acceptances.sql', 'utf8');
  for (const s of ['CREATE TABLE IF NOT EXISTS public.detailing_ai_terms_acceptances', 'terms_version', 'accepted_at', 'user_id', 'detailer_id', 'UNIQUE (user_id, terms_version)', 'ENABLE ROW LEVEL SECURITY', 'REVOKE ALL ON public.detailing_ai_terms_acceptances FROM anon', 'REVOKE ALL ON public.detailing_ai_terms_acceptances FROM authenticated']) assert.ok(sql.includes(s), s);
  assert.ok(!/CREATE POLICY/i.test(sql));
});

check('no banned brands; methods not recipes', () => {
  const text = ['lib/detailing-ai-terms.js', 'lib/detailing-ai-terms-server.js', 'components/DetailingAiTermsGate.jsx', 'app/api/detailing-ai/terms/route.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/rupes|sky\s*glide|udetailers|university detailers|compound pro|pro cut|recipe/i.test(text));
});

let failed = 0;
for (const [n, f] of tests) { try { await f(); console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n  ${e.message}`); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
