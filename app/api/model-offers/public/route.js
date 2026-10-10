import { createClient } from '@supabase/supabase-js';
import { publicOverrideFlags } from '@/lib/applicability';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Public on/off flags for the quote embed. Prices, hours, and chemical
// quantities stay on the authenticated route.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const detailerId = searchParams.get('detailer_id');
  const aircraftId = searchParams.get('aircraft_id');
  const customId = searchParams.get('custom_aircraft_id');
  if (!detailerId || (!aircraftId && !customId)) {
    return Response.json({ error: 'detailer_id and a model id are required' }, { status: 400 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

  let query = supabase
    .from('model_offer_overrides')
    .select('service_id, package_id, enabled')
    .eq('detailer_id', detailerId);
  query = customId ? query.eq('custom_aircraft_id', customId) : query.eq('aircraft_id', aircraftId);
  const { data, error } = await query;
  if (error) {
    if (/relation|column/i.test(error.message || '')) return Response.json({ overrides: [] });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ overrides: publicOverrideFlags(data) });
}
