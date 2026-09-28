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

// POST — update a job's scheduled_date (drag-drop reschedule)
export async function POST(request) {
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

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { job_id, scheduled_date, scheduled_time } = body || {};
  if (!job_id || !scheduled_date) {
    return Response.json({ error: 'job_id and scheduled_date are required' }, { status: 400 });
  }

  const update = { scheduled_date };
  if (typeof scheduled_time !== 'undefined') update.scheduled_time = scheduled_time;

  const { error } = await supabase
    .from('jobs')
    .update(update)
    .eq('id', job_id)
    .eq('detailer_id', user.detailer_id || user.id);

  if (error) {
    console.error('[dispatch/schedule] update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
