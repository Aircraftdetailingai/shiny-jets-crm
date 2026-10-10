import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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
      .eq('detailer_id', user.detailer_id || user.id)
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
          detailer_id: user.detailer_id || user.id,
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

    // The ratio is applied live in quotes (lib/calibrate-hours.js). Do not
    // copy it onto detailer_aircraft_overrides — those rows are per-model
    // pins and must keep winning over the learned number. Writing one row
    // per aircraft turned every model into a pin and wiped real pins.
    return Response.json({ success: true, applied_live: true, applied_count: 0 });
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
      .eq('detailer_id', user.detailer_id || user.id)
      .eq('service_id', service_id);

    if (calErr) {
      console.error('calibration delete error:', calErr);
      return Response.json({ error: calErr.message }, { status: 500 });
    }

    const { error: ovErr } = await supabase
      .from('detailer_aircraft_overrides')
      .delete()
      .eq('detailer_id', user.detailer_id || user.id)
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
