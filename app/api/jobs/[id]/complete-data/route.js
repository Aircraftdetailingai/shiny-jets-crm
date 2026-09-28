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
  const { services, update_overrides } = await request.json();

  if (!Array.isArray(services) || services.length === 0) {
    return Response.json({ error: 'services array is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch job for aircraft info
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, detailer_id, aircraft_id, aircraft_model, aircraft_make')
    .eq('id', id)
    .single();

  if (jobErr || !job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  const completionRows = [];
  const suggestions = [];

  for (const svc of services) {
    const estimated = parseFloat(svc.estimated_hours) || 0;
    const actual = parseFloat(svc.actual_hours) || 0;
    const variance_pct = estimated > 0 ? Math.round(((actual - estimated) / estimated) * 100 * 100) / 100 : 0;

    completionRows.push({
      detailer_id: job.detailer_id,
      job_id: id,
      service_id: svc.service_id || null,
      service_name: svc.service_name,
      aircraft_id: job.aircraft_id || null,
      aircraft_category: svc.aircraft_category || job.aircraft_model || null,
      estimated_hours: estimated,
      actual_hours: actual,
      variance_pct: variance_pct,
    });

    if (Math.abs(variance_pct) > 10) {
      suggestions.push({
        service_name: svc.service_name,
        service_id: svc.service_id || null,
        estimated_hours: estimated,
        actual_hours: actual,
        variance_pct: variance_pct,
      });
    }
  }

  // Insert completion data
  const { data: inserted, error: insertErr } = await supabase
    .from('job_completion_data')
    .insert(completionRows)
    .select();

  if (insertErr) {
    console.error('[complete-data] insert error:', insertErr.message);
    return Response.json({ error: 'Failed to record completion data' }, { status: 500 });
  }

  // If client confirms, update detailer_aircraft_overrides with actual hours
  if (update_overrides && suggestions.length > 0) {
    for (const sug of suggestions) {
      const { error: upsertErr } = await supabase
        .from('detailer_aircraft_overrides')
        .upsert(
          {
            detailer_id: job.detailer_id,
            aircraft_id: job.aircraft_id || null,
            service_id: sug.service_id,
            service_name: sug.service_name,
            hours: sug.actual_hours,
          },
          { onConflict: 'detailer_id,aircraft_id,service_id' }
        );

      if (upsertErr) {
        console.error('[complete-data] upsert override error:', upsertErr.message);
      }
    }
  }

  return Response.json({
    completion_data: inserted || completionRows,
    suggestions,
  });
}
