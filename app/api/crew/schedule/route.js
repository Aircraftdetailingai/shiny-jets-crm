import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { getPermissionsForRole } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const payload = await getAuthUser(request);
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

function ymd(d) {
  return d.toISOString().split('T')[0];
}

export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Resolve team role + custom permission overrides (not the legacy
  // detailers.crew_schedule_visibility_days which ignored Owner=unlimited).
  const { data: member } = await supabase
    .from('team_members')
    .select('type, can_see_other_jobs, is_lead_tech')
    .eq('id', user.id)
    .maybeSingle();

  const teamRole = member?.type || 'employee';
  const { data: permsRow } = await supabase
    .from('team_permissions')
    .select('permissions')
    .eq('detailer_id', user.detailer_id)
    .maybeSingle();

  const perms = getPermissionsForRole(teamRole, permsRow?.permissions || {});
  let visibilityDays = perms.schedule_visibility_days;
  if (visibilityDays === undefined || visibilityDays === null) visibilityDays = 7;

  const seeAllJobs =
    perms.can_view_team_schedule === true ||
    member?.can_see_other_jobs === true ||
    member?.is_lead_tech === true ||
    user.is_lead_tech === true ||
    teamRole === 'owner' ||
    teamRole === 'manager';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startStr = ymd(today);

  // -1 = unlimited (no upper bound). 0 = today only.
  let endStr = null;
  if (visibilityDays >= 0) {
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + visibilityDays);
    endStr = ymd(endDate);
  }

  let jobIds = null;
  if (!seeAllJobs) {
    const { data: assignments, error: assignErr } = await supabase
      .from('job_assignments')
      .select('job_id')
      .eq('team_member_id', user.id);

    if (assignErr) {
      console.error('[crew/schedule] Assignment query error:', assignErr);
      return Response.json({ error: 'Failed to fetch schedule' }, { status: 500 });
    }

    jobIds = (assignments || []).map(a => a.job_id).filter(Boolean);
    if (jobIds.length === 0) {
      return Response.json({ jobs: [], visibility_days: visibilityDays });
    }
  }

  // Quotes in visibility window
  let quoteQuery = supabase
    .from('quotes')
    .select('id, aircraft_model, aircraft_type, airport, scheduled_date, status, notes, tail_number')
    .eq('detailer_id', user.detailer_id)
    .gte('scheduled_date', startStr)
    .in('status', ['accepted', 'paid', 'scheduled', 'in_progress'])
    .order('scheduled_date', { ascending: true });

  if (endStr) quoteQuery = quoteQuery.lte('scheduled_date', endStr);
  if (jobIds) quoteQuery = quoteQuery.in('id', jobIds);

  const { data: quoteJobs, error: quoteErr } = await quoteQuery;
  if (quoteErr) {
    console.error('[crew/schedule] Quote query error:', quoteErr);
  }

  // Jobs table — no `title` / `aircraft_type` columns (those caused 42703 and
  // emptied the schedule). Use aircraft_make + aircraft_model instead.
  let jobQuery = supabase
    .from('jobs')
    .select('id, aircraft_make, aircraft_model, airport, scheduled_date, status, notes, tail_number, scheduled_time')
    .eq('detailer_id', user.detailer_id)
    .gte('scheduled_date', startStr)
    .in('status', ['scheduled', 'in_progress', 'accepted', 'paid'])
    .order('scheduled_date', { ascending: true });

  if (endStr) jobQuery = jobQuery.lte('scheduled_date', endStr);
  if (jobIds) jobQuery = jobQuery.in('id', jobIds);

  const { data: directJobs, error: jobErr } = await jobQuery;
  if (jobErr) {
    console.error('[crew/schedule] Jobs table query error:', jobErr);
  }

  const jobs = [
    ...(quoteJobs || []).map(j => ({
      id: j.id,
      title: j.aircraft_model || j.aircraft_type || 'Detail Job',
      aircraft_model: j.aircraft_model,
      tail_number: j.tail_number,
      airport: j.airport,
      scheduled_date: j.scheduled_date,
      scheduled_time: null,
      status: j.status,
      source: 'quote',
    })),
    ...(directJobs || []).map(j => ({
      id: j.id,
      title: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') || j.aircraft_model || 'Job',
      aircraft_model: j.aircraft_model,
      tail_number: j.tail_number,
      airport: j.airport,
      scheduled_date: j.scheduled_date,
      scheduled_time: j.scheduled_time,
      status: j.status,
      source: 'job',
    })),
  ];

  return Response.json({ jobs, visibility_days: visibilityDays });
}
