import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(request, { params }) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { tail } = await params;
  const tailNumber = decodeURIComponent(tail).toUpperCase();
  const supabase = getSupabase();

  const { data: account } = await supabase.from('customer_accounts').select('email').eq('id', user.customer_id).single();
  if (!account) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Get services for this tail
  const { data: quotes } = await supabase.from('quotes')
    .select('id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport, line_items, detailer_id, hours')
    .ilike('customer_email', account.email).ilike('tail_number', tailNumber).order('created_at', { ascending: false });

  const { data: jobs } = await supabase.from('jobs')
    .select('id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport, detailer_id, hours_estimated, services')
    .ilike('customer_email', account.email).ilike('tail_number', tailNumber).order('created_at', { ascending: false });

  const allServices = [
    ...(quotes || []).map(q => ({ ...q, _source: 'quotes', aircraft: q.aircraft_model || q.aircraft_type })),
    ...(jobs || []).map(j => ({ ...j, _source: 'jobs', aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Get detailer names
  const detailerIds = [...new Set(allServices.map(s => s.detailer_id).filter(Boolean))];
  const detailerNames = {};
  if (detailerIds.length > 0) {
    const { data: detailers } = await supabase.from('detailers').select('id, company, name').in('id', detailerIds);
    for (const d of detailers || []) detailerNames[d.id] = d.company || d.name || 'Detailer';
  }

  // Get photo counts per service
  const completedIds = allServices.filter(s => s.status === 'completed').map(s => s.id);
  const photoCounts = {};
  if (completedIds.length > 0) {
    const { data: media } = await supabase.from('job_media').select('quote_id').in('quote_id', completedIds);
    for (const m of media || []) photoCounts[m.quote_id] = (photoCounts[m.quote_id] || 0) + 1;
  }

  const header = 'Date,Service Type,Detailer,Location,Hours,Cost,Notes,Photos';
  const rows = allServices.map(s => {
    const date = s.scheduled_date || s.created_at?.split('T')[0] || '';
    const services = s.line_items?.map?.(li => li.description || li.service || li.name).filter(Boolean).join('; ')
      || (s.services && Array.isArray(s.services) ? s.services.map(x => typeof x === 'string' ? x : (x.name || x.description)).filter(Boolean).join('; ') : '')
      || s.aircraft || '';
    const detailer = detailerNames[s.detailer_id] || '';
    const cost = s.total_price ? parseFloat(s.total_price).toFixed(2) : '';
    const hours = s.hours || s.hours_estimated || '';
    const notes = s.status?.replace('_', ' ') || '';
    const photos = photoCounts[s.id] || 0;
    return [date, services, detailer, s.airport || '', hours, cost, notes, photos].map(csvEscape).join(',');
  });

  const csv = [header, ...rows].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${tailNumber}-service-history-${dateStr}.csv"`,
    },
  });
}
