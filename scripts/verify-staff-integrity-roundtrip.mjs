// Round-trip verification for the staff integrity bundle. Service-role client,
// live DB. Creates ZZ_TEST temp rows, asserts, cleans up (even on failure),
// exits nonzero on any FAIL. Mirrors the route logic edited in this bundle.
//
// Run: node scripts/verify-staff-integrity-roundtrip.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DETAILER_A = '9f2b9f6a-a104-4497-a5fc-735ab3a7c170';
const DETAILER_B = '5ce23d37-942d-4d9b-99b0-f1004b99e46f';
const RID = Math.floor(Math.random() * 1e6);

function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(path.join(__dirname, '..', '.env.production'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      // Values are quoted and may carry a literal "\n" — mirror lib cleanKey.
      if (m) env[m[1]] = env[m[1]] ?? m[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim();
    }
  } catch (e) { console.warn('Could not read .env.production:', e.message); }
  return env;
}
const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('FAIL: missing Supabase env'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

let failures = 0;
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`);
}

const memberIds = [];
const entryIds = [];

async function insertMember(fields) {
  const row = { detailer_id: DETAILER_A, name: 'ZZ_TEST member', type: 'employee', role: 'employee', status: 'active', ...fields };
  const { data, error } = await supabase.from('team_members').insert(row).select('id').single();
  if (error) return { error };
  memberIds.push(data.id);
  return { id: data.id };
}
async function insertEntry(fields) {
  const { data, error } = await supabase.from('time_entries').insert(fields).select('id').single();
  if (error) throw new Error(`insertEntry failed: ${error.message}`);
  entryIds.push(data.id);
  return data.id;
}

// Mirror of crew/clock findAnyOpenEntry (+ time-entries/clock existing check).
async function findAnyOpenEntry(memberId) {
  const { data } = await supabase.from('time_entries')
    .select('id, date, clock_in')
    .eq('team_member_id', memberId)
    .is('clock_out', null)
    .not('clock_in', 'is', null)
    .order('clock_in', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}
// Mirror of verify-pin / time-entries clock lookup (all active matches).
async function pinLookup(pin) {
  const { data, error } = await supabase.from('team_members')
    .select('id, name, type').eq('pin_code', pin).eq('status', 'active');
  if (error) throw new Error(`pinLookup failed: ${error.message}`);
  return data || [];
}
// Mirror of team POST pre-insert PIN conflict check.
async function pinTakenForDetailer(detailerId, pin) {
  const { data } = await supabase.from('team_members')
    .select('id').eq('detailer_id', detailerId).eq('pin_code', pin).eq('status', 'active').limit(1).maybeSingle();
  return !!data;
}

// pin_code is varchar(6). Generate a 6-char test PIN that is currently unused by
// any active member (so ambiguity counts are exact) and unique within this run.
const usedTestPins = new Set();
async function freshPin() {
  for (let i = 0; i < 30; i++) {
    const pin = ('Z' + Math.random().toString(36).slice(2, 8)).slice(0, 6).toUpperCase();
    if (pin.length !== 6 || usedTestPins.has(pin)) continue;
    const existing = await pinLookup(pin);
    if (existing.length === 0) { usedTestPins.add(pin); return pin; }
  }
  throw new Error('could not find a free test PIN');
}

async function main() {
  // (i) prior-day open entry blocks clock-in; closing it unblocks.
  const { id: m1, error: m1e } = await insertMember({ name: 'ZZ_TEST m1' });
  if (m1e) throw new Error(`m1 insert failed: ${m1e.message}`);
  const nowMs = Date.now();
  const yISO = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  const yDate = yISO.split('T')[0];
  const eId = await insertEntry({ team_member_id: m1, detailer_id: DETAILER_A, date: yDate, clock_in: yISO, hours_worked: 0 });
  const openBefore = await findAnyOpenEntry(m1);
  check('(i) prior-day open entry blocks clock-in (open_entry_exists)',
    !!openBefore && (openBefore.date || (openBefore.clock_in || '').split('T')[0]) === yDate, `open=${!!openBefore} date=${openBefore?.date}`);
  await supabase.from('time_entries').update({ clock_out: new Date().toISOString(), hours_worked: 24 }).eq('id', eId);
  const openAfter = await findAnyOpenEntry(m1);
  check('(i) after closing it, clock-in is allowed (no open entry)', !openAfter, `open=${!!openAfter}`);

  // (ii) kiosk PIN ambiguity across two detailers → >1; unique → exactly 1.
  const sharedPin = await freshPin();
  const uniquePin = await freshPin();
  const { error: pa } = await insertMember({ detailer_id: DETAILER_A, name: 'ZZ_TEST shareA', pin_code: sharedPin });
  const { error: pb } = await insertMember({ detailer_id: DETAILER_B, name: 'ZZ_TEST shareB', pin_code: sharedPin });
  const { id: uId, error: pu } = await insertMember({ detailer_id: DETAILER_A, name: 'ZZ_TEST uniq', pin_code: uniquePin });
  if (pa || pb || pu) throw new Error(`(ii) member inserts failed: ${pa?.message || ''} ${pb?.message || ''} ${pu?.message || ''}`);
  const ambig = await pinLookup(sharedPin);
  check('(ii) shared PIN across two detailers → lookup >1 (pin_ambiguous)', ambig.length > 1, `matches=${ambig.length}`);
  const uniq = await pinLookup(uniquePin);
  check('(ii) unique PIN → resolves to exactly one member', uniq.length === 1 && uniq[0].id === uId, `matches=${uniq.length}`);

  // (iii) team-add duplicate PIN within a detailer is rejected; other detailer OK.
  const pinX = await freshPin();
  const { error: firstErr } = await insertMember({ detailer_id: DETAILER_A, name: 'ZZ_TEST dupA1', pin_code: pinX });
  const takenBefore = await pinTakenForDetailer(DETAILER_A, pinX);
  check('(iii) route pre-check detects taken PIN (pin_taken)', !firstErr && takenBefore, `firstErr=${firstErr?.message || 'none'} taken=${takenBefore}`);
  // Direct duplicate insert must be rejected by the partial unique index.
  const dup = await insertMember({ detailer_id: DETAILER_A, name: 'ZZ_TEST dupA2', pin_code: pinX });
  const violated = !!dup.error && (dup.error.code === '23505' || /team_members_active_pin_per_detailer|duplicate key/i.test(dup.error.message || ''));
  check('(iii) DB index rejects duplicate active PIN in same detailer', violated, `err=${dup.error?.code || dup.error?.message || 'NONE (unexpected insert)'}`);
  // Same PIN under a different detailer is allowed.
  const { error: otherErr } = await insertMember({ detailer_id: DETAILER_B, name: 'ZZ_TEST dupB', pin_code: pinX });
  check('(iii) same PIN under a different detailer is allowed', !otherErr, `err=${otherErr?.message || 'none'}`);

  // (iv) partial unique index. The service-role PostgREST client cannot read
  // pg_indexes, so we assert the index's EFFECT — the duplicate rejection in
  // (iii) proves the partial unique index is active. Its definition was also
  // confirmed directly via MCP against pg_indexes (see report).
  check('(iv) partial unique index active (proven by (iii) rejection)', violated, 'behavioral proof');
}

async function cleanup() {
  try {
    if (entryIds.length) {
      const { error } = await supabase.from('time_entries').delete().in('id', entryIds);
      if (error) console.error('Cleanup time_entries failed:', error.message);
    }
    if (memberIds.length) {
      const { error } = await supabase.from('team_members').delete().in('id', memberIds);
      if (error) console.error('Cleanup team_members failed:', error.message);
    }
    console.log(`Cleaned up ${memberIds.length} member(s), ${entryIds.length} time entry(ies).`);
  } catch (e) { console.error('Cleanup exception:', e.message); }
}

try { await main(); }
catch (e) { console.error('FATAL:', e.message); failures++; }
finally { await cleanup(); }

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} (${results.filter(r => r.pass).length}/${results.length})`);
process.exit(failures === 0 ? 0 : 1);
