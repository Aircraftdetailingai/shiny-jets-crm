// Round-trip verification for the service link -> job load -> usage logging
// -> learned-average -> forecast chain. Creates throwaway rows for one real
// detailer, reads back every write, asserts behavior, and cleans up no matter
// what fails. Exits nonzero on any failure.
//
// Run: node scripts/verify-service-link-roundtrip.mjs
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (or .env.production).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.production');
try {
  const envContent = readFileSync(envPath, 'utf-8');
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
    // .env files commonly contain literal "\n" inside quotes (dotenv expands
    // these for double-quoted values). Strip any trailing literal backslash-n
    // since these are credentials, not multi-line values.
    val = val.replace(/\\n/g, '').replace(/\\r/g, '').trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch (e) {
  // Env file optional — script still runs if vars are already in env.
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DETAILER_ID = '9f2b9f6a-a104-4497-a5fc-735ab3a7c170';
const TAG = `roundtrip-${Date.now()}`;

const cleanup = {
  serviceId: null,
  productId: null,
  equipmentId: null,
  quoteId: null,
};
const results = [];

function pass(joint, msg) {
  results.push({ joint, ok: true, msg });
  console.log(`PASS  ${joint}: ${msg}`);
}
function fail(joint, msg) {
  results.push({ joint, ok: false, msg });
  console.error(`FAIL  ${joint}: ${msg}`);
}

async function dropTestRows() {
  const ids = cleanup;
  // Children of detailer (averages, usage log) first.
  if (ids.productId) {
    await supabase.from('product_consumption_averages').delete()
      .eq('detailer_id', DETAILER_ID)
      .eq('product_id', ids.productId);
    await supabase.from('product_usage_log').delete()
      .eq('detailer_id', DETAILER_ID)
      .eq('product_id', ids.productId);
  }
  if (ids.serviceId) {
    await supabase.from('service_products').delete().eq('service_id', ids.serviceId);
    await supabase.from('service_equipment').delete().eq('service_id', ids.serviceId);
  }
  if (ids.quoteId) await supabase.from('quotes').delete().eq('id', ids.quoteId);
  if (ids.serviceId) await supabase.from('services').delete().eq('id', ids.serviceId);
  if (ids.productId) await supabase.from('products').delete().eq('id', ids.productId);
  if (ids.equipmentId) await supabase.from('equipment').delete().eq('id', ids.equipmentId);
}

async function insertOne(table, row, label) {
  const { data, error } = await supabase.from(table).insert(row).select('id').single();
  if (error) throw new Error(`${label} insert failed: ${error.message} (code=${error.code}, details=${error.details || ''}, hint=${error.hint || ''})`);
  if (!data || !data.id) throw new Error(`${label} insert returned no row`);
  return data.id;
}

async function createParents() {
  cleanup.serviceId = await insertOne('services', {
    detailer_id: DETAILER_ID,
    name: `${TAG}-svc`,
    description: 'verify roundtrip test service',
  }, 'services');

  cleanup.productId = await insertOne('products', {
    detailer_id: DETAILER_ID,
    name: `${TAG}-prod`,
    category: 'other',
    unit: 'oz',
    quantity: 100,
  }, 'products');

  cleanup.equipmentId = await insertOne('equipment', {
    detailer_id: DETAILER_ID,
    name: `${TAG}-equip`,
  }, 'equipment');

  // Quote stands in for the "job" — the inventory writers all accept a quote_id
  // or job_id; product_usage_log just needs a UUID for job_id.
  cleanup.quoteId = await insertOne('quotes', {
    detailer_id: DETAILER_ID,
    aircraft_type: 'test_cat',
    aircraft_model: 'TEST-MODEL',
    services: [],
    status: 'draft',
  }, 'quotes');
}

async function jointLink() {
  // 1. LINK: upsert service_products with quantity_per_job=2.5, then SELECT
  // back and confirm both detailer_id and quantity_per_job round-tripped.
  const row = {
    detailer_id: DETAILER_ID,
    service_id: cleanup.serviceId,
    product_id: cleanup.productId,
    quantity_per_job: 2.5,
    notes: 'roundtrip link',
  };
  const { error: upErr } = await supabase
    .from('service_products')
    .upsert(row, { onConflict: 'service_id,product_id' });
  if (upErr) { fail('LINK', `upsert error: ${upErr.message}`); return; }

  const { data: readBack, error: readErr } = await supabase
    .from('service_products')
    .select('detailer_id, quantity_per_job')
    .eq('service_id', cleanup.serviceId)
    .eq('product_id', cleanup.productId)
    .single();
  if (readErr || !readBack) { fail('LINK', `re-select failed: ${readErr?.message || 'no row'}`); return; }
  if (readBack.detailer_id !== DETAILER_ID) {
    fail('LINK', `detailer_id mismatch: got ${readBack.detailer_id}`); return;
  }
  if (parseFloat(readBack.quantity_per_job) !== 2.5) {
    fail('LINK', `quantity_per_job mismatch: got ${readBack.quantity_per_job}`); return;
  }
  pass('LINK', `detailer_id + quantity_per_job=2.5 round-tripped`);
}

async function jointEquipment() {
  // 2. EQUIPMENT: upsert once -> 1 row. Upsert same pair again -> still 1 row
  // (the unique constraint must dedupe, not throw).
  const row = {
    detailer_id: DETAILER_ID,
    service_id: cleanup.serviceId,
    equipment_id: cleanup.equipmentId,
    notes: 'roundtrip equip',
  };
  const { error: e1 } = await supabase
    .from('service_equipment')
    .upsert(row, { onConflict: 'service_id,equipment_id' });
  if (e1) { fail('EQUIPMENT', `first upsert error: ${e1.message}`); return; }

  const { data: after1, error: r1 } = await supabase
    .from('service_equipment')
    .select('id, detailer_id')
    .eq('service_id', cleanup.serviceId)
    .eq('equipment_id', cleanup.equipmentId);
  if (r1) { fail('EQUIPMENT', `re-select after first upsert error: ${r1.message}`); return; }
  if (after1.length !== 1) { fail('EQUIPMENT', `expected 1 row after first upsert, got ${after1.length}`); return; }
  if (after1[0].detailer_id !== DETAILER_ID) {
    fail('EQUIPMENT', `detailer_id mismatch: got ${after1[0].detailer_id}`); return;
  }

  const { error: e2 } = await supabase
    .from('service_equipment')
    .upsert(row, { onConflict: 'service_id,equipment_id' });
  if (e2) { fail('EQUIPMENT', `second upsert error: ${e2.message}`); return; }

  const { data: after2, error: r2 } = await supabase
    .from('service_equipment')
    .select('id')
    .eq('service_id', cleanup.serviceId)
    .eq('equipment_id', cleanup.equipmentId);
  if (r2) { fail('EQUIPMENT', `re-select after second upsert error: ${r2.message}`); return; }
  if (after2.length !== 1) { fail('EQUIPMENT', `expected 1 row after second upsert, got ${after2.length} (constraint not deduping)`); return; }
  pass('EQUIPMENT', `unique constraint dedupes — exactly 1 row after 2 upserts`);
}

async function jointLoad() {
  // 3. LOAD: the job-load query in inventory/forecast filters
  // service_products by detailer_id + service_id. Asserts our test link is
  // returned by that exact query shape.
  const { data: links, error } = await supabase
    .from('service_products')
    .select('product_id')
    .eq('detailer_id', DETAILER_ID)
    .eq('service_id', cleanup.serviceId);
  if (error) { fail('LOAD', `job-load query error: ${error.message}`); return; }
  const found = (links || []).some(l => l.product_id === cleanup.productId);
  if (!found) {
    fail('LOAD', `test product not returned by job-load query (got ${links?.length || 0} rows, none matched)`);
    return;
  }
  pass('LOAD', `test product returned by detailer_id-scoped service_products query`);
}

async function jointUsageLearn(recordUsageAndLearn) {
  // 4. USAGE->LEARN: call recordUsageAndLearn 3x with quantity=3 each, then
  // SELECT product_consumption_averages and assert sample_count >= 3 AND
  // avg_quantity = 3.
  for (let i = 0; i < 3; i++) {
    try {
      await recordUsageAndLearn(supabase, {
        detailerId: DETAILER_ID,
        jobId: cleanup.quoteId,
        productId: cleanup.productId,
        serviceId: cleanup.serviceId,
        quantityUsed: 3,
        unit: 'oz',
        aircraftMake: 'TEST',
        aircraftModel: 'TEST-MODEL',
        aircraftCategory: 'test_cat',
        loggedBy: null,
      });
    } catch (e) {
      fail('USAGE->LEARN', `recordUsageAndLearn threw on iteration ${i + 1}: ${e.message}`);
      return;
    }
  }

  const { data: avg, error } = await supabase
    .from('product_consumption_averages')
    .select('sample_count, avg_quantity')
    .eq('detailer_id', DETAILER_ID)
    .eq('product_id', cleanup.productId)
    .eq('service_id', cleanup.serviceId)
    .eq('aircraft_category', 'test_cat')
    .single();
  if (error || !avg) { fail('USAGE->LEARN', `averages re-select failed: ${error?.message || 'no row'}`); return; }
  if ((avg.sample_count || 0) < 3) {
    fail('USAGE->LEARN', `sample_count=${avg.sample_count}, expected >= 3`); return;
  }
  if (parseFloat(avg.avg_quantity) !== 3) {
    fail('USAGE->LEARN', `avg_quantity=${avg.avg_quantity}, expected 3`); return;
  }
  pass('USAGE->LEARN', `sample_count=${avg.sample_count}, avg_quantity=${avg.avg_quantity}`);
}

async function jointForecast() {
  // 5. FORECAST: re-read the same average row and confirm the forecast's
  // learned branch (sample_count >= 3) would use avg_quantity > 0 as the
  // chosen estimate. Mirrors the gate at app/api/inventory/forecast/route.js.
  const { data: avg, error } = await supabase
    .from('product_consumption_averages')
    .select('sample_count, avg_quantity')
    .eq('detailer_id', DETAILER_ID)
    .eq('product_id', cleanup.productId)
    .eq('service_id', cleanup.serviceId)
    .eq('aircraft_category', 'test_cat')
    .single();
  if (error || !avg) { fail('FORECAST', `read average failed: ${error?.message || 'no row'}`); return; }

  const sampleCount = avg.sample_count || 0;
  const avgQty = parseFloat(avg.avg_quantity) || 0;
  if (sampleCount < 3) {
    fail('FORECAST', `learned branch gate (sample_count >= 3) NOT triggered: count=${sampleCount}`); return;
  }
  if (avgQty <= 0) {
    fail('FORECAST', `avg_quantity not positive: ${avgQty}`); return;
  }
  pass('FORECAST', `learned branch active (sample_count=${sampleCount}), estimate=${avgQty}`);
}

async function main() {
  console.log(`\nRound-trip verification for detailer ${DETAILER_ID}`);
  console.log(`Tag: ${TAG}\n`);

  // Lazy import so we can clean up even if the import fails. The file uses
  // ESM syntax; Node 22+ auto-detects.
  let recordUsageAndLearn;
  try {
    const mod = await import('../lib/record-usage.js');
    recordUsageAndLearn = mod.recordUsageAndLearn;
    if (typeof recordUsageAndLearn !== 'function') {
      throw new Error('recordUsageAndLearn export not a function');
    }
  } catch (e) {
    console.error(`FAIL  SETUP: could not import lib/record-usage.js: ${e.message}`);
    process.exit(1);
  }

  try {
    await createParents();
    await jointLink();
    await jointEquipment();
    await jointLoad();
    await jointUsageLearn(recordUsageAndLearn);
    await jointForecast();
  } catch (e) {
    console.error(`FAIL  SETUP: ${e.message}`);
    results.push({ joint: 'SETUP', ok: false, msg: e.message });
  } finally {
    try { await dropTestRows(); } catch (e) { console.error(`Cleanup error: ${e.message}`); }
  }

  const failed = results.filter(r => !r.ok);
  console.log('\n----------------------------------------');
  console.log(`Total: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
  console.log('----------------------------------------\n');
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
