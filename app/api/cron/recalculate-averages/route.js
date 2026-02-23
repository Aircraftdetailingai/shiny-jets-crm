import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Recalculate hours averages (called by cron nightly)
export async function GET(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get all hours_log entries (actual DB columns)
    const { data: logs, error } = await supabase
      .from('hours_log')
      .select('aircraft_id, aircraft_model, service_type, actual_hours')
      .not('aircraft_id', 'is', null);

    if (error) {
      console.error('Failed to fetch hours logs:', error);
      return Response.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    if (!logs || logs.length === 0) {
      return Response.json({ success: true, groups_processed: 0, message: 'No data to process' });
    }

    // Group by aircraft_id + service_type
    const groups = {};
    for (const log of logs) {
      if (!log.service_type) continue;
      const key = `${log.aircraft_id}::${log.service_type}`;
      if (!groups[key]) {
        groups[key] = {
          aircraft_id: log.aircraft_id,
          aircraft_model: log.aircraft_model,
          service_type: log.service_type,
          values: [],
        };
      }
      groups[key].values.push(parseFloat(log.actual_hours) || 0);
    }

    // Upsert into hours_averages (uses actual DB columns: aircraft_model, service_type, sample_count)
    let processed = 0;

    for (const group of Object.values(groups)) {
      const count = group.values.length;

      const { error: upsertError } = await supabase
        .from('hours_averages')
        .upsert({
          aircraft_model: group.aircraft_model,
          service_type: group.service_type,
          sample_count: count,
        }, {
          onConflict: 'aircraft_model,service_type',
        });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
      } else {
        processed++;
      }
    }

    return Response.json({
      success: true,
      groups_processed: processed,
      total_logs: logs.length,
    });
  } catch (err) {
    console.error('Recalculate averages error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
