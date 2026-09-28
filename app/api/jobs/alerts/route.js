import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET — unacknowledged alerts for the owner
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  const supabase = getSupabase();

  const { data: alerts, error } = await supabase
    .from('job_alerts')
    .select(`
      id,
      job_id,
      alert_type,
      actual_hours,
      estimated_hours,
      overage_hours,
      created_at,
      jobs ( aircraft_model, tail_number )
    `)
    .eq('detailer_id', user.detailer_id || user.id)
    .eq('acknowledged', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[jobs/alerts] GET error:', error.message);
    return Response.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }

  // Flatten the joined job data
  const formatted = (alerts || []).map(a => ({
    id: a.id,
    job_id: a.job_id,
    alert_type: a.alert_type,
    actual_hours: a.actual_hours,
    estimated_hours: a.estimated_hours,
    overage_hours: a.overage_hours,
    created_at: a.created_at,
    aircraft_model: a.jobs?.aircraft_model || null,
    tail_number: a.jobs?.tail_number || null,
  }));

  return Response.json({ alerts: formatted });
}

// PATCH — acknowledge an alert
export async function PATCH(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  const { alert_id } = await request.json();
  if (!alert_id) return Response.json({ error: 'alert_id is required' }, { status: 400 });

  const supabase = getSupabase();

  const { error } = await supabase
    .from('job_alerts')
    .update({ acknowledged: true })
    .eq('id', alert_id)
    .eq('detailer_id', user.detailer_id || user.id);

  if (error) {
    console.error('[jobs/alerts] PATCH error:', error.message);
    return Response.json({ error: 'Failed to acknowledge alert' }, { status: 500 });
  }

  return Response.json({ success: true });
}
