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

    // Get all hours_log entries
    const { data: logs, error } = await supabase
      .from('hours_log')
      .select('aircraft_id, aircraft_manufacturer, aircraft_model, hours_field, actual_hours')
      .not('aircraft_id', 'is', null);

    if (error) {
      console.error('Failed to fetch hours logs:', error);
      return Response.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    if (!logs || logs.length === 0) {
      return Response.json({ success: true, groups_processed: 0, message: 'No data to process' });
    }

    // Group by aircraft_id + hours_field
    const groups = {};
    for (const log of logs) {
      const key = `${log.aircraft_id}::${log.hours_field}`;
      if (!groups[key]) {
        groups[key] = {
          aircraft_id: log.aircraft_id,
          aircraft_manufacturer: log.aircraft_manufacturer,
          aircraft_model: log.aircraft_model,
          hours_field: log.hours_field,
          values: [],
        };
      }
      groups[key].values.push(parseFloat(log.actual_hours) || 0);
    }

    // Calculate stats and upsert
    let processed = 0;

    for (const group of Object.values(groups)) {
      const values = group.values.sort((a, b) => a - b);
      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / count;
      const min = values[0];
      const max = values[count - 1];

      // Standard deviation
      const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
      const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / count;
      const stddev = Math.sqrt(avgSquaredDiff);

      // Upsert into hours_averages
      const { error: upsertError } = await supabase
        .from('hours_averages')
        .upsert({
          aircraft_id: group.aircraft_id,
          aircraft_manufacturer: group.aircraft_manufacturer,
          aircraft_model: group.aircraft_model,
          hours_field: group.hours_field,
          avg_actual_hours: Math.round(avg * 100) / 100,
          min_actual_hours: Math.round(min * 100) / 100,
          max_actual_hours: Math.round(max * 100) / 100,
          sample_count: count,
          stddev_hours: Math.round(stddev * 100) / 100,
          last_calculated_at: new Date().toISOString(),
        }, {
          onConflict: 'aircraft_id,hours_field',
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
