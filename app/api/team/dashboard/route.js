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

  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  // Get active team members
  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, role, color, status, hourly_pay')
    .eq('detailer_id', user.detailer_id || user.id)
    .eq('status', 'active');

  const teamMembers = members || [];
  const memberIds = teamMembers.map(m => m.id);

  if (memberIds.length === 0) {
    return Response.json({
      team: [],
      pendingApprovals: [],
      unstaffedJobs: [],
      todaySummary: { total_members: 0, clocked_in: 0, today_hours: 0 },
    });
  }

  // Get today's time entries (clock status)
  const { data: todayEntries } = await supabase
    .from('time_entries')
    .select('id, team_member_id, clock_in, clock_out, hours_worked, approved, notes, quote_id')
    .in('team_member_id', memberIds)
    .eq('date', today);

  // Get pending (unapproved) time entries (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: pendingEntries } = await supabase
    .from('time_entries')
    .select('id, team_member_id, date, clock_in, clock_out, hours_worked, notes')
    .in('team_member_id', memberIds)
    .eq('approved', false)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: false });

  // Get upcoming unstaffed jobs (next 14 days)
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const { data: upcomingJobs } = await supabase
    .from('quotes')
    .select('id, client_name, aircraft_model, aircraft_type, scheduled_date, status, assigned_team_member_ids')
    .eq('detailer_id', user.detailer_id || user.id)
    .gte('scheduled_date', today)
    .lte('scheduled_date', twoWeeksOut.toISOString())
    .in('status', ['scheduled', 'paid']);

  const unstaffedJobs = (upcomingJobs || []).filter(j => {
    const assigned = j.assigned_team_member_ids || [];
    return assigned.length === 0;
  });

  // Build team status
  const team = teamMembers.map(m => {
    const memberEntries = (todayEntries || []).filter(e => e.team_member_id === m.id);
    const openEntry = memberEntries.find(e => e.clock_in && !e.clock_out);
    const todayHours = memberEntries.reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);
    const pendingCount = (pendingEntries || []).filter(e => e.team_member_id === m.id).length;

    return {
      ...m,
      clocked_in: !!openEntry,
      clock_in_time: openEntry?.clock_in || null,
      today_hours: todayHours,
      pending_approvals: pendingCount,
    };
  });

  const clockedInCount = team.filter(m => m.clocked_in).length;
  const todayTotalHours = team.reduce((sum, m) => sum + m.today_hours, 0);

  // Add member names to pending entries
  const memberMap = Object.fromEntries(teamMembers.map(m => [m.id, m.name]));
  const pendingApprovals = (pendingEntries || []).map(e => ({
    ...e,
    member_name: memberMap[e.team_member_id] || 'Unknown',
  }));

  return Response.json({
    team,
    pendingApprovals,
    unstaffedJobs,
    todaySummary: {
      total_members: teamMembers.length,
      clocked_in: clockedInCount,
      today_hours: Math.round(todayTotalHours * 100) / 100,
    },
  });
}
