import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveReferenceColumn } from '@/lib/calibration-reference';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const REFERENCE_MAP = {
  wash: { column: 'ext_wash_hours', fallback: 2 },
  polish: { column: 'polish_hours', fallback: 12 },
  compound: { column: 'polish_hours', fallback: 16 },
  wax: { column: 'wax_hours', fallback: 6 },
  ceramic: { column: 'ceramic_hours', fallback: 18 },
  detail_interior: { column: 'int_detail_hours', fallback: 6 },
  leather: { column: 'leather_hours', fallback: 4 },
};

// aircraft_hours uses different column names than `aircraft`. Anchor rows come
// from aircraft_hours, so we map reference_type → that table's *_hrs columns
// via the shared calibration-reference module (single source of truth for the
// preview and the apply path — they can no longer drift).
function anchorRefHours(row, type) {
  if (!row) return null;
  const col = resolveReferenceColumn(type);
  const raw = row[col];
  const num = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getReferenceInfo(type) {
  return REFERENCE_MAP[type] || { column: 'ext_wash_hours', fallback: 2 };
}

function computeReferenceHours(aircraft, type) {
  const info = getReferenceInfo(type);
  const raw = aircraft?.[info.column];
  const num = typeof raw === 'number' ? raw : parseFloat(raw);
  if (Number.isFinite(num) && num > 0) return num;
  return info.fallback;
}

// Candidate category labels (normalized substrings) for the 4 buckets
const CATEGORY_BUCKETS = [
  { key: 'light jet', matches: ['light'] },
  { key: 'mid jet', matches: ['mid', 'midsize', 'super mid'] },
  { key: 'heavy jet', matches: ['heavy'] },
  { key: 'ultra long range', matches: ['ultra', 'long range', 'ultra long'] },
];

function pickSample(aircraft, bucket) {
  const lowerMatches = bucket.matches.map((m) => m.toLowerCase());
  return (
    aircraft.find((ac) => {
      const cat = (ac.category || '').toLowerCase();
      return lowerMatches.some((m) => cat.includes(m));
    }) || null
  );
}

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    let referenceType = searchParams.get('reference_type') || 'wash';
    const adjPctRaw = searchParams.get('adjustment_pct');
    const adjPct = Number.isFinite(Number(adjPctRaw)) ? Number(adjPctRaw) : 0;
    const multiplier = Math.max(0, 1 + adjPct / 100);
    const anchorAId = searchParams.get('anchor_a') || null;
    const anchorBId = searchParams.get('anchor_b') || null;

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    // If reference is a detailer's own service (svc:uuid), resolve its hours_field
    let svcHoursField = null;
    if (referenceType.startsWith('svc:')) {
      const svcId = referenceType.slice(4);
      const { data: svcRow } = await supabase.from('services').select('hours_field').eq('id', svcId).maybeSingle();
      if (svcRow?.hours_field) {
        svcHoursField = svcRow.hours_field;
      }
      // Fall back to standard type mapping
      referenceType = 'wash';
    }

    // Anchor preview: when both anchor uuids are passed, the detailer has
    // calibration anchors saved. Show the preview against THOSE two aircraft
    // (Brett: Gulfstream G4 + Citation CJ3) instead of the hardcoded category
    // bucket samples, so the detailer sees calibration applied to aircraft
    // they actually know.
    if (anchorAId && anchorBId) {
      const { data: anchorRows, error: anchorErr } = await supabase
        .from('aircraft_hours')
        .select('*')
        .in('id', [anchorAId, anchorBId]);
      if (!anchorErr && anchorRows && anchorRows.length > 0) {
        // Preserve A → B order regardless of DB row order
        const ordered = [anchorAId, anchorBId]
          .map((id) => anchorRows.find((r) => r.id === id))
          .filter(Boolean);
        const samples = ordered.map((row) => {
          const refHours = anchorRefHours(row, referenceType) ?? getReferenceInfo(referenceType).fallback;
          const calibratedHours = Math.round(refHours * multiplier * 100) / 100;
          return {
            category: 'anchor',
            model: `${row.make || ''} ${row.model || ''}`.trim(),
            reference_hours: refHours,
            calibrated_hours: calibratedHours,
          };
        });
        return Response.json({ samples });
      }
      // If lookup fails, fall through to bucket-sample fallback below
      if (anchorErr) console.error('calibration-preview anchor lookup error:', anchorErr);
    }

    const { data: aircraft, error } = await supabase
      .from('aircraft')
      .select('*');

    if (error) {
      console.error('aircraft fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const samples = [];
    for (const bucket of CATEGORY_BUCKETS) {
      const sample = pickSample(aircraft || [], bucket);
      if (!sample) continue;
      // Use the resolved hours_field from the detailer's service, or fall back to standard
      let refHours;
      if (svcHoursField && sample[svcHoursField] != null) {
        refHours = parseFloat(sample[svcHoursField]) || 0;
      } else {
        refHours = computeReferenceHours(sample, referenceType);
      }
      const calibratedHours = Math.round(refHours * multiplier * 100) / 100;
      samples.push({
        category: bucket.key,
        model: `${sample.manufacturer || ''} ${sample.model || ''}`.trim(),
        reference_hours: refHours,
        calibrated_hours: calibratedHours,
      });
    }

    return Response.json({ samples });
  } catch (e) {
    console.error('calibration-preview GET exception:', e);
    return Response.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
