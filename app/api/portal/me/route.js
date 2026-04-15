import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const { data: account } = await supabase.from('customer_accounts').select('*').eq('id', user.customer_id).single();
  if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });

  // Get aircraft
  const { data: aircraft } = await supabase.from('customer_aircraft').select('*').eq('customer_account_id', account.id).order('created_at');

  // Get quotes/jobs for this customer's email across ALL detailers
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, detailer_id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, created_at, customer_name, customer_email, line_items, airport')
    .ilike('customer_email', account.email)
    .order('created_at', { ascending: false })
    .limit(20);

  // Get jobs from jobs table too
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, detailer_id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, created_at, customer_name, customer_email, airport')
    .ilike('customer_email', account.email)
    .order('created_at', { ascending: false })
    .limit(20);

  // Merge and sort
  const allServices = [
    ...(quotes || []).map(q => ({ ...q, _source: 'quotes', aircraft: q.aircraft_model || q.aircraft_type })),
    ...(jobs || []).map(j => ({ ...j, _source: 'jobs', aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Upcoming (scheduled in the future)
  const today = new Date().toISOString().split('T')[0];
  const upcoming = allServices.filter(s => s.scheduled_date && s.scheduled_date >= today && ['scheduled', 'accepted', 'paid'].includes(s.status));

  return Response.json({
    account: { ...account, password_hash: undefined },
    aircraft: aircraft || [],
    services: allServices.slice(0, 10),
    upcoming,
    total_services: allServices.length,
  });
}

// PATCH - update account
export async function PATCH(request) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = getSupabase();

  const allowed = ['first_name', 'last_name', 'phone', 'company_name', 'role', 'certificate_number', 'certificate_type', 'preferred_notification', 'notification_prefs', 'avatar_url', 'notes', 'onboarding_complete', 'name'];
  const updates = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Column-stripping retry
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from('customer_accounts').update(updates).eq('id', user.customer_id).select().single();
    if (!error) return Response.json(data);
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) { delete updates[colMatch[1]]; continue; }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ error: 'Update failed' }, { status: 500 });
}
