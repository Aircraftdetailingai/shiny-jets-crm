import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { recordUsageAndLearn } from '@/lib/record-usage';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // Crew members need can_log_products; owners (non-crew sessions) always can.
  if (user.role === 'crew' && user.can_log_products === false) {
    return Response.json({ error: 'Not authorized to log product usage' }, { status: 403 });
  }

  const { quote_id, products } = await request.json();
  if (!quote_id || !products?.length) return Response.json({ error: 'Missing data' }, { status: 400 });

  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;

  // Get the job record for this quote
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('quote_id', quote_id)
    .maybeSingle();

  // Get quote for aircraft context (also drives the learning loop below)
  const { data: quote } = await supabase
    .from('quotes')
    .select('aircraft_type, aircraft_model, aircraft_id')
    .eq('id', quote_id)
    .single();

  let aircraftCategory = quote?.aircraft_type || 'unknown';
  let aircraftMake = '';
  const aircraftModel = quote?.aircraft_model || '';
  if (quote?.aircraft_id) {
    const { data: ac } = await supabase
      .from('aircraft')
      .select('category, manufacturer')
      .eq('id', quote.aircraft_id)
      .single();
    if (ac) {
      aircraftCategory = ac.category || aircraftCategory;
      aircraftMake = ac.manufacturer || '';
    }
  }

  const rows = products.map(p => ({
    job_id: job?.id || null,
    quote_id,
    detailer_id: detailerId,
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

  // Feed the learning loop for any product with a real catalog product_id.
  // Entries here are free-form (product_name) plus optional product_id from
  // the caller — skip ones without it. Failures are non-fatal.
  const jobRefId = job?.id || quote_id;
  for (const p of products) {
    if (!p.product_id) continue;
    const qty = parseFloat(p.actual_quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    try {
      await recordUsageAndLearn(supabase, {
        detailerId,
        jobId: jobRefId,
        productId: p.product_id,
        serviceId: p.service_id || null,
        quantityUsed: qty,
        unit: p.unit || 'oz',
        aircraftMake,
        aircraftModel,
        aircraftCategory,
        loggedBy: user.id,
      });
    } catch (e) {
      console.error('[jobs/product-usage] learning loop failed (non-fatal):', e.message);
    }
  }

  return Response.json({ success: true, count: rows.length });
}
