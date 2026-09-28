import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  const { id } = await params;
  const supabase = getSupabase();

  // Get total actual hours from time_entries for this job
  const { data: entries, error: entriesErr } = await supabase
    .from('time_entries')
    .select('hours_worked, clock_in, clock_out')
    .eq('job_id', id);

  if (entriesErr) {
    console.error('[check-overrun] time_entries error:', entriesErr.message);
    return Response.json({ error: 'Failed to fetch time entries' }, { status: 500 });
  }

  let actualHours = 0;
  for (const entry of entries || []) {
    if (entry.hours_worked) {
      actualHours += parseFloat(entry.hours_worked) || 0;
    } else if (entry.clock_in && !entry.clock_out) {
      // Currently open entry — count elapsed time
      const elapsed = (Date.now() - new Date(entry.clock_in).getTime()) / (1000 * 60 * 60);
      actualHours += Math.round(elapsed * 100) / 100;
    }
  }

  // Get estimated hours from job services JSON
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('services, detailer_id')
    .eq('id', id)
    .single();

  if (jobErr || !job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  let estimatedHours = 0;
  try {
    const services = typeof job.services === 'string' ? JSON.parse(job.services) : job.services;
    if (Array.isArray(services)) {
      for (const svc of services) {
        estimatedHours += parseFloat(svc.hours) || parseFloat(svc.estimated_hours) || 0;
      }
    }
  } catch {
    // If services can't be parsed, estimated stays 0
  }

  // If no estimated hours, can't determine overrun
  if (estimatedHours === 0) {
    return Response.json({ alert: false, actual_hours: actualHours, estimated_hours: 0 });
  }

  // Check if actual > estimated × 1.15
  if (actualHours > estimatedHours * 1.15) {
    // Check for existing unacknowledged alert
    const { data: existingAlert } = await supabase
      .from('job_alerts')
      .select('id')
      .eq('job_id', id)
      .eq('alert_type', 'over_estimate')
      .eq('acknowledged', false)
      .limit(1)
      .maybeSingle();

    if (existingAlert) {
      return Response.json({
        alert: false,
        already_alerted: true,
        actual_hours: actualHours,
        estimated_hours: estimatedHours,
      });
    }

    const overage = Math.round((actualHours - estimatedHours) * 100) / 100;

    const { error: insertErr } = await supabase
      .from('job_alerts')
      .insert({
        detailer_id: job.detailer_id,
        job_id: id,
        alert_type: 'over_estimate',
        actual_hours: actualHours,
        estimated_hours: estimatedHours,
        overage_hours: overage,
        acknowledged: false,
      });

    if (insertErr) {
      console.error('[check-overrun] insert alert error:', insertErr.message);
      return Response.json({ error: 'Failed to create alert' }, { status: 500 });
    }

    return Response.json({
      alert: true,
      actual_hours: actualHours,
      estimated_hours: estimatedHours,
      overage: overage,
    });
  }

  return Response.json({
    alert: false,
    actual_hours: actualHours,
    estimated_hours: estimatedHours,
  });
}
