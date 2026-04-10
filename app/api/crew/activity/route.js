import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// POST — crew member logs an activity
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
