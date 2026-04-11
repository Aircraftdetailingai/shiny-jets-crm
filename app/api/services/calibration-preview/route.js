import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

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
  compound: { column: 'compound_hours', fallback: 16 },
  wax: { column: 'wax_hours', fallback: 6 },
  ceramic: { column: 'ceramic_hours', fallback: 18 },
  detail_interior: { column: 'int_detail_hours', fallback: 6 },
  leather: { column: 'leather_hours', fallback: 4 },
};

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
    const referenceType = searchParams.get('reference_type') || 'wash';
    const adjPctRaw = searchParams.get('adjustment_pct');
    const adjPct = Number.isFinite(Number(adjPctRaw)) ? Number(adjPctRaw) : 0;
    const multiplier = 1 + adjPct / 100;

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

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
      const refHours = computeReferenceHours(sample, referenceType);
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
