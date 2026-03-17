import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Fetch unresolved staffing alerts for authenticated detailer
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: alerts, error } = await supabase
    .from('staffing_alerts')
    .select('id, quote_id, scheduled_date, alert_type, created_at, quotes(id, client_name, client_email, aircraft_model, aircraft_type, total_price, assigned_team_member_ids, status)')
    .eq('detailer_id', user.id)
    .eq('resolved', false)
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('[staffing-alerts] fetch error:', error.message);
    return Response.json({ alerts: [] });
  }

  return Response.json({ alerts: alerts || [] });
}

// PATCH - Resolve a staffing alert
export async function PATCH(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return Response.json({ error: 'Alert ID required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('staffing_alerts')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq('id', id)
    .eq('detailer_id', user.id);

  if (error) {
    console.error('[staffing-alerts] resolve error:', error.message);
    return Response.json({ error: 'Failed to resolve alert' }, { status: 500 });
  }

  return Response.json({ success: true });
}
