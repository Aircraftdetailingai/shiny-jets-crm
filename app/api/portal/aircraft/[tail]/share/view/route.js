import { createClient } from '@supabase/supabase-js';
import {
  shapePortalServices,
  publicServices,
  fetchPortalPhotos,
  computePortalStats,
} from '@/lib/portal-aircraft-data';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function selectWithStrip(supabase, table, select, applyFilters) {
  let cols = select;
  for (let attempt = 0; attempt < 4; attempt++) {
    let q = supabase.from(table).select(cols);
    q = applyFilters(q);
    const { data, error } = await q;
    if (!error) return data || [];
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
    if (colMatch) {
      cols = cols.split(',').map(c => c.trim()).filter(c => c !== colMatch[1]).join(', ');
      continue;
    }
    console.error(`[portal/share/view] ${table} error:`, error.message);
    return [];
  }
  return [];
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
  const email = account?.email || '';

  const quotes = await selectWithStrip(
    supabase,
    'quotes',
    'id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport, line_items, progress_percentage, share_progress_with_customer, detailer_id',
    (q) => q.ilike('customer_email', email).ilike('tail_number', tailNumber).order('created_at', { ascending: false }),
  );

  const jobs = await selectWithStrip(
    supabase,
    'jobs',
    'id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport, progress_percentage, share_progress_with_customer, detailer_id',
    (q) => q.ilike('customer_email', email).ilike('tail_number', tailNumber).order('created_at', { ascending: false }),
  );

  const shaped = shapePortalServices(quotes, jobs);
  const photos = await fetchPortalPhotos(supabase, shaped);
  const services = publicServices(shaped);
  const stats = computePortalStats(services, photos);

  return Response.json({
    aircraft: { ...aircraft, customer_accounts: undefined },
    services,
    photos,
    owner_name: ownerName,
    stats,
  });
}
