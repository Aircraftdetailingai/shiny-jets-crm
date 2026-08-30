import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const supabase = getSupabase();

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (error || !job) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Get detailer info for rate and minimum fee
  const { data: detailer } = await supabase
    .from('detailers')
    .select('default_labor_rate, minimum_callout_fee')
    .eq('id', user.id)
    .single();

  const hourlyRate = parseFloat(detailer?.default_labor_rate) || 130;
  const minimumFee = parseFloat(detailer?.minimum_callout_fee) || 0;

  // Parse services
  let rawServices = [];
  if (job.services) {
    try { rawServices = typeof job.services === 'string' ? JSON.parse(job.services) : job.services; } catch {}
  }

  // Look up aircraft to get hours per service
  let aircraft = null;
  if (job.aircraft_model && job.aircraft_make) {
    const { data: ac } = await supabase
      .from('aircraft')
      .select('*')
      .ilike('manufacturer', job.aircraft_make)
      .ilike('model', job.aircraft_model)
      .limit(1)
      .maybeSingle();
    aircraft = ac;
  }

  // Look up detailer's services to get hours_field mapping
  const { data: detailerServices } = await supabase
    .from('services')
    .select('name, hours_field, hourly_rate')
    .eq('detailer_id', user.detailer_id || user.id);
  const svcMap = {};
  for (const ds of (detailerServices || [])) {
    svcMap[ds.name?.toLowerCase()] = ds;
  }

  // Enrich services with hours and price
  const services = (Array.isArray(rawServices) ? rawServices : []).map(s => {
    const name = typeof s === 'string' ? s : (s.name || s.service_name || s.description || 'Service');
    // If service already has hours/rate from creation, use them
    if (s.hours > 0 && s.rate > 0) {
      return { name, hours: parseFloat(s.hours), rate: parseFloat(s.rate), price: parseFloat(s.price) || (s.hours * s.rate) };
    }
    // Otherwise look up from aircraft + service config
    const svcConfig = svcMap[name.toLowerCase()];
    let hours = 0;
    if (aircraft && svcConfig?.hours_field) {
      hours = parseFloat(aircraft[svcConfig.hours_field]) || 0;
    }
    const rate = parseFloat(svcConfig?.hourly_rate) || hourlyRate;
    const price = hours > 0 ? hours * rate : 0;
    return { name, hours, rate, price };
  });

  const computedTotal = services.reduce((sum, s) => sum + s.price, 0);
  const totalPrice = Math.max(computedTotal, minimumFee) || parseFloat(job.total_price) || 0;
  const totalHours = services.reduce((sum, s) => sum + s.hours, 0);

  // Get crew assignments
  let crew = [];
  try {
    const { data: assignments } = await supabase.from('job_assignments').select('team_member_id, status, notified_at').eq('job_id', id);
    if (assignments?.length) {
      const ids = assignments.map(a => a.team_member_id);
      const { data: members } = await supabase.from('team_members').select('id, name, role, title').in('id', ids);
      const byId = Object.fromEntries((members || []).map(m => [m.id, m]));
      // Merge assignment dispatch state (notified_at/status) onto each crew member
      // so the dispatch button can render "Dispatched ✓" without a second fetch.
      crew = assignments.map(a => ({ ...(byId[a.team_member_id] || { id: a.team_member_id }), status: a.status, notified_at: a.notified_at }));
    }
  } catch {}

  return Response.json({
    ...job,
    client_name: job.customer_name,
    client_email: job.customer_email,
    aircraft_model: job.aircraft_model,
    aircraft_type: job.aircraft_make,
    total_price: totalPrice,
    total_hours: totalHours,
    services,
    assigned_crew: crew,
    hourly_rate: hourlyRate,
    minimum_fee: minimumFee,
    _source: 'jobs_table',
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
