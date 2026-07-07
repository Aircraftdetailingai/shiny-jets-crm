// Round-trip verification for send-anchored quote validity.
// Uses the service-role client + the REAL lib/quote-validity.js helpers, and
// mirrors the first-send gate from app/api/quotes/[id]/send/route.js and the
// extend math from app/api/quotes/[id]/extend/route.js. Reads back every value.
// Exits nonzero on any failed assertion. Cleans up temp rows + restores the
// detailer default even on failure.
//
// Run: node scripts/verify-quote-validity-roundtrip.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { resolveValidityDays, computeValidUntil, clampFuture } from '../lib/quote-validity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAY = 24 * 60 * 60 * 1000;
const TOLERANCE_MS = 2 * 60 * 1000; // 2 minutes

// --- Load env from .env.production (fallback to process.env) ---
function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(path.join(__dirname, '..', '.env.production'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      // Values in this project's env are quoted and may carry a literal "\n"
      // (backslash-n) — mirror lib cleanKey: strip quotes, literal \n, trim.
      if (m) env[m[1]] = env[m[1]] ?? m[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim();
    }
  } catch (e) {
    console.warn('Could not read .env.production, relying on process.env:', e.message);
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: missing SUPABASE_URL or service-role key in env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

let failures = 0;
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`);
}
const approx = (iso, expectedMs) => Math.abs(new Date(iso).getTime() - expectedMs) <= TOLERANCE_MS;
// Compare two timestamps by instant (DB returns "+00:00", JS toISOString uses "Z").
const sameInstant = (a, b) => new Date(a).getTime() === new Date(b).getTime();

// Mirror of app/api/quotes/[id]/send/route.js first-send gate.
async function simulateSend(quoteRow, detailerDefaultDays, sentAtISO) {
  const isFirstSend = !quoteRow.sent_at;
  const update = { status: 'sent', sent_at: sentAtISO };
  let warning = null;
  if (isFirstSend) {
    const days = resolveValidityDays({ quoteValidityDays: quoteRow.quote_validity_days, detailerDefaultDays });
    const clamp = clampFuture(computeValidUntil(sentAtISO, days));
    update.valid_until = clamp.validUntil;
    if (clamp.clamped) warning = 'clamped';
  }
  const { error } = await supabase.from('quotes').update(update).eq('id', quoteRow.id);
  if (error) throw new Error(`simulateSend update failed: ${error.message}`);
  return warning;
}

// Mirror of app/api/quotes/[id]/extend/route.js.
async function simulateExtend(quoteRow, days) {
  const current = quoteRow.valid_until ? new Date(quoteRow.valid_until) : new Date();
  const base = current > new Date() ? current : new Date();
  const newExpiry = new Date(base.getTime() + days * DAY).toISOString();
  const update = { valid_until: newExpiry, expiration_warning_sent: null };
  if (quoteRow.status === 'expired') update.status = 'sent';
  const { error } = await supabase.from('quotes').update(update).eq('id', quoteRow.id);
  if (error) throw new Error(`simulateExtend update failed: ${error.message}`);
  return newExpiry;
}

const createdIds = [];
async function insertQuote(fields) {
  const row = {
    detailer_id: DETAILER_ID,
    aircraft_type: 'validity_test',
    services: {},
    status: 'draft',
    share_link: `VTEST-${Math.floor(Math.random() * 1e9)}-${createdIds.length}`,
    notes: '[verify-quote-validity-roundtrip temp]',
    ...fields,
  };
  const { data, error } = await supabase.from('quotes').insert(row).select('*').single();
  if (error) throw new Error(`insertQuote failed: ${error.message}`);
  createdIds.push(data.id);
  return data;
}
async function reread(id) {
  const { data, error } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (error) throw new Error(`reread failed: ${error.message}`);
  return data;
}

const DETAILER_ID = '9f2b9f6a-a104-4497-a5fc-735ab3a7c170';
let originalDefault = null;

async function main() {
  // Snapshot + set detailer default = 20
  const { data: det, error: detErr } = await supabase
    .from('detailers').select('default_quote_validity_days').eq('id', DETAILER_ID).single();
  if (detErr) throw new Error(`detailer fetch failed: ${detErr.message}`);
  originalDefault = det.default_quote_validity_days;

  const setDefault = async (n) => {
    const { error } = await supabase.from('detailers').update({ default_quote_validity_days: n }).eq('id', DETAILER_ID);
    if (error) throw new Error(`set default failed: ${error.message}`);
  };

  await setDefault(20);

  // (i) default 20, no override -> sent_at + 20d
  const sentAt_i = new Date().toISOString();
  let qi = await insertQuote({ quote_validity_days: null });
  await simulateSend(qi, 20, sentAt_i);
  qi = await reread(qi.id);
  check('(i) default=20 sent quote valid_until == sent_at + 20d',
    approx(qi.valid_until, new Date(sentAt_i).getTime() + 20 * DAY),
    `valid_until=${qi.valid_until}`);

  // (ii) override 5 -> sent+5d ; second no override -> sent+20d
  const sentAt_ii = new Date().toISOString();
  let qOverride = await insertQuote({ quote_validity_days: 5 });
  await simulateSend(qOverride, 20, sentAt_ii);
  qOverride = await reread(qOverride.id);
  check('(ii a) override=5 -> sent_at + 5d',
    approx(qOverride.valid_until, new Date(sentAt_ii).getTime() + 5 * DAY),
    `valid_until=${qOverride.valid_until}`);

  let qNoOverride = await insertQuote({ quote_validity_days: null });
  await simulateSend(qNoOverride, 20, sentAt_ii);
  qNoOverride = await reread(qNoOverride.id);
  check('(ii b) no override (default 20) -> sent_at + 20d',
    approx(qNoOverride.valid_until, new Date(sentAt_ii).getTime() + 20 * DAY),
    `valid_until=${qNoOverride.valid_until}`);

  // (iii) change default 20 -> 45 : quote (i) unchanged
  const beforeChange = qi.valid_until;
  await setDefault(45);
  const qiAfter = await reread(qi.id);
  check('(iii) default 20->45 does NOT change already-sent quote',
    qiAfter.valid_until === beforeChange,
    `before=${beforeChange} after=${qiAfter.valid_until}`);

  // (iv) resend a sent quote -> valid_until unchanged (sent_at already set)
  const beforeResend = qiAfter.valid_until;
  const warnResend = await simulateSend(qiAfter, 45, new Date().toISOString());
  const qiResent = await reread(qi.id);
  check('(iv) resend does NOT recompute valid_until',
    qiResent.valid_until === beforeResend && warnResend === null,
    `before=${beforeResend} after=${qiResent.valid_until}`);

  // (v) expired quote: send path leaves valid_until; Extend moves it
  const pastValid = new Date(Date.now() - 10 * DAY).toISOString();
  let qExp = await insertQuote({
    status: 'expired',
    sent_at: new Date(Date.now() - 40 * DAY).toISOString(),
    valid_until: pastValid,
    quote_validity_days: null,
  });
  await simulateSend(qExp, 45, new Date().toISOString()); // sent_at set -> no valid_until write
  let qExpAfterSend = await reread(qExp.id);
  check('(v a) expired quote: send/revise path does NOT move valid_until',
    sameInstant(qExpAfterSend.valid_until, pastValid),
    `valid_until=${qExpAfterSend.valid_until}`);
  const newExpiry = await simulateExtend(qExpAfterSend, 7);
  const qExpExtended = await reread(qExp.id);
  check('(v b) Extend route moves valid_until into the future',
    sameInstant(qExpExtended.valid_until, newExpiry) && new Date(qExpExtended.valid_until) > new Date(),
    `valid_until=${qExpExtended.valid_until} status=${qExpExtended.status}`);

  // (vi) past-dated resolve -> clampFuture -> now + 1d, warning surfaced
  const clampPure = clampFuture(new Date(Date.now() - 5000).toISOString());
  check('(vi a) clampFuture(past) clamps to ~now+1d and flags clamped',
    clampPure.clamped === true && approx(clampPure.validUntil, Date.now() + DAY),
    `validUntil=${clampPure.validUntil} clamped=${clampPure.clamped}`);

  // first-send with a long-past sent_at -> computed expiry is past -> warning
  const longPastSent = new Date(Date.now() - 100 * DAY).toISOString();
  let qPast = await insertQuote({ quote_validity_days: null });
  const warn = await simulateSend(qPast, 20, longPastSent);
  qPast = await reread(qPast.id);
  check('(vi b) send with past anchor surfaces warning + clamps valid_until to future',
    warn === 'clamped' && new Date(qPast.valid_until) > new Date(),
    `warn=${warn} valid_until=${qPast.valid_until}`);

  // resolver bounds (unit) — also exercised by the routes
  check('(vi c) resolver bounds: override <1 -> 1, >90 -> 90, null/null -> 30',
    resolveValidityDays({ quoteValidityDays: -5 }) === 1 &&
    resolveValidityDays({ quoteValidityDays: 999 }) === 90 &&
    resolveValidityDays({ quoteValidityDays: null, detailerDefaultDays: null }) === 30,
    `${resolveValidityDays({ quoteValidityDays: -5 })}/${resolveValidityDays({ quoteValidityDays: 999 })}/${resolveValidityDays({})}`);
}

async function cleanup() {
  try {
    if (createdIds.length) {
      const { error } = await supabase.from('quotes').delete().in('id', createdIds);
      if (error) console.error('Cleanup (quotes delete) failed:', error.message);
      else console.log(`Cleaned up ${createdIds.length} temp quote(s).`);
    }
    if (originalDefault != null) {
      const { error } = await supabase.from('detailers')
        .update({ default_quote_validity_days: originalDefault }).eq('id', DETAILER_ID);
      if (error) console.error('Cleanup (restore default) failed:', error.message);
      else console.log(`Restored detailer default_quote_validity_days = ${originalDefault}.`);
    }
  } catch (e) {
    console.error('Cleanup exception:', e.message);
  }
}

try {
  await main();
} catch (e) {
  console.error('FATAL:', e.message);
  failures++;
} finally {
  await cleanup();
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} (${results.filter(r => r.pass).length}/${results.length})`);
process.exit(failures === 0 ? 0 : 1);
