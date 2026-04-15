import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request, { params }) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { tail } = await params;
  const tailNumber = decodeURIComponent(tail).toUpperCase();
  const supabase = getSupabase();

  // Verify this customer owns this aircraft
  const { data: account } = await supabase.from('customer_accounts').select('email').eq('id', user.customer_id).single();
  if (!account) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Get aircraft record
  const { data: aircraft } = await supabase.from('customer_aircraft')
    .select('*')
    .eq('customer_account_id', user.customer_id)
    .eq('tail_number', tailNumber)
    .maybeSingle();

  // Get all services for this tail from quotes
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, detailer_id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, completed_at, created_at, customer_name, line_items, airport, share_link')
    .ilike('customer_email', account.email)
    .ilike('tail_number', tailNumber)
    .order('created_at', { ascending: false });

  // Get from jobs table
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, detailer_id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, completed_at, created_at, customer_name, airport')
    .ilike('customer_email', account.email)
    .ilike('tail_number', tailNumber)
    .order('created_at', { ascending: false });

  const allServices = [
    ...(quotes || []).map(q => ({ ...q, _source: 'quotes', aircraft: q.aircraft_model || q.aircraft_type })),
    ...(jobs || []).map(j => ({ ...j, _source: 'jobs', aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Get photos for completed services
  const completedIds = allServices.filter(s => s.status === 'completed').map(s => s.id);
  let photos = [];
  if (completedIds.length > 0) {
    const { data: media } = await supabase
      .from('job_media')
      .select('id, quote_id, media_type, url, created_at')
      .in('quote_id', completedIds)
      .order('created_at', { ascending: false })
      .limit(50);
    photos = media || [];
  }

  // Get standing notes for this tail (from any detailer who serviced it)
  const detailerIds = [...new Set(allServices.map(s => s.detailer_id).filter(Boolean))];
  let standingNotes = [];
  if (detailerIds.length > 0) {
    const { data: notes } = await supabase
      .from('aircraft_notes')
      .select('note, created_at')
      .in('detailer_id', detailerIds)
      .eq('tail_number', tailNumber);
    standingNotes = notes || [];
  }

  // Calculate totals
  const totalSpent = allServices.filter(s => ['completed', 'paid'].includes(s.status)).reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
  const lastService = allServices.find(s => s.status === 'completed');
  const daysSinceService = lastService?.completed_at ? Math.floor((Date.now() - new Date(lastService.completed_at).getTime()) / 86400000) : null;

  return Response.json({
    aircraft: aircraft || { tail_number: tailNumber },
    services: allServices,
    photos,
    standing_notes: standingNotes,
    stats: {
      total_services: allServices.length,
      total_spent: totalSpent,
      days_since_last_service: daysSinceService,
      last_service_date: lastService?.completed_at || lastService?.scheduled_date || null,
    },
  });
}
