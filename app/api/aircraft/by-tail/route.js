import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tailNumber = searchParams.get('tail');
  if (!tailNumber) return Response.json({ error: 'tail param required' }, { status: 400 });
  const tail = decodeURIComponent(tailNumber).toUpperCase();
  const supabase = getSupabase();

  // Get all jobs for this tail number
  const { data: jobs, error } = await supabase
    .from('quotes')
    .select('id, client_name, customer_company, aircraft_model, tail_number, total_price, status, scheduled_date, completed_at, created_at')
    .eq('detailer_id', user.detailer_id || user.id)
    .eq('tail_number', tail)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[aircraft] Query error:', error.message);
    // Fallback: try ilike match
    const { data: fallbackJobs } = await supabase
      .from('quotes')
      .select('id, client_name, customer_company, aircraft_model, tail_number, total_price, status, scheduled_date, completed_at, created_at')
      .eq('detailer_id', user.detailer_id || user.id)
      .ilike('tail_number', tail)
      .order('created_at', { ascending: false });

    if (!fallbackJobs || fallbackJobs.length === 0) {
      return Response.json({ error: 'No jobs found for this aircraft' }, { status: 404 });
    }

    return Response.json({
      tail_number: tail,
      aircraft_model: fallbackJobs[0]?.aircraft_model,
      customer: fallbackJobs[0]?.client_name || fallbackJobs[0]?.customer_company,
      jobs: fallbackJobs,
      photos: [],
      total_revenue: fallbackJobs.reduce((sum, j) => sum + parseFloat(j.total_price || 0), 0),
      job_count: fallbackJobs.length,
    });
  }

  // Get photos for all these jobs
  const jobIds = (jobs || []).map(j => j.id);
  let photos = [];
  if (jobIds.length > 0) {
    const { data: media } = await supabase
      .from('job_media')
      .select('id, quote_id, media_type, url, notes, created_at')
      .in('quote_id', jobIds)
      .in('media_type', ['before_photo', 'after_photo'])
      .order('created_at', { ascending: false });
    photos = media || [];
  }

  const totalRevenue = (jobs || []).reduce((sum, j) => sum + parseFloat(j.total_price || 0), 0);
  const completedJobs = (jobs || []).filter(j => j.status === 'completed');
  const lastService = completedJobs[0]?.completed_at || completedJobs[0]?.scheduled_date;

  return Response.json({
    tail_number: tail,
    aircraft_model: jobs?.[0]?.aircraft_model,
    customer: jobs?.[0]?.client_name || jobs?.[0]?.customer_company,
    jobs: jobs || [],
    photos,
    total_revenue: totalRevenue,
    job_count: (jobs || []).length,
    last_service: lastService,
  });
}
