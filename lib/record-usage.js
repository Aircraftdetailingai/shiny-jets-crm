// Single source of truth for the inventory learning loop. Every code path
// that records "this product was used on this job" routes through here so the
// forecast learns from every write — not just the dedicated batch endpoint.
//
// Contract:
//   - recordUsageAndLearn writes ONE product_usage_log row and recomputes
//     averages. It does NOT deduct product stock. Callers handle their own
//     deduction (the legacy crew/products endpoint already does) and we'd
//     double-decrement if this helper did too.
//   - recalculateAverages / updateNetworkAverages are moved verbatim from the
//     old inventory/usage route so behavior is unchanged for batch callers.

export async function recalculateAverages(supabase, detailerId, entries) {
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

export async function updateNetworkAverages(supabase, entries, job) {
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

// Inserts ONE product_usage_log row and recomputes the learned + network
// averages for that single entry. No stock deduction here — see file header.
export async function recordUsageAndLearn(supabase, {
  detailerId,
  jobId,
  productId,
  serviceId = null,
  quantityUsed,
  unit = 'oz',
  aircraftMake = '',
  aircraftModel = '',
  aircraftCategory = 'unknown',
  loggedBy = null,
}) {
  if (!detailerId || !jobId || !productId) {
    throw new Error('recordUsageAndLearn: detailerId, jobId, productId are required');
  }
  const qty = parseFloat(quantityUsed);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const row = {
    detailer_id: detailerId,
    job_id: jobId,
    product_id: productId,
    service_id: serviceId || null,
    aircraft_make: aircraftMake || '',
    aircraft_model: aircraftModel || '',
    aircraft_category: aircraftCategory || 'unknown',
    quantity_used: qty,
    unit: unit || 'oz',
    logged_by: loggedBy || null,
  };

  const { data: inserted, error } = await supabase
    .from('product_usage_log')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('[record-usage] log insert failed:', error.message);
    throw error;
  }

  const entryForAvg = [row];
  await recalculateAverages(supabase, detailerId, entryForAvg);
  await updateNetworkAverages(supabase, entryForAvg, { aircraft_category: aircraftCategory }).catch((e) => {
    console.error('[record-usage] network average update failed (non-fatal):', e.message);
  });

  return inserted;
}
