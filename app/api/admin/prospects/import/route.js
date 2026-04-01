import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// POST — import FAA airport data
export async function POST(request) {
  if (!await isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  try {
    // Fetch FAA Facilities data (public CSV)
    // The NASR APT (Airport) data from FAA
    const FAA_URL = 'https://opendata.arcgis.com/api/v3/datasets/e747ab91a11045e8b3f8a3efd093d3b5_0/downloads/data?format=csv&spatialRefId=4326';

    const response = await fetch(FAA_URL, {
      headers: { 'User-Agent': 'Shiny Jets CRM' },
    });

    if (!response.ok) {
      // Fallback: try alternate FAA data source
      return Response.json({ error: `FAA data fetch failed: ${response.status}` }, { status: 502 });
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      return Response.json({ error: 'No data in FAA CSV' }, { status: 502 });
    }

    // Parse header
    const headers = parseCSVLine(lines[0]).map(h => h.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));

    // Find column indices - try multiple possible column names
    const findCol = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));

    const nameCol = findCol('FACILITY_NAME', 'FAC_NAME', 'ARPT_NAME', 'NAME');
    const icaoCol = findCol('ICAO_ID', 'ICAO');
    const faaIdCol = findCol('LOCID', 'LOC_ID', 'FAA_ID', 'IDENT', 'SITE_NO', 'LOCATION_ID');
    const cityCol = findCol('CITY', 'ASSOC_CITY');
    const stateCol = findCol('STATE_CODE', 'STATE', 'STATE_NAME');
    const typeCol = findCol('TYPE_CODE', 'FACILITY_TYPE', 'FAC_TYPE', 'TYPE');
    const runwayCol = findCol('RUNWAY', 'RWY_COUNT', 'RUNWAYS');

    // Parse airports
    const airports = new Map();

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length < 3) continue;

      const type = typeCol >= 0 ? fields[typeCol]?.toUpperCase() : '';
      // Include airports, exclude heliports and seaplane bases unless we don't have type info
      if (typeCol >= 0 && type && !type.includes('AIRPORT') && type !== 'A' && type !== 'APT') {
        continue;
      }

      const name = nameCol >= 0 ? fields[nameCol] : '';
      const faaId = faaIdCol >= 0 ? fields[faaIdCol] : '';
      const icao = icaoCol >= 0 ? fields[icaoCol] : '';
      const city = cityCol >= 0 ? fields[cityCol] : '';
      const state = stateCol >= 0 ? fields[stateCol] : '';

      if (!name && !faaId) continue;

      const key = faaId || name;
      if (airports.has(key)) {
        // Count runways by incrementing for duplicate entries
        airports.get(key).runway_count++;
      } else {
        airports.set(key, {
          airport_name: name || null,
          icao: icao || null,
          faa_id: faaId || null,
          city: city || null,
          state: state?.length === 2 ? state.toUpperCase() : (state || '').substring(0, 2).toUpperCase() || null,
          runway_count: runwayCol >= 0 && fields[runwayCol] ? parseInt(fields[runwayCol]) || 1 : 1,
          source: 'faa',
        });
      }
    }

    const records = Array.from(airports.values()).filter(a => a.state && a.airport_name);

    if (records.length === 0) {
      return Response.json({ error: 'No valid airports parsed from CSV', headersSample: headers.slice(0, 20) }, { status: 422 });
    }

    // Batch upsert into prospects (500 at a time)
    let imported = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      const { error } = await supabase
        .from('prospects')
        .upsert(batch, { onConflict: 'faa_id', ignoreDuplicates: false });

      if (error) {
        // If upsert fails due to missing unique constraint, do insert with ignore
        for (const record of batch) {
          const { error: singleErr } = await supabase
            .from('prospects')
            .insert(record)
            .select()
            .single();

          if (!singleErr) imported++;
        }
      } else {
        imported += batch.length;
      }
    }

    return Response.json({
      success: true,
      imported,
      total_parsed: records.length,
      sample: records.slice(0, 5),
    });
  } catch (err) {
    console.error('FAA import error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
