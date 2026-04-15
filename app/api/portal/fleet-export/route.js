import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET ?format=csv — export all fleet service records as CSV
export async function GET(request) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const { data: account } = await supabase.from('customer_accounts').select('email, first_name, last_name, name').eq('id', user.customer_id).single();
  if (!account) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Get all services
  const { data: quotes } = await supabase.from('quotes')
    .select('id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport, line_items')
    .ilike('customer_email', account.email).order('created_at', { ascending: false });

  const { data: jobs } = await supabase.from('jobs')
    .select('id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport')
    .ilike('customer_email', account.email).order('created_at', { ascending: false });

  const allServices = [
    ...(quotes || []).map(q => ({ ...q, aircraft: q.aircraft_model || q.aircraft_type })),
    ...(jobs || []).map(j => ({ ...j, aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Build CSV
  const header = 'Date,Tail Number,Aircraft,Service Type,Airport,Status,Cost,Notes';
  const rows = allServices.map(s => {
    const date = s.scheduled_date || s.created_at?.split('T')[0] || '';
    const serviceType = s.line_items?.map?.(li => li.description || li.service || li.name).filter(Boolean).join('; ') || '';
    const cost = s.total_price ? parseFloat(s.total_price).toFixed(2) : '';
    return `${date},${s.tail_number || ''},${(s.aircraft || '').replace(/,/g, ' ')},${serviceType.replace(/,/g, ';')},${s.airport || ''},${s.status || ''},${cost},`;
  });

  const csv = [header, ...rows].join('\n');
  const ownerName = [account.first_name, account.last_name].filter(Boolean).join('-') || 'fleet';
  const dateStr = new Date().toISOString().split('T')[0];

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${ownerName}-fleet-export-${dateStr}.csv"`,
    },
  });
}
