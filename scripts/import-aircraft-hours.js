#!/usr/bin/env node

/**
 * Import aircraft hours reference spreadsheet into Supabase aircraft_hours table.
 *
 * Usage:
 *   npm install xlsx  (if not already installed)
 *   node scripts/import-aircraft-hours.js /path/to/aircraft_hours_with_SA.xlsx
 *
 * The spreadsheet has 29 sheets (one per manufacturer). Each sheet has columns:
 * Make, Model, Seats, Fuselage Width, Fuselage Length, Footprint,
 * Skin Surface Area (sq ft), Maintenance Wash Hours, Decon Paint Hours,
 * One Step Polish Hours, Fly Shiny Static Guard Wax Hours,
 * Fly Shiny Air Guard Spray Ceramic Hours, Fly Shiny Pro Ceramic Coating Hours,
 * Clean/Condition Leather Hours, Extract Carpets Hours,
 * Bronze Package Hours, Silver Package Hours, Gold Package Hours,
 * Platinum Package Hours, Shiny Jet Package Hours
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  console.error('Set them or create a .env.local file');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/import-aircraft-hours.js <path-to-xlsx>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Clean a numeric value — remove 'e' prefix, commas, whitespace, convert to number
 */
function cleanNum(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  let s = String(val).trim();
  // Remove leading 'e' (sometimes added by Excel to surface area)
  if (s.startsWith('e')) s = s.substring(1);
  // Remove commas and whitespace
  s = s.replace(/[,\s]/g, '');
  // Remove any non-numeric chars except . and -
  s = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Map spreadsheet column names to database column names
 */
function mapRow(row) {
  // Try to find values by various column name patterns
  const get = (...patterns) => {
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase().trim();
      for (const p of patterns) {
        if (k.includes(p.toLowerCase())) return row[key];
      }
    }
    return null;
  };

  const make = String(get('make') || '').trim();
  const model = String(get('model') || '').trim();

  if (!make || !model) return null;

  return {
    make,
    model,
    seats: cleanNum(get('seats', 'seat')),
    fuselage_width: cleanNum(get('fuselage width', 'fuse width')),
    fuselage_length: cleanNum(get('fuselage length', 'fuse length')),
    footprint: cleanNum(get('footprint')),
    skin_surface_area: cleanNum(get('skin surface area', 'surface area')),
    maintenance_wash_hrs: cleanNum(get('maintenance wash')),
    decon_paint_hrs: cleanNum(get('decon paint', 'decon')),
    one_step_polish_hrs: cleanNum(get('one step polish', 'polish')),
    wax_hrs: cleanNum(get('wax hours', 'static guard wax', 'wax')),
    spray_ceramic_hrs: cleanNum(get('spray ceramic', 'air guard spray')),
    ceramic_coating_hrs: cleanNum(get('ceramic coating', 'pro ceramic')),
    leather_hrs: cleanNum(get('leather hours', 'clean/condition leather', 'leather')),
    carpet_hrs: cleanNum(get('carpet hours', 'extract carpet', 'carpet')),
    bronze_pkg_hrs: cleanNum(get('bronze package', 'bronze')),
    silver_pkg_hrs: cleanNum(get('silver package', 'silver')),
    gold_pkg_hrs: cleanNum(get('gold package', 'gold')),
    platinum_pkg_hrs: cleanNum(get('platinum package', 'platinum')),
    shiny_jet_pkg_hrs: cleanNum(get('shiny jet package', 'shiny jet')),
  };
}

async function main() {
  console.log(`Reading ${filePath}...`);
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  console.log(`Found ${sheetNames.length} sheets: ${sheetNames.join(', ')}\n`);

  let totalImported = 0;
  let totalSkipped = 0;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      console.log(`  [${sheetName}] Empty sheet, skipping`);
      continue;
    }

    const records = [];
    for (const row of rows) {
      const mapped = mapRow(row);
      if (mapped) records.push(mapped);
    }

    if (records.length === 0) {
      console.log(`  [${sheetName}] No valid rows found (${rows.length} raw rows)`);
      totalSkipped += rows.length;
      continue;
    }

    // Upsert in batches of 100
    let sheetImported = 0;
    const BATCH = 100;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await supabase
        .from('aircraft_hours')
        .upsert(batch, { onConflict: 'make,model', ignoreDuplicates: false });

      if (error) {
        console.error(`  [${sheetName}] Batch error:`, error.message);
        // Try one by one
        for (const rec of batch) {
          const { error: singleErr } = await supabase
            .from('aircraft_hours')
            .upsert(rec, { onConflict: 'make,model', ignoreDuplicates: false });
          if (singleErr) {
            console.error(`    Failed: ${rec.make} ${rec.model} — ${singleErr.message}`);
            totalSkipped++;
          } else {
            sheetImported++;
          }
        }
      } else {
        sheetImported += batch.length;
      }
    }

    console.log(`  [${sheetName}] Imported ${sheetImported}/${records.length} models`);
    totalImported += sheetImported;
  }

  console.log(`\nDone! Total imported: ${totalImported}, skipped: ${totalSkipped}`);

  // Verify counts
  const { count } = await supabase.from('aircraft_hours').select('*', { count: 'exact', head: true });
  console.log(`Total rows in aircraft_hours table: ${count}`);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
