import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

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
    // Get logs for a specific job
    const { data: logs } = await supabase
      .from('product_usage_log')
      .select('*')
      .eq('detailer_id', user.id)
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    return Response.json({ logs: logs || [] });
  }

  // Get recent logs
  const { data: logs } = await supabase
    .from('product_usage_log')
    .select('*')
    .eq('detailer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return Response.json({ logs: logs || [] });
}

// POST - Log product usage for a job
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
    .eq('detailer_id', user.id)
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
    .eq('detailer_id', user.id);

  // Insert new log entries
  const rows = entries
    .filter(e => e.product_id && parseFloat(e.quantity_used) > 0)
    .map(e => ({
      detailer_id: user.id,
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

  // Recalculate averages for each product+service+category combo
  await recalculateAverages(supabase, user.id, rows);

  // Update network averages
  await updateNetworkAverages(supabase, rows, job).catch(() => {});

  return Response.json({
    success: true,
    logged: inserted?.length || rows.length,
  });
}

async function recalculateAverages(supabase, detailerId, entries) {
  // Group by product+service+category
  const combos = new Map();
  for (const e of entries) {
    const key = `${e.product_id}|${e.service_id || 'none'}|${e.aircraft_category}`;
    if (!combos.has(key)) {
      combos.set(key, { product_id: e.product_id, service_id: e.service_id, aircraft_category: e.aircraft_category });
    }
  }

  for (const combo of combos.values()) {
    // Query all logs for this combo
    let query = supabase
      .from('product_usage_log')
      .select('quantity_used')
      .eq('detailer_id', detailerId)
      .eq('product_id', combo.product_id)
      .eq('aircraft_category', combo.aircraft_category);

    if (combo.service_id) {
      query = query.eq('service_id', combo.service_id);
    } else {
      query = query.is('service_id', null);
    }

    const { data: logs } = await query;
    if (!logs || logs.length === 0) continue;

    const avgQty = logs.reduce((sum, l) => sum + parseFloat(l.quantity_used), 0) / logs.length;

    // Upsert average
    await supabase
      .from('product_consumption_averages')
      .upsert({
        detailer_id: detailerId,
        product_id: combo.product_id,
        service_id: combo.service_id || null,
        aircraft_category: combo.aircraft_category,
        avg_quantity: Math.round(avgQty * 100) / 100,
        sample_count: logs.length,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'detailer_id,product_id,service_id,aircraft_category',
      });
  }
}

async function updateNetworkAverages(supabase, entries, job) {
  // Get product and service names for network aggregation
  const productIds = [...new Set(entries.map(e => e.product_id))];
  const serviceIds = [...new Set(entries.filter(e => e.service_id).map(e => e.service_id))];

  const { data: products } = await supabase
    .from('products')
    .select('id, name, category')
    .in('id', productIds);

  const { data: services } = serviceIds.length > 0
    ? await supabase.from('services').select('id, name').in('id', serviceIds)
    : { data: [] };

  const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const serviceMap = Object.fromEntries((services || []).map(s => [s.id, s]));

  for (const entry of entries) {
    const product = productMap[entry.product_id];
    const service = entry.service_id ? serviceMap[entry.service_id] : null;
    if (!product) continue;

    const productName = product.name?.toLowerCase().trim();
    const productCategory = product.category || 'other';
    const serviceName = service?.name?.toLowerCase().trim() || 'general';
    const aircraftCategory = entry.aircraft_category || 'unknown';

    // Get all network logs for this combo
    const { data: networkLogs } = await supabase
      .from('product_usage_log')
      .select('quantity_used')
      .eq('aircraft_category', aircraftCategory)
      .in('product_id', (await supabase
        .from('products')
        .select('id')
        .ilike('name', productName)
      ).data?.map(p => p.id) || []);

    if (!networkLogs || networkLogs.length === 0) continue;

    const avgQty = networkLogs.reduce((sum, l) => sum + parseFloat(l.quantity_used), 0) / networkLogs.length;

    await supabase
      .from('network_consumption_averages')
      .upsert({
        product_name: productName,
        product_category: productCategory,
        service_name: serviceName,
        aircraft_category: aircraftCategory,
        avg_quantity: Math.round(avgQty * 100) / 100,
        sample_count: networkLogs.length,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'product_name,product_category,service_name,aircraft_category',
      });
  }
}
