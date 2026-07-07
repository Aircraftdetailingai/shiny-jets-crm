import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { recalculateAverages, updateNetworkAverages } from '@/lib/record-usage';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Get usage logs for a job, or all logs
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('job_id');

  const supabase = getSupabase();

  if (jobId) {
    const { data: logs } = await supabase
      .from('product_usage_log')
      .select('*')
      .eq('detailer_id', user.detailer_id || user.id)
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    return Response.json({ logs: logs || [] });
  }

  const { data: logs } = await supabase
    .from('product_usage_log')
    .select('*')
    .eq('detailer_id', user.detailer_id || user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return Response.json({ logs: logs || [] });
}

// POST - Log product usage for a job
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // Crew members need can_log_products; owners (non-crew sessions) always can.
  if (user.role === 'crew' && user.can_log_products === false) {
    return Response.json({ error: 'Not authorized to log product usage' }, { status: 403 });
  }

  const { job_id, entries } = await request.json();

  if (!job_id || !entries || !Array.isArray(entries) || entries.length === 0) {
    return Response.json({ error: 'job_id and entries array required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get job details for aircraft info
  const { data: job } = await supabase
    .from('quotes')
    .select('aircraft_type, aircraft_model, aircraft_id')
    .eq('id', job_id)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (!job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  // Get aircraft category from aircraft table if we have aircraft_id
  let aircraftCategory = job.aircraft_type || 'unknown';
  let aircraftMake = '';
  if (job.aircraft_id) {
    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('category, manufacturer')
      .eq('id', job.aircraft_id)
      .single();
    if (aircraft) {
      aircraftCategory = aircraft.category || aircraftCategory;
      aircraftMake = aircraft.manufacturer || '';
    }
  }

  // Clear any previous logs for this job (re-submission overwrites)
  await supabase
    .from('product_usage_log')
    .delete()
    .eq('job_id', job_id)
    .eq('detailer_id', user.detailer_id || user.id);

  // Insert new log entries
  const rows = entries
    .filter(e => e.product_id && parseFloat(e.quantity_used) > 0)
    .map(e => ({
      detailer_id: user.detailer_id || user.id,
      job_id,
      product_id: e.product_id,
      service_id: e.service_id || null,
      aircraft_make: aircraftMake,
      aircraft_model: job.aircraft_model || '',
      aircraft_category: aircraftCategory,
      quantity_used: parseFloat(e.quantity_used),
      unit: e.unit || 'oz',
      logged_by: user.id,
    }));

  if (rows.length === 0) {
    return Response.json({ error: 'No valid entries to log' }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from('product_usage_log')
    .insert(rows)
    .select();

  if (error) {
    console.error('[usage-log] insert error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Deduct from product inventory
  for (const entry of rows) {
    await supabase.rpc('decrement_product_quantity', {
      p_id: entry.product_id,
      p_amount: entry.quantity_used,
    }).catch(() => {
      // Fallback: manual update if RPC doesn't exist
      supabase
        .from('products')
        .select('quantity')
        .eq('id', entry.product_id)
        .single()
        .then(({ data: prod }) => {
          if (prod) {
            const newQty = Math.max(0, (prod.quantity || 0) - entry.quantity_used);
            supabase.from('products').update({ quantity: newQty }).eq('id', entry.product_id).then(() => {});
          }
        });
    });
  }

  // Recalculate averages + network learning. Helpers extracted to
  // lib/record-usage so the per-entry writers (crew/products and
  // jobs/product-usage) feed the same loop.
  await recalculateAverages(supabase, user.detailer_id || user.id, rows);
  await updateNetworkAverages(supabase, rows, job).catch(() => {});

  return Response.json({
    success: true,
    logged: inserted?.length || rows.length,
  });
}
