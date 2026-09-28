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
  const planGate = await requireFeature(request, 'calendar', { user: user });
  if (planGate) return planGate;

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end) {
    return Response.json({ error: 'start and end parameters required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch all data sources in parallel
  const [jobsResult, gcalResult, detailerResult, teamResult] = await Promise.all([
    // 1. Jobs (quotes with scheduled_date)
    supabase
      .from('quotes')
      .select('id, client_name, aircraft_model, aircraft_type, tail_number, total_price, status, scheduled_date, time_preference, assigned_team_member_ids')
      .eq('detailer_id', user.detailer_id || user.id)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .not('scheduled_date', 'is', null)
      .order('scheduled_date', { ascending: true }),

    // 2. Google Calendar events (cached)
    supabase
      .from('google_calendar_events')
      .select('*')
      .eq('detailer_id', user.detailer_id || user.id)
      .gte('start_time', start)
      .lte('end_time', end)
      .order('start_time', { ascending: true }),

    // 3. Detailer availability (blocked dates)
    supabase
      .from('detailers')
      .select('availability')
      .eq('id', user.id)
      .single(),

    // 4. Team members with time entries
    supabase
      .from('team_members')
      .select('id, name, role, color, availability, status')
      .eq('detailer_id', user.detailer_id || user.id)
      .eq('status', 'active'),
  ]);

  const jobs = jobsResult.data || [];
  const googleEvents = gcalResult.data || [];
  const blockedDates = detailerResult.data?.availability?.blockedDates || [];

  // Fetch time entries for team schedules
  const teamMembers = teamResult.data || [];
  let teamSchedules = [];

  if (teamMembers.length > 0) {
    const memberIds = teamMembers.map(m => m.id);
    const { data: timeEntries } = await supabase
      .from('time_entries')
      .select('team_member_id, date, clock_in, clock_out, hours_worked')
      .in('team_member_id', memberIds)
      .gte('date', start.split('T')[0])
      .lte('date', end.split('T')[0]);

    teamSchedules = teamMembers.map(m => ({
      member_id: m.id,
      member_name: m.name,
      role: m.role,
      color: m.color || '#3B82F6',
      availability: m.availability,
      entries: (timeEntries || []).filter(e => e.team_member_id === m.id),
    }));
  }

  return Response.json({
    jobs,
    googleEvents,
    blockedDates,
    teamSchedules,
  });
}
