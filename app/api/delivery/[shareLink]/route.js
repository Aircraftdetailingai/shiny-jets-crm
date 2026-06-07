import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Public delivery report data (no auth)
export async function GET(request, { params }) {
  const { shareLink } = await params;
  const supabase = getSupabase();

  // Look up job by delivery_link
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, detailer_id, customer_name, aircraft_model, tail_number, status, services, completed_at, created_at, scheduled_date')
    .eq('delivery_link', shareLink)
    .single();

  if (jobErr || !job) {
    return Response.json({ error: 'Delivery report not found' }, { status: 404 });
  }

  // Fetch before + after photos
  const { data: photos } = await supabase
    .from('job_photos')
    .select('id, photo_type, url, filename, created_at')
    .eq('job_id', job.id)
    .in('photo_type', ['before', 'after'])
    .order('created_at', { ascending: true });

  const grouped = { before: [], after: [] };
  for (const p of (photos || [])) {
    if (grouped[p.photo_type]) grouped[p.photo_type].push(p);
  }

  // Fetch detailer branding
  const { data: detailer } = await supabase
    .from('detailers')
    .select('company, logo_url, theme_primary, plan')
    .eq('id', job.detailer_id)
    .single();

  return Response.json({
    job: {
      id: job.id,
      customer_name: job.customer_name,
      aircraft_model: job.aircraft_model,
      tail_number: job.tail_number,
      status: job.status,
      services: job.services,
      completed_at: job.completed_at,
      scheduled_date: job.scheduled_date,
    },
    photos: grouped,
    detailer: {
      company: detailer?.company || null,
      logo_url: detailer?.logo_url || null,
      theme_primary: detailer?.theme_primary || '#C9A84C',
    },
  });
}
