import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

const ALLOWED_PLANS = ['business', 'enterprise'];

// GET — dispatch board data for the owner
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Plan gating
  const { data: detailer, error: detailerError } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  if (detailerError || !detailer) {
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  const plan = detailer.plan || 'free';
  if (!ALLOWED_PLANS.includes(plan)) {
    return Response.json(
      { error: 'plan_required', upgrade_required: true },
      { status: 403 },
    );
  }

  // Fetch scheduled & in-progress jobs
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('*')
    .eq('detailer_id', user.id)
    .in('status', ['scheduled', 'in_progress'])
    .order('scheduled_date', { ascending: true });

  if (jobsError) {
    console.error('[dispatch/board] jobs error:', jobsError);
    return Response.json({ error: jobsError.message }, { status: 500 });
  }

  const jobIds = (jobs || []).map((j) => j.id);

  // Fetch assignments with team member names
  let assignmentsByJob = {};
  if (jobIds.length > 0) {
    const { data: assignments, error: assignError } = await supabase
      .from('job_assignments')
      .select('id, job_id, team_member_id, detailer_id, status, accepted_at, declined_at, notified_at, notes, created_at, team_members(name)')
      .in('job_id', jobIds)
      .eq('detailer_id', user.id);

    if (assignError) {
      console.error('[dispatch/board] assignments error:', assignError);
      return Response.json({ error: assignError.message }, { status: 500 });
    }

    for (const a of assignments || []) {
      const row = {
        id: a.id,
        job_id: a.job_id,
        team_member_id: a.team_member_id,
        detailer_id: a.detailer_id,
        status: a.status,
        accepted_at: a.accepted_at,
        declined_at: a.declined_at,
        notified_at: a.notified_at,
        notes: a.notes,
        created_at: a.created_at,
        name: a.team_members?.name || null,
      };
      if (!assignmentsByJob[a.job_id]) assignmentsByJob[a.job_id] = [];
      assignmentsByJob[a.job_id].push(row);
    }
  }

  const jobsWithAssignments = (jobs || []).map((j) => ({
    ...j,
    assignments: assignmentsByJob[j.id] || [],
  }));

  // Fetch active team members — column-stripping retry to survive missing columns
  let tmCols = 'id, detailer_id, name, email, title, type, status, hourly_pay, is_lead_tech, can_clock, can_see_inventory, can_see_equipment, can_see_pricing, hours_per_day';
  let teamMembers = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('team_members')
      .select(tmCols)
      .eq('detailer_id', user.id)
      .eq('status', 'active');
    if (!error) { teamMembers = data; break; }
    const colMatch = error.message?.match(/column [\w."]+ does not exist/i)
      || error.message?.match(/column "([^"]+)" does not exist/i);
    if (colMatch) {
      const missing = (error.message.match(/column [\w."]*\.?"?(\w+)"? does not exist/i) || [])[1];
      if (missing) {
        tmCols = tmCols.split(',').map(c => c.trim()).filter(c => c !== missing).join(', ');
        console.log(`[dispatch/board] stripped missing column: ${missing}`);
        continue;
      }
    }
    console.error('[dispatch/board] team_members error:', error);
    teamMembers = [];
    break;
  }

  return Response.json({
    jobs: jobsWithAssignments,
    team_members: teamMembers || [],
    plan,
  });
}
