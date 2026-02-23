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

// GET - Browse raw hours_log entries (admin only)
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
    const manufacturer = searchParams.get('manufacturer') || '';
    const hoursField = searchParams.get('hours_field') || '';
    const limit = parseInt(searchParams.get('limit')) || 200;

    // Query hours_log with actual DB columns
    let query = supabase
      .from('hours_log')
      .select('id, quote_id, detailer_id, aircraft_id, aircraft_model, service_type, actual_hours, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (hoursField) {
      query = query.eq('service_type', hoursField);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('Failed to fetch logs:', error);
      return Response.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    // Get aircraft info for manufacturer filtering and display
    const aircraftIds = [...new Set((logs || []).map(l => l.aircraft_id).filter(Boolean))];
    let aircraftMap = {};

    if (aircraftIds.length > 0) {
      const { data: aircraftList } = await supabase
        .from('aircraft')
        .select('id, manufacturer, model, ext_wash_hours, int_detail_hours, leather_hours, carpet_hours, wax_hours, polish_hours, ceramic_hours, brightwork_hours, decon_hours, spray_ceramic_hours')
        .in('id', aircraftIds);

      if (aircraftList) {
        aircraftList.forEach(a => { aircraftMap[a.id] = a; });
      }
    }

    // Get detailer names
    const detailerIds = [...new Set((logs || []).map(l => l.detailer_id).filter(Boolean))];
    let detailerMap = {};

    if (detailerIds.length > 0) {
      const { data: detailers } = await supabase
        .from('detailers')
        .select('id, name, email')
        .in('id', detailerIds);

      if (detailers) {
        detailers.forEach(d => { detailerMap[d.id] = d; });
      }
    }

    // Enrich logs with aircraft data and variance
    let enrichedLogs = (logs || []).map(log => {
      const aircraft = aircraftMap[log.aircraft_id];
      const detailer = detailerMap[log.detailer_id];
      const currentDefault = aircraft ? (parseFloat(aircraft[log.service_type]) || 0) : 0;
      const actual = parseFloat(log.actual_hours) || 0;
      const variancePercent = currentDefault > 0
        ? ((actual - currentDefault) / currentDefault) * 100
        : 0;

      return {
        id: log.id,
        created_at: log.created_at,
        detailer_name: detailer?.name || detailer?.email || 'Unknown',
        aircraft_id: log.aircraft_id,
        aircraft_manufacturer: aircraft?.manufacturer || '',
        aircraft_model: aircraft?.model || log.aircraft_model || '',
        service_type: log.service_type,
        hours_field_label: HOURS_FIELD_LABELS[log.service_type] || log.service_type,
        quoted_hours: currentDefault,
        actual_hours: log.actual_hours,
        variance_percent: Math.round(variancePercent * 10) / 10,
      };
    });

    // Filter by manufacturer if specified
    if (manufacturer) {
      enrichedLogs = enrichedLogs.filter(l => l.aircraft_manufacturer === manufacturer);
    }

    // Get unique manufacturers for filter dropdown
    const manufacturers = [...new Set(enrichedLogs.map(l => l.aircraft_manufacturer).filter(Boolean))].sort();

    return Response.json({
      logs: enrichedLogs,
      manufacturers,
      total: enrichedLogs.length,
    });
  } catch (err) {
    console.error('Admin hours log error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
