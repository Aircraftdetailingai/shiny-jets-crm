import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';
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

  // Quotes — progress columns may be absent; strip on error
  let quotes = [];
  {
    let select = 'id, detailer_id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, completed_at, created_at, customer_name, line_items, airport, share_link, progress_percentage, share_progress_with_customer';
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('quotes')
        .select(select)
        .ilike('customer_email', account.email)
        .ilike('tail_number', tailNumber)
        .order('created_at', { ascending: false });
      if (!error) { quotes = data || []; break; }
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) {
        select = select.split(',').map(c => c.trim()).filter(c => c !== colMatch[1]).join(', ');
        continue;
      }
      console.error('[portal/aircraft] quotes error:', error.message);
      break;
    }
  }

  // Jobs table (primary home of progress_percentage + share flag)
  let jobs = [];
  {
    let select = 'id, detailer_id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, completed_at, created_at, customer_name, airport, progress_percentage, share_progress_with_customer';
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('jobs')
        .select(select)
        .ilike('customer_email', account.email)
        .ilike('tail_number', tailNumber)
        .order('created_at', { ascending: false });
      if (!error) { jobs = data || []; break; }
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) {
        select = select.split(',').map(c => c.trim()).filter(c => c !== colMatch[1]).join(', ');
        continue;
      }
      console.error('[portal/aircraft] jobs error:', error.message);
      break;
    }
  }

  const shaped = shapePortalServices(quotes, jobs);
  const photos = await fetchPortalPhotos(supabase, shaped);
  const services = publicServices(shaped);

  // Standing notes for this tail (from any detailer who serviced it)
  const detailerIds = [...new Set(shaped.map(s => s.detailer_id).filter(Boolean))];
  let standingNotes = [];
  if (detailerIds.length > 0) {
    const { data: notes } = await supabase
      .from('aircraft_notes')
      .select('note, created_at')
      .in('detailer_id', detailerIds)
      .eq('tail_number', tailNumber);
    standingNotes = notes || [];
  }

  const stats = computePortalStats(services, photos);

  return Response.json({
    aircraft: aircraft || { tail_number: tailNumber },
    services,
    photos,
    standing_notes: standingNotes,
    stats,
  });
}
