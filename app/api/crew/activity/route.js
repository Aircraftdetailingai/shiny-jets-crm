import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const payload = await getAuthUser(request);
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// POST — crew member logs an activity
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'crewApp', { user: user });
  if (planGate) return planGate;

  const { job_id, action_type, action_details } = await request.json();

  if (!action_type) {
    return Response.json({ error: 'action_type is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const entry = {
    detailer_id: user.detailer_id,
    team_member_id: user.id,
    team_member_name: user.name,
    action_type,
    action_details: action_details || {},
  };

  if (job_id) entry.job_id = job_id;

  const { error } = await supabase
    .from('crew_activity_log')
    .insert(entry);

  if (error) {
    console.error('[crew/activity] POST error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
