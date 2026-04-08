import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { quote_id, products } = await request.json();
  if (!quote_id || !products?.length) return Response.json({ error: 'Missing data' }, { status: 400 });

  const supabase = getSupabase();

  // Get the job record for this quote
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('quote_id', quote_id)
    .maybeSingle();

  // Get quote for aircraft type
  const { data: quote } = await supabase
    .from('quotes')
    .select('aircraft_type, aircraft_model')
    .eq('id', quote_id)
    .single();

  const rows = products.map(p => ({
    job_id: job?.id || null,
    quote_id,
    detailer_id: user.id,
    service_id: p.service_id || null,
    product_name: p.product_name,
    estimated_quantity: parseFloat(p.estimated_quantity) || 0,
    actual_quantity: parseFloat(p.actual_quantity) || 0,
    unit: p.unit || 'oz',
    aircraft_type: quote?.aircraft_model || quote?.aircraft_type || null,
  }));

  const { error } = await supabase.from('job_product_usage').insert(rows);
  if (error) {
    console.error('Failed to save product usage:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, count: rows.length });
}
