import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Map reference service type to the aircraft column and a sensible fallback
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

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('service_calibrations')
      .select('*')
      .eq('detailer_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('calibrations GET error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ calibrations: data || [] });
  } catch (e) {
    console.error('calibrations GET exception:', e);
    return Response.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { service_id, service_name, reference_service_type, adjustment_pct } = body || {};

    if (!service_id || !service_name || !reference_service_type) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const adjPct = Number.isFinite(Number(adjustment_pct)) ? Number(adjustment_pct) : 0;

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    // 1. Upsert calibration
    const { error: calibErr } = await supabase
      .from('service_calibrations')
      .upsert(
        {
          detailer_id: user.id,
          service_id,
          service_name,
          reference_service_type,
          adjustment_pct: adjPct,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'detailer_id,service_id' }
      );

    if (calibErr) {
      console.error('calibration upsert error:', calibErr);
      return Response.json({ error: calibErr.message }, { status: 500 });
    }

    // 2. Fetch aircraft
    const { data: aircraft, error: acErr } = await supabase
      .from('aircraft')
      .select('*');

    if (acErr) {
      console.error('aircraft fetch error:', acErr);
      return Response.json({ error: acErr.message }, { status: 500 });
    }

    // 3-4. Compute and build overrides
    const multiplier = 1 + adjPct / 100;
    const overrides = (aircraft || []).map((ac) => {
      const refHours = computeReferenceHours(ac, reference_service_type);
      const calibratedHours = Math.round(refHours * multiplier * 100) / 100;
      return {
        detailer_id: user.id,
        aircraft_id: ac.id,
        service_id,
        service_name,
        hours: calibratedHours,
      };
    });

    let appliedCount = 0;
    if (overrides.length > 0) {
      const { error: ovErr } = await supabase
        .from('detailer_aircraft_overrides')
        .upsert(overrides, { onConflict: 'detailer_id,aircraft_id,service_id' });

      if (ovErr) {
        console.error('overrides upsert error:', ovErr);
        return Response.json({ error: ovErr.message }, { status: 500 });
      }
      appliedCount = overrides.length;
    }

    return Response.json({ success: true, applied_count: appliedCount });
  } catch (e) {
    console.error('calibrations POST exception:', e);
    return Response.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { service_id } = body || {};
    if (!service_id) {
      return Response.json({ error: 'Missing service_id' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { error: calErr } = await supabase
      .from('service_calibrations')
      .delete()
      .eq('detailer_id', user.id)
      .eq('service_id', service_id);

    if (calErr) {
      console.error('calibration delete error:', calErr);
      return Response.json({ error: calErr.message }, { status: 500 });
    }

    const { error: ovErr } = await supabase
      .from('detailer_aircraft_overrides')
      .delete()
      .eq('detailer_id', user.id)
      .eq('service_id', service_id);

    if (ovErr) {
      console.error('override delete error:', ovErr);
      return Response.json({ error: ovErr.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error('calibrations DELETE exception:', e);
    return Response.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
