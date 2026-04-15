import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request, { params }) {
  const { tail } = await params;
  const tailNumber = decodeURIComponent(tail).toUpperCase();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) return Response.json({ error: 'Token required' }, { status: 400 });

  const supabase = getSupabase();

  // Find aircraft by share_token
  const { data: aircraft } = await supabase.from('customer_aircraft')
    .select('*, customer_accounts(email, first_name, last_name, name)')
    .eq('tail_number', tailNumber)
    .eq('share_token', token)
    .maybeSingle();

  if (!aircraft) return Response.json({ error: 'Invalid or revoked share link' }, { status: 404 });

  const account = aircraft.customer_accounts;
  const ownerName = [account?.first_name, account?.last_name].filter(Boolean).join(' ') || account?.name || 'Aircraft Owner';

  // Get services
  const { data: quotes } = await supabase.from('quotes')
    .select('id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport')
    .ilike('customer_email', account?.email || '').ilike('tail_number', tailNumber).order('created_at', { ascending: false });

  const { data: jobs } = await supabase.from('jobs')
    .select('id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport')
    .ilike('customer_email', account?.email || '').ilike('tail_number', tailNumber).order('created_at', { ascending: false });

  const allServices = [
    ...(quotes || []).map(q => ({ ...q, aircraft: q.aircraft_model || q.aircraft_type })),
    ...(jobs || []).map(j => ({ ...j, aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Photos
  const completedIds = allServices.filter(s => s.status === 'completed').map(s => s.id);
  let photos = [];
  if (completedIds.length > 0) {
    const { data: media } = await supabase.from('job_media')
      .select('id, quote_id, media_type, url, created_at')
      .in('quote_id', completedIds).limit(50);
    photos = media || [];
  }

  const totalSpent = allServices.filter(s => ['completed', 'paid'].includes(s.status)).reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
  const lastService = allServices.find(s => s.status === 'completed');
  const daysSince = lastService?.completed_at ? Math.floor((Date.now() - new Date(lastService.completed_at).getTime()) / 86400000) : null;

  return Response.json({
    aircraft: { ...aircraft, customer_accounts: undefined },
    services: allServices,
    photos,
    owner_name: ownerName,
    stats: { total_services: allServices.length, total_spent: totalSpent, days_since_last_service: daysSince },
  });
}
