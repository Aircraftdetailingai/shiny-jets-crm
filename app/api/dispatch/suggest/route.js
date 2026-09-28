import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { normalizePlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

const ALLOWED_PLANS = ['business']; // legacy 'enterprise' normalizes to business

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase().trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).toLowerCase().trim()).filter(Boolean);
    } catch {
      // fallthrough — treat as CSV
    }
    return value.split(',').map((v) => v.toLowerCase().trim()).filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.values(value).map((v) => String(v).toLowerCase().trim()).filter(Boolean);
  }
  return [];
}

// GET — ranked crew suggestions for a job
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Plan check
  const { data: detailer, error: detailerError } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  if (detailerError || !detailer) {
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  const plan = detailer.plan || 'free';
  if (!ALLOWED_PLANS.includes(normalizePlan(plan))) {
    return Response.json(
      { error: 'plan_required', upgrade_required: true },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('job_id');
  const dateParam = searchParams.get('date');

  if (!jobId) {
    return Response.json({ error: 'job_id is required' }, { status: 400 });
  }

  // Fetch job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, services, airport, scheduled_date, scheduled_time, estimated_hours')
    .eq('id', jobId)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (jobErr || !job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  const targetDate = dateParam || job.scheduled_date;
  const jobServices = normalizeList(job.services);

  // Fetch active team members
  const { data: members, error: mErr } = await supabase
    .from('team_members')
    .select('*')
    .eq('detailer_id', user.detailer_id || user.id)
    .eq('status', 'active');

  if (mErr) {
    console.error('[dispatch/suggest] team_members error:', mErr);
    return Response.json({ error: mErr.message }, { status: 500 });
  }

  // For each member, fetch their jobs for the target date (via job_assignments)
  // We'll pull all assignments for this detailer on the target date first.
  let assignmentsByMember = {};
  if (targetDate && (members || []).length > 0) {
    const memberIds = members.map((m) => m.id);
    const { data: dayAssignments, error: aErr } = await supabase
      .from('job_assignments')
      .select('team_member_id, jobs!inner(id, scheduled_date, estimated_hours)')
      .eq('detailer_id', user.detailer_id || user.id)
      .in('team_member_id', memberIds)
      .in('status', ['pending', 'accepted']);

    if (aErr) {
      console.error('[dispatch/suggest] assignments error:', aErr);
    } else {
      for (const a of dayAssignments || []) {
        const j = a.jobs;
        if (!j || j.scheduled_date !== targetDate) continue;
        if (!assignmentsByMember[a.team_member_id]) assignmentsByMember[a.team_member_id] = 0;
        const hrs = Number(j.estimated_hours) || 0;
        assignmentsByMember[a.team_member_id] += hrs;
      }
    }
  }

  const suggestions = (members || []).map((m) => {
    const memberSpecialties = normalizeList(m.specialties);
    let specialtyMatch = 0;
    if (memberSpecialties.length > 0 && jobServices.length > 0) {
      for (const s of jobServices) {
        if (memberSpecialties.includes(s)) specialtyMatch += 1;
      }
    } else {
      // No specialties field/data — base score
      specialtyMatch = 1;
    }

    const hoursToday = assignmentsByMember[m.id] || 0;
    const capacity = Number(m.hours_per_day) || 8;
    const available = hoursToday < capacity;
    const distance = 0; // placeholder

    const score = specialtyMatch * 10 + (available ? 5 : 0) - hoursToday;

    return {
      team_member_id: m.id,
      name: m.name,
      specialty_match: specialtyMatch,
      hours_today: hoursToday,
      available,
      distance,
      score,
    };
  });

  suggestions.sort((a, b) => b.score - a.score);

  return Response.json({ suggestions });
}
