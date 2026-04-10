import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET — owner views crew activity log
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const member_id = searchParams.get('member_id');
  const job_id = searchParams.get('job_id');
  const action_type = searchParams.get('action_type');
  const days = parseInt(searchParams.get('days')) || 7;

  const supabase = getSupabase();

  let query = supabase
    .from('crew_activity_log')
    .select('*')
    .eq('detailer_id', user.id)
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  if (member_id) query = query.eq('team_member_id', member_id);
  if (job_id) query = query.eq('job_id', job_id);
  if (action_type) query = query.eq('action_type', action_type);

  const { data, error } = await query;

  if (error) {
    console.error('[team/activity] GET error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ activities: data || [] });
}
