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

// GET - Get aggregated data intelligence
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

    // Get collection stats
    const { data: logStats } = await supabase
      .from('hours_log')
      .select('id, detailer_id, aircraft_id, created_at');

    const totalLogs = logStats?.length || 0;
    const uniqueAircraft = new Set(logStats?.map(l => l.aircraft_id).filter(Boolean)).size;
    const uniqueDetailers = new Set(logStats?.map(l => l.detailer_id)).size;
    const dates = logStats?.map(l => l.created_at).filter(Boolean).sort() || [];

    // Get averages
    let averagesQuery = supabase
      .from('hours_averages')
      .select('*')
      .gte('sample_count', minSamples);

    if (hoursField) {
      averagesQuery = averagesQuery.eq('hours_field', hoursField);
    }

    const { data: averages } = await averagesQuery;

    if (!averages || averages.length === 0) {
      return Response.json({
        stats: {
          total_logs: totalLogs,
          unique_aircraft: uniqueAircraft,
          unique_detailers: uniqueDetailers,
          earliest_log: dates[0] || null,
          latest_log: dates[dates.length - 1] || null,
        },
        data: [],
        suggestions: [],
      });
    }

    // Get aircraft data for the averages
    const aircraftIds = [...new Set(averages.map(a => a.aircraft_id).filter(Boolean))];
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

    // Build response data with variance
    let data = averages.map(avg => {
      const aircraft = aircraftMap[avg.aircraft_id];
      if (!aircraft) return null;

      // Apply filters
      if (category && aircraft.category !== category) return null;
      if (manufacturer && aircraft.manufacturer !== manufacturer) return null;

      const currentDefault = parseFloat(aircraft[avg.hours_field]) || 0;
      const avgActual = parseFloat(avg.avg_actual_hours) || 0;
      const variancePercent = currentDefault > 0
        ? ((avgActual - currentDefault) / currentDefault) * 100
        : 0;

      let varianceFlag = 'ok';
      if (variancePercent > 10) varianceFlag = 'over';
      else if (variancePercent < -10) varianceFlag = 'under';

      return {
        aircraft_id: avg.aircraft_id,
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        category: aircraft.category,
        hours_field: avg.hours_field,
        hours_field_label: HOURS_FIELD_LABELS[avg.hours_field] || avg.hours_field,
        current_default: currentDefault,
        avg_actual: avgActual,
        min_actual: parseFloat(avg.min_actual_hours) || 0,
        max_actual: parseFloat(avg.max_actual_hours) || 0,
        sample_count: avg.sample_count,
        stddev: parseFloat(avg.stddev_hours) || 0,
        variance_percent: Math.round(variancePercent * 10) / 10,
        variance_flag: varianceFlag,
      };
    }).filter(Boolean);

    // Sort by absolute variance descending
    data.sort((a, b) => Math.abs(b.variance_percent) - Math.abs(a.variance_percent));

    // Generate suggestions
    const flaggedCount = data.filter(d => d.variance_flag !== 'ok').length;
    const suggestions = [];

    if (flaggedCount > 0) {
      suggestions.push(`${flaggedCount} aircraft/service combos have >10% variance from defaults`);
    }

    const overItems = data.filter(d => d.variance_flag === 'over' && d.sample_count >= 10);
    overItems.slice(0, 3).forEach(item => {
      suggestions.push(
        `${item.manufacturer} ${item.model} ${item.hours_field_label} may be ${Math.abs(item.variance_percent).toFixed(1)}% too low based on ${item.sample_count} data points`
      );
    });

    const underItems = data.filter(d => d.variance_flag === 'under' && d.sample_count >= 10);
    underItems.slice(0, 3).forEach(item => {
      suggestions.push(
        `${item.manufacturer} ${item.model} ${item.hours_field_label} may be ${Math.abs(item.variance_percent).toFixed(1)}% too high based on ${item.sample_count} data points`
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
