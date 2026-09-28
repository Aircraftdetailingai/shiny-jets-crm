import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'team', { user: user });
  if (planGate) return planGate;

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end) {
    return Response.json({ error: 'start and end parameters required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, role, color, availability, status')
    .eq('detailer_id', user.detailer_id || user.id)
    .eq('status', 'active');

  if (!members?.length) {
    return Response.json({ schedules: [] });
  }

  const memberIds = members.map(m => m.id);

  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('team_member_id, date, clock_in, clock_out, hours_worked, quote_id, approved')
    .in('team_member_id', memberIds)
    .gte('date', start.split('T')[0])
    .lte('date', end.split('T')[0])
    .order('date', { ascending: true });

  // Get assigned jobs for team members
  const { data: jobs } = await supabase
    .from('quotes')
    .select('id, client_name, aircraft_model, scheduled_date, status, assigned_team_member_ids')
    .eq('detailer_id', user.detailer_id || user.id)
    .gte('scheduled_date', start)
    .lte('scheduled_date', end)
    .not('scheduled_date', 'is', null);

  const schedules = members.map(m => {
    const memberEntries = (timeEntries || []).filter(e => e.team_member_id === m.id);
    const assignedJobs = (jobs || []).filter(j => {
      const assigned = j.assigned_team_member_ids || [];
      return assigned.includes(m.id);
    });

    return {
      member_id: m.id,
      member_name: m.name,
      role: m.role,
      color: m.color || '#3B82F6',
      availability: m.availability,
      entries: memberEntries,
      assigned_jobs: assignedJobs,
    };
  });

  return Response.json({ schedules });
}
