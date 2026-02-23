import { getAuthUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
];

const HOURS_FIELD_LABELS = {
  ext_wash_hours: 'Exterior Wash',
  int_detail_hours: 'Interior Detail',
  leather_hours: 'Leather Treatment',
  carpet_hours: 'Carpet Cleaning',
  wax_hours: 'Wax Application',
  polish_hours: 'Polish',
  ceramic_hours: 'Ceramic Coating',
  brightwork_hours: 'Brightwork',
  decon_hours: 'Decontamination',
  spray_ceramic_hours: 'Spray Ceramic',
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return null;
  if (!ADMIN_EMAILS.includes(user.email?.toLowerCase())) return null;
  return user;
}

// GET - Compute data intelligence directly from hours_log
export async function GET(request) {
  try {
    const user = await isAdmin(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || '';
    const manufacturer = searchParams.get('manufacturer') || '';
    const hoursField = searchParams.get('hours_field') || '';
    const minSamples = parseInt(searchParams.get('min_samples')) || 3;

    // Fetch all hours_log entries (uses actual DB columns: aircraft_id, aircraft_model, service_type, actual_hours)
    const { data: logs, error } = await supabase
      .from('hours_log')
      .select('id, detailer_id, aircraft_id, aircraft_model, service_type, actual_hours, created_at')
      .not('aircraft_id', 'is', null);

    if (error) {
      console.error('Failed to fetch hours logs:', error);
      return Response.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    const totalLogs = logs?.length || 0;
    const uniqueAircraft = new Set(logs?.map(l => l.aircraft_id).filter(Boolean)).size;
    const uniqueDetailers = new Set(logs?.map(l => l.detailer_id)).size;
    const dates = logs?.map(l => l.created_at).filter(Boolean).sort() || [];

    if (!logs || logs.length === 0) {
      return Response.json({
        stats: { total_logs: 0, unique_aircraft: 0, unique_detailers: 0, flagged_count: 0 },
        data: [],
        suggestions: [],
      });
    }

    // Group by aircraft_id + service_type and compute averages on the fly
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

    // Filter by min samples
    const qualifiedGroups = Object.values(groups).filter(g => g.values.length >= minSamples);

    // Filter by hours_field if specified
    const filteredGroups = hoursField
      ? qualifiedGroups.filter(g => g.service_type === hoursField)
      : qualifiedGroups;

    // Get aircraft data for all referenced aircraft
    const aircraftIds = [...new Set(filteredGroups.map(g => g.aircraft_id).filter(Boolean))];
    let aircraftMap = {};

    if (aircraftIds.length > 0) {
      const { data: aircraftList } = await supabase
        .from('aircraft')
        .select('id, manufacturer, model, category, ext_wash_hours, int_detail_hours, leather_hours, carpet_hours, wax_hours, polish_hours, ceramic_hours, brightwork_hours, decon_hours, spray_ceramic_hours')
        .in('id', aircraftIds);

      if (aircraftList) {
        aircraftList.forEach(a => { aircraftMap[a.id] = a; });
      }
    }

    // Build response with computed stats
    let data = filteredGroups.map(group => {
      const aircraft = aircraftMap[group.aircraft_id];
      if (!aircraft) return null;

      if (category && aircraft.category !== category) return null;
      if (manufacturer && aircraft.manufacturer !== manufacturer) return null;

      const values = group.values.sort((a, b) => a - b);
      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / count;
      const min = values[0];
      const max = values[count - 1];
      const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
      const stddev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / count);

      const currentDefault = parseFloat(aircraft[group.service_type]) || 0;
      const variancePercent = currentDefault > 0
        ? ((avg - currentDefault) / currentDefault) * 100
        : 0;

      let varianceFlag = 'ok';
      if (variancePercent > 10) varianceFlag = 'over';
      else if (variancePercent < -10) varianceFlag = 'under';

      return {
        aircraft_id: group.aircraft_id,
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        category: aircraft.category,
        hours_field: group.service_type,
        hours_field_label: HOURS_FIELD_LABELS[group.service_type] || group.service_type,
        current_default: currentDefault,
        avg_actual: Math.round(avg * 100) / 100,
        min_actual: Math.round(min * 100) / 100,
        max_actual: Math.round(max * 100) / 100,
        sample_count: count,
        stddev: Math.round(stddev * 100) / 100,
        variance_percent: Math.round(variancePercent * 10) / 10,
        variance_flag: varianceFlag,
      };
    }).filter(Boolean);

    data.sort((a, b) => Math.abs(b.variance_percent) - Math.abs(a.variance_percent));

    const flaggedCount = data.filter(d => d.variance_flag !== 'ok').length;
    const suggestions = [];

    if (flaggedCount > 0) {
      suggestions.push(`${flaggedCount} aircraft/service combos have >10% variance from defaults`);
    }

    data.filter(d => d.variance_flag === 'over' && d.sample_count >= 10).slice(0, 3).forEach(item => {
      suggestions.push(
        `${item.manufacturer} ${item.model} ${item.hours_field_label}: default may be ${Math.abs(item.variance_percent).toFixed(1)}% too low (${item.sample_count} data points)`
      );
    });

    data.filter(d => d.variance_flag === 'under' && d.sample_count >= 10).slice(0, 3).forEach(item => {
      suggestions.push(
        `${item.manufacturer} ${item.model} ${item.hours_field_label}: default may be ${Math.abs(item.variance_percent).toFixed(1)}% too high (${item.sample_count} data points)`
      );
    });

    return Response.json({
      stats: {
        total_logs: totalLogs,
        unique_aircraft: uniqueAircraft,
        unique_detailers: uniqueDetailers,
        earliest_log: dates[0] || null,
        latest_log: dates[dates.length - 1] || null,
        flagged_count: flaggedCount,
      },
      data,
      suggestions,
    });
  } catch (err) {
    console.error('Data intelligence error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
