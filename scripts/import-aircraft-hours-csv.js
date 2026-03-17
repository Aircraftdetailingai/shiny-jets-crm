#!/usr/bin/env node

/**
 * Import aircraft hours from CSV into Supabase aircraft_hours table.
 *
 * Usage:
 *   node scripts/import-aircraft-hours-csv.js [path-to-csv]
 *
 * Defaults to data/aircraft_hours_all.csv if no path given.
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env.local if present
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const csvPath = process.argv[2] || path.join(__dirname, '..', 'data', 'aircraft_hours_all.csv');

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

function cleanNum(val) {
  if (!val || val.trim() === '') return null;
  let s = val.trim();
  if (s.startsWith('e')) s = s.substring(1);
  s = s.replace(/[,\s]/g, '');
  s = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

async function main() {
  console.log(`Reading ${csvPath}...`);
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  // Skip header
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const make = (fields[0] || '').trim();
    const model = (fields[1] || '').trim();
    if (!make || !model) continue;

    records.push({
      make,
      model,
      seats: cleanNum(fields[2]),
      fuselage_width: cleanNum(fields[3]),
      fuselage_length: cleanNum(fields[4]),
      footprint: cleanNum(fields[5]),
      skin_surface_area: cleanNum(fields[6]),
      maintenance_wash_hrs: cleanNum(fields[7]),
      decon_paint_hrs: cleanNum(fields[8]),
      one_step_polish_hrs: cleanNum(fields[9]),
      wax_hrs: cleanNum(fields[10]),
      spray_ceramic_hrs: cleanNum(fields[11]),
      ceramic_coating_hrs: cleanNum(fields[12]),
      leather_hrs: cleanNum(fields[13]),
      carpet_hrs: cleanNum(fields[14]),
      bronze_pkg_hrs: cleanNum(fields[15]),
      silver_pkg_hrs: cleanNum(fields[16]),
      gold_pkg_hrs: cleanNum(fields[17]),
      platinum_pkg_hrs: cleanNum(fields[18]),
      shiny_jet_pkg_hrs: cleanNum(fields[19]),
    });
  }

  console.log(`Parsed ${records.length} aircraft models`);

  // Upsert in batches of 50
  let imported = 0;
  let failed = 0;
  const BATCH = 50;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from('aircraft_hours')
      .upsert(batch, { onConflict: 'make,model', ignoreDuplicates: false });

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH) + 1} error: ${error.message}`);
      // Try one by one
      for (const rec of batch) {
        const { error: singleErr } = await supabase
          .from('aircraft_hours')
          .upsert(rec, { onConflict: 'make,model', ignoreDuplicates: false });
        if (singleErr) {
          console.error(`  Failed: ${rec.make} ${rec.model} — ${singleErr.message}`);
          failed++;
        } else {
          imported++;
        }
      }
    } else {
      imported += batch.length;
    }
    process.stdout.write(`\r  Imported ${imported}/${records.length}...`);
  }

  console.log(`\n\nDone! Imported: ${imported}, Failed: ${failed}`);

  const { count } = await supabase.from('aircraft_hours').select('*', { count: 'exact', head: true });
  console.log(`Total rows in aircraft_hours table: ${count}`);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
