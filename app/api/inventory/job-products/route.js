import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Get products assigned to services for a specific job (pre-fill the logging form)
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('job_id');

  if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400 });

  const supabase = getSupabase();

  // Get job details
  const { data: job } = await supabase
    .from('quotes')
    .select('id, aircraft_type, aircraft_model, aircraft_id, selected_services, line_items, client_name, status')
    .eq('id', jobId)
    .eq('detailer_id', user.id)
    .single();

  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Get aircraft category
  let aircraftCategory = job.aircraft_type || 'unknown';
  if (job.aircraft_id) {
    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('category, manufacturer')
      .eq('id', job.aircraft_id)
      .single();
    if (aircraft?.category) aircraftCategory = aircraft.category;
  }

  // Get service IDs from the job
  const serviceIds = [];
  const serviceNames = {};
  if (job.selected_services && Array.isArray(job.selected_services)) {
    serviceIds.push(...job.selected_services);
  }
  if (job.line_items && Array.isArray(job.line_items)) {
    for (const li of job.line_items) {
      if (li.service_id && !serviceIds.includes(li.service_id)) {
        serviceIds.push(li.service_id);
      }
      if (li.service_id) {
        serviceNames[li.service_id] = li.description || li.name || '';
      }
    }
  }

  // Get service names if not from line_items
  if (serviceIds.length > 0) {
    const { data: services } = await supabase
      .from('services')
      .select('id, name')
      .in('id', serviceIds);
    for (const s of (services || [])) {
      if (!serviceNames[s.id]) serviceNames[s.id] = s.name;
    }
  }

  // Get service-product assignments
  const { data: serviceProducts } = await supabase
    .from('service_products')
    .select('*')
    .eq('detailer_id', user.id)
    .in('service_id', serviceIds.length > 0 ? serviceIds : ['none']);

  // Get all products
  const productIds = [...new Set((serviceProducts || []).map(sp => sp.product_id))];
  let products = [];
  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, category, unit, quantity, brand')
      .in('id', productIds);
    products = prods || [];
  }

  // Get consumption averages for smart pre-filling
  const { data: averages } = await supabase
    .from('product_consumption_averages')
    .select('*')
    .eq('detailer_id', user.id);

  // Check if already logged
  const { data: existingLogs } = await supabase
    .from('product_usage_log')
    .select('*')
    .eq('job_id', jobId)
    .eq('detailer_id', user.id);

  // Build the pre-filled form data
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const avgMap = new Map();
  for (const avg of (averages || [])) {
    const key = `${avg.product_id}|${avg.service_id || 'none'}|${avg.aircraft_category}`;
    avgMap.set(key, avg);
  }

  // Group by service
  const serviceGroups = [];
  for (const serviceId of serviceIds) {
    const assignments = (serviceProducts || []).filter(sp => sp.service_id === serviceId);
    if (assignments.length === 0) continue;

    const items = assignments.map(sp => {
      const product = productMap[sp.product_id];
      if (!product) return null;

      // Determine estimated quantity
      let estimatedQty = sp.quantity_per_job || 0;
      let confidence = { level: 'estimated', label: 'Estimated', stars: 0, color: 'gray' };

      const avgKey = `${sp.product_id}|${serviceId}|${aircraftCategory}`;
      const avg = avgMap.get(avgKey);
      if (avg && avg.sample_count >= 3) {
        estimatedQty = avg.avg_quantity;
        confidence = getConfidence(avg.sample_count);
      }

      // Check if there's an existing log for this product
      const existingLog = (existingLogs || []).find(l => l.product_id === sp.product_id && l.service_id === serviceId);

      return {
        product_id: product.id,
        product_name: product.name,
        product_brand: product.brand,
        product_category: product.category,
        unit: product.unit || 'oz',
        current_stock: product.quantity || 0,
        estimated_quantity: Math.round(estimatedQty * 100) / 100,
        actual_quantity: existingLog ? parseFloat(existingLog.quantity_used) : null,
        confidence,
        service_id: serviceId,
      };
    }).filter(Boolean);

    if (items.length > 0) {
      serviceGroups.push({
        service_id: serviceId,
        service_name: serviceNames[serviceId] || 'Service',
        products: items,
      });
    }
  }

  return Response.json({
    job: {
      id: job.id,
      client_name: job.client_name,
      aircraft_model: job.aircraft_model,
      aircraft_type: job.aircraft_type,
      status: job.status,
    },
    aircraft_category: aircraftCategory,
    service_groups: serviceGroups,
    already_logged: (existingLogs || []).length > 0,
  });
}

function getConfidence(sampleCount) {
  if (sampleCount >= 20) return { level: 'confident', label: 'Confident', stars: 3, color: 'green' };
  if (sampleCount >= 10) return { level: 'good', label: 'Good data', stars: 2, color: 'gold' };
  if (sampleCount >= 3) return { level: 'learning', label: 'Learning', stars: 1, color: 'yellow' };
  return { level: 'estimated', label: 'Estimated', stars: 0, color: 'gray' };
}
