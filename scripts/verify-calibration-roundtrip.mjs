// Round-trip verification for the calibration engine: DB -> service_calibrations
// -> the REAL apply module (lib/calibration-reference.js + lib/calibrate-hours.js).
//
// For every supported reference type + one own-service reference, it creates a
// throwaway ZZ_TEST calibration (+25%) against REAL aircraft_hours rows for the
// G650 and Phenom 300, runs the real module, and asserts:
//   (a) source is 'column' | 'derived' — never a flat default ('none').
//   (b) column refs: calibrated hours == ref x 1.25 exactly.
//   (c) G650 > Phenom 300 for every type.
//   (d) ceramic on the Gulfstream (ceramic_coating_hrs NULL) -> source 'derived'
//       and still scales G650 > Phenom.
// Temps are cleaned up no matter what; exits nonzero on any FAIL.
//
// Run: node scripts/verify-calibration-roundtrip.mjs
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env.production).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveReferenceHours } from '../lib/calibration-reference.js';
import { computeCalibratedHours } from '../lib/calibrate-hours.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── env: same cleanKey dialect as the project's other verify scripts ──
try {
  const envContent = readFileSync(resolve(__dirname, '..', '.env.production'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Credentials sometimes carry literal "\n" — strip, don't expand.
    val = val.replace(/\\n/g, '').replace(/\\r/g, '').trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // Env file optional — script still runs if vars are already in env.
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DETAILER_ID = 'e9dc3f74-4472-4e37-a1fe-efd823ab7eee'; // real detailer with services
const STD_TYPES = ['wash', 'polish', 'compound', 'wax', 'spray_ceramic', 'ceramic', 'interior', 'leather', 'decon'];

const r3 = (n) => Math.round(n * 1000) / 1000;

let failures = 0;
function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
}

const cleanup = { tempServiceId: null };

async function main() {
  // ── Real aircraft_hours rows + full set for the derived-ratio computation ──
  const { data: allHoursRows, error: allErr } = await supabase.from('aircraft_hours').select('*');
  if (allErr) throw new Error(`aircraft_hours fetch: ${allErr.message}`);
  const g650 = allHoursRows.find((r) => r.model === 'G650');
  const phenom = allHoursRows.find((r) => r.model === 'Phenom 300');
  if (!g650 || !phenom) throw new Error('Could not find G650 and/or Phenom 300 in aircraft_hours');
  console.log(`Anchors: G650 id=${g650.id}, Phenom 300 id=${phenom.id}, ${allHoursRows.length} rows total\n`);

  // ── services for own-service ("svc:") resolution + an own-service candidate ──
  const { data: allServices, error: svcErr } = await supabase.from('services').select('id, name, hours_field, default_hours');
  if (svcErr) throw new Error(`services fetch: ${svcErr.message}`);
  const ownSvc = allServices.find((s) => s.hours_field === 'polish_hours'); // -> one_step_polish_hrs (populated for both)
  if (!ownSvc) throw new Error('No own-service candidate with hours_field=polish_hours');
  const ownRef = `svc:${ownSvc.id}`;
  console.log(`Own-service reference: ${ownRef} ("${ownSvc.name}", hours_field=${ownSvc.hours_field})\n`);

  // ── create a throwaway service to hang the ZZ_TEST calibrations off ──
  const { data: tempSvc, error: tsErr } = await supabase
    .from('services')
    .insert({ detailer_id: DETAILER_ID, name: 'ZZ_TEST_CALIB_ROUNDTRIP', hourly_rate: 0, hours_field: null, default_hours: null })
    .select('id')
    .single();
  if (tsErr) throw new Error(`temp service insert: ${tsErr.message}`);
  cleanup.tempServiceId = tempSvc.id;

  const ctx = { services: allServices, allHoursRows };
  const svcObj = { id: tempSvc.id, name: 'ZZ_TEST_CALIB_ROUNDTRIP', default_hours: null };
  const allRefs = [...STD_TYPES, ownRef];

  for (const type of allRefs) {
    // Persist a real ZZ_TEST calibration (+25%) and read it back — proves the
    // full DB -> module round-trip, not just an in-memory object.
    const { error: upErr } = await supabase.from('service_calibrations').upsert(
      {
        detailer_id: DETAILER_ID,
        service_id: tempSvc.id,
        service_name: 'ZZ_TEST_CALIB_ROUNDTRIP',
        reference_service_type: type,
        adjustment_pct: 25,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'detailer_id,service_id' },
    );
    if (upErr) throw new Error(`calibration upsert (${type}): ${upErr.message}`);
    const { data: calRow, error: readErr } = await supabase
      .from('service_calibrations')
      .select('*')
      .eq('detailer_id', DETAILER_ID)
      .eq('service_id', tempSvc.id)
      .single();
    if (readErr) throw new Error(`calibration read-back (${type}): ${readErr.message}`);

    const label = type.startsWith('svc:') ? 'own-service' : type;
    const per = {};
    for (const [name, row] of [['G650', g650], ['Phenom300', phenom]]) {
      const ref = resolveReferenceHours(row, calRow.reference_service_type, ctx);
      const res = computeCalibratedHours({ service: svcObj, aircraftHoursRef: row, calibrations: [calRow], ...ctx });
      per[name] = { ref, res };

      // (a) never a flat default
      assert(ref.source === 'column' || ref.source === 'derived',
        `[${label}] ${name}: source=${ref.source} (col=${ref.column}) is column|derived`);
      assert(res.source === 'calibrated',
        `[${label}] ${name}: apply source=${res.source} is 'calibrated' -> hours=${res.hours}`);

      // (b) column refs scale exactly by 1.25
      if (ref.source === 'column') {
        const expected = r3(ref.hours * 1.25);
        assert(res.hours === expected,
          `[${label}] ${name}: column ${ref.hours} x1.25 == ${res.hours} (expected ${expected})`);
      }
    }

    // (c) G650 > Phenom for every type
    assert(per.G650.res.hours > per.Phenom300.res.hours,
      `[${label}] G650 ${per.G650.res.hours} > Phenom300 ${per.Phenom300.res.hours}`);

    // (d) ceramic on the Gulfstream is a genuine data gap -> derived, still ordered
    if (type === 'ceramic') {
      assert(per.G650.ref.source === 'derived',
        `[ceramic] G650 ceramic_coating_hrs NULL -> derived (source=${per.G650.ref.source}, hours=${per.G650.ref.hours})`);
      assert(per.G650.res.hours > per.Phenom300.res.hours,
        `[ceramic] derived G650 ${per.G650.res.hours} > Phenom300 ${per.Phenom300.res.hours}`);
    }
  }
}

async function teardown() {
  if (cleanup.tempServiceId) {
    await supabase.from('service_calibrations').delete().eq('detailer_id', DETAILER_ID).eq('service_id', cleanup.tempServiceId);
    await supabase.from('services').delete().eq('id', cleanup.tempServiceId);
    console.log(`\nCleaned up temp service ${cleanup.tempServiceId} + its calibration.`);
  }
}

try {
  await main();
} catch (e) {
  console.error('\nERROR:', e.message);
  failures += 1;
} finally {
  try {
    await teardown();
  } catch (e) {
    console.error('Cleanup error:', e.message);
    failures += 1;
  }
}

console.log(`\n${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
