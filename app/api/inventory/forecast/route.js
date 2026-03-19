import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Forecast inventory needs for upcoming scheduled jobs
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days')) || 14;

  const supabase = getSupabase();

  // Get scheduled jobs in the next N days
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + days);

  const { data: jobs } = await supabase
    .from('quotes')
    .select('id, aircraft_type, aircraft_model, aircraft_id, selected_services, line_items, scheduled_date, client_name, status')
    .eq('detailer_id', user.id)
    .in('status', ['scheduled', 'in_progress', 'paid'])
    .gte('scheduled_date', now.toISOString())
    .lte('scheduled_date', future.toISOString())
    .order('scheduled_date', { ascending: true });

  if (!jobs || jobs.length === 0) {
    return Response.json({ forecast: [], jobs: [], alerts: [] });
  }

  // Get all products for this detailer
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('detailer_id', user.id);

  if (!products || products.length === 0) {
    return Response.json({ forecast: [], jobs: jobs || [], alerts: [] });
  }

  // Get service-product assignments
  const { data: serviceProducts } = await supabase
    .from('service_products')
    .select('*')
    .eq('detailer_id', user.id);

  // Get consumption averages
  const { data: averages } = await supabase
    .from('product_consumption_averages')
    .select('*')
    .eq('detailer_id', user.id);

  // Get network averages for enterprise users
  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  let networkAverages = [];
  if (detailer?.plan === 'enterprise') {
    const { data: netAvg } = await supabase
      .from('network_consumption_averages')
      .select('*');
    networkAverages = netAvg || [];
  }

  // Build aircraft category map
  const aircraftIds = [...new Set(jobs.filter(j => j.aircraft_id).map(j => j.aircraft_id))];
  const { data: aircraftData } = aircraftIds.length > 0
    ? await supabase.from('aircraft').select('id, category, manufacturer').in('id', aircraftIds)
    : { data: [] };
  const aircraftMap = Object.fromEntries((aircraftData || []).map(a => [a.id, a]));

  // Build lookup maps
  const avgMap = new Map();
  for (const avg of (averages || [])) {
    const key = `${avg.product_id}|${avg.service_id || 'none'}|${avg.aircraft_category}`;
    avgMap.set(key, avg);
  }

  const spMap = new Map(); // service_id -> [{ product_id, quantity_per_job, quantity_per_sqft }]
  for (const sp of (serviceProducts || [])) {
    if (!spMap.has(sp.service_id)) spMap.set(sp.service_id, []);
    spMap.get(sp.service_id).push(sp);
  }

  // Calculate forecast per product
  const productNeeds = new Map(); // product_id -> { needed, jobs: [{ job, qty }] }

  for (const job of jobs) {
    const aircraft = job.aircraft_id ? aircraftMap[job.aircraft_id] : null;
    const aircraftCategory = aircraft?.category || job.aircraft_type || 'unknown';

    // Get service IDs from this job
    const serviceIds = [];
    if (job.selected_services && Array.isArray(job.selected_services)) {
      serviceIds.push(...job.selected_services);
    }
    if (job.line_items && Array.isArray(job.line_items)) {
      for (const li of job.line_items) {
        if (li.service_id && !serviceIds.includes(li.service_id)) {
          serviceIds.push(li.service_id);
        }
      }
    }

    // For each service, look up product assignments
    for (const serviceId of serviceIds) {
      const assignments = spMap.get(serviceId) || [];
      for (const assignment of assignments) {
        const productId = assignment.product_id;
        const product = products.find(p => p.id === productId);
        if (!product) continue;

        // Determine estimated quantity
        let estimatedQty = assignment.quantity_per_job || 0;

        // Check if we have a learned average
        const avgKey = `${productId}|${serviceId}|${aircraftCategory}`;
        const avg = avgMap.get(avgKey);
        if (avg && avg.sample_count >= 3) {
          estimatedQty = avg.avg_quantity;
        } else if (estimatedQty === 0) {
          // Fallback: check average without service specificity
          const genericKey = `${productId}|none|${aircraftCategory}`;
          const genericAvg = avgMap.get(genericKey);
          if (genericAvg && genericAvg.sample_count >= 3) {
            estimatedQty = genericAvg.avg_quantity;
          }
        }

        if (estimatedQty <= 0) continue;

        if (!productNeeds.has(productId)) {
          productNeeds.set(productId, { needed: 0, jobs: [] });
        }
        const entry = productNeeds.get(productId);
        entry.needed += estimatedQty;
        entry.jobs.push({
          job_id: job.id,
          client_name: job.client_name,
          aircraft_model: job.aircraft_model,
          scheduled_date: job.scheduled_date,
          quantity: estimatedQty,
          service_id: serviceId,
        });
      }
    }
  }

  // Build forecast items
  const forecast = [];
  const alerts = [];

  for (const product of products) {
    const needs = productNeeds.get(product.id);
    const needed = needs ? Math.round(needs.needed * 100) / 100 : 0;
    const have = product.quantity || 0;
    const unit = product.unit || 'oz';
    const deficit = needed > 0 ? Math.max(0, needed - have) : 0;

    // Get confidence data
    const avgEntry = averages?.find(a => a.product_id === product.id);
    const sampleCount = avgEntry?.sample_count || 0;

    // Get network average if available
    const netAvg = networkAverages.find(n =>
      n.product_name === product.name?.toLowerCase().trim() &&
      n.product_category === (product.category || 'other')
    );

    let status = 'ok';
    if (needed > 0 && have <= 0) status = 'out_of_stock';
    else if (needed > 0 && deficit > 0) status = 'low';
    else if (needed > 0) status = 'ok';
    else status = 'not_needed';

    if (needed > 0 || have > 0) {
      forecast.push({
        product_id: product.id,
        product_name: product.name,
        product_category: product.category,
        unit,
        needed,
        have,
        deficit,
        status,
        sample_count: sampleCount,
        confidence: getConfidence(sampleCount),
        network_avg: netAvg ? { avg_quantity: netAvg.avg_quantity, sample_count: netAvg.sample_count } : null,
        product_url: product.product_url || null,
        supplier: product.supplier || null,
        jobs: needs?.jobs || [],
      });
    }

    // Generate alerts for products running short
    if (status === 'out_of_stock' || status === 'low') {
      const firstJob = needs?.jobs?.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0];
      alerts.push({
        product_id: product.id,
        product_name: product.name,
        status,
        deficit,
        unit,
        first_job_date: firstJob?.scheduled_date,
        first_job_client: firstJob?.client_name,
        first_job_aircraft: firstJob?.aircraft_model,
        product_url: product.product_url || null,
        supplier: product.supplier || null,
      });
    }
  }

  // Sort: out_of_stock first, then low, then ok
  const statusOrder = { out_of_stock: 0, low: 1, ok: 2, not_needed: 3 };
  forecast.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));

  return Response.json({
    forecast,
    jobs: jobs.map(j => ({
      id: j.id,
      client_name: j.client_name,
      aircraft_model: j.aircraft_model,
      scheduled_date: j.scheduled_date,
      status: j.status,
    })),
    alerts,
    days,
  });
}

function getConfidence(sampleCount) {
  if (sampleCount >= 20) return { level: 'confident', label: 'Confident', stars: 3, color: 'green' };
  if (sampleCount >= 10) return { level: 'good', label: 'Good data', stars: 2, color: 'gold' };
  if (sampleCount >= 3) return { level: 'learning', label: 'Learning', stars: 1, color: 'yellow' };
  return { level: 'estimated', label: 'Estimated', stars: 0, color: 'gray' };
}
