import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { recordUsageAndLearn } from '@/lib/record-usage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Bypass Next's Data Cache on supabase-js's internal fetch (d7b2d9e / 54b0b2e).
// Crew dashboard reads catalog products through this route; without no-store
// fetch, recently-added products are served stale.
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (u, opts) => fetch(u, { ...opts, cache: 'no-store' }) } },
  );
}

async function getCrewUser(request) {
  const payload = await getAuthUser(request);
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// GET - List products (no costs shown to crew)
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!user.can_see_inventory) {
    return Response.json({ error: 'No inventory access' }, { status: 403 });
  }

  const supabase = getSupabase();

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, category, unit, size, quantity, reorder_level, brand, notes, image_url')
    .eq('detailer_id', user.detailer_id)
    .order('name', { ascending: true });

  if (error) {
    console.error('Crew products fetch error:', error);
    return Response.json({ error: 'Failed to fetch products' }, { status: 500 });
  }

  const sanitized = (products || []).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    size: p.size || null,
    quantity: parseFloat(p.quantity) || 0,
    low_stock: (parseFloat(p.quantity) || 0) < 2,
    brand: p.brand,
    notes: p.notes,
    image_url: p.image_url,
  }));

  return Response.json({ products: sanitized });
}

// POST - Log product usage on a job
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!user.can_see_inventory) {
    return Response.json({ error: 'No inventory access' }, { status: 403 });
  }
  if (user.can_log_products === false) {
    return Response.json({ error: 'Not authorized to log product usage' }, { status: 403 });
  }

  const body = await request.json();
  const { quote_id, job_id, product_id, amount_used, unit, notes, is_unlisted, product_name: bodyName, product_brand: bodyBrand, service_id } = body;
  const refId = job_id || quote_id;

  // Two paths: catalog product (requires product_id, deducts stock) and
  // unlisted/freeform (requires product_name, no stock deduction). The
  // unlisted path lets crew log a product they don't have in the catalog
  // yet — the row is flagged so the owner can see and optionally add it
  // to inventory later.
  const cleanName = (bodyName || '').trim();
  if (is_unlisted) {
    if (!refId || !cleanName || !amount_used) {
      return Response.json({ error: 'job_id (or quote_id), product_name, and amount_used are required for unlisted products' }, { status: 400 });
    }
  } else if (!refId || !product_id || !amount_used) {
    return Response.json({ error: 'job_id (or quote_id), product_id, and amount_used are required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Resolve which table the ID belongs to
  let resolvedJobId = null, resolvedQuoteId = null;
  const { data: jobRow } = await supabase.from('jobs').select('id').eq('id', refId).eq('detailer_id', user.detailer_id).maybeSingle();
  if (jobRow) {
    resolvedJobId = refId;
  } else {
    const { data: quoteRow } = await supabase.from('quotes').select('id').eq('id', refId).eq('detailer_id', user.detailer_id).maybeSingle();
    if (quoteRow) resolvedQuoteId = refId;
  }
  if (!resolvedJobId && !resolvedQuoteId) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Catalog path: verify product exists and prep stock deduction. Unlisted
  // path: skip both — there's nothing to deduct from.
  let product = null;
  let amount = parseFloat(amount_used);
  let oldQty = 0, newQty = 0;
  if (!is_unlisted) {
    const { data } = await supabase
      .from('products')
      .select('id, name, quantity, unit')
      .eq('id', product_id)
      .eq('detailer_id', user.detailer_id)
      .single();
    if (!data) return Response.json({ error: 'Product not found' }, { status: 404 });
    product = data;
    oldQty = parseFloat(product.quantity) || 0;
    newQty = Math.max(0, oldQty - amount);
  }

  // Try job_product_usage first (newer table with team_member_id, logged_at, etc.)
  let usageId = null;
  const resolvedName = is_unlisted ? cleanName : product.name;
  const resolvedUnit = unit || (product?.unit) || 'each';
  let entry = {
    job_id: resolvedJobId,
    quote_id: resolvedQuoteId,
    product_id: is_unlisted ? null : product_id,
    product_name: resolvedName,
    product_brand: is_unlisted ? ((bodyBrand || '').trim() || null) : null,
    is_unlisted: !!is_unlisted,
    detailer_id: user.detailer_id,
    team_member_id: user.id,
    actual_quantity: amount,
    amount_used: amount,
    unit: resolvedUnit,
    notes: notes || '',
    logged_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from('job_product_usage')
      .insert(entry)
      .select('id')
      .single();
    if (!error) { usageId = data.id; break; }
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
    if (colMatch) { delete entry[colMatch[1]]; continue; }
    if (error.code === '42P01' || error.message?.includes('does not exist in')) break;
    if (error.code === '42501' || error.message?.includes('row-level security') || error.message?.includes('policy')) {
      console.error('[crew/products] RLS BLOCK — job_product_usage INSERT denied. error:', error.message, 'detailer:', user.detailer_id, 'team_member:', user.id);
      return Response.json({ error: 'Permission denied saving product usage. Contact support.' }, { status: 403 });
    }
    console.error('[crew/products] job_product_usage INSERT failed:', error.message, 'code:', error.code, 'details:', error.details, 'hint:', error.hint);
    break;
  }

  // Fallback: legacy product_usage table
  if (!usageId) {
    let legacy = {
      quote_id: resolvedQuoteId || resolvedJobId,
      product_id,
      amount_used: amount,
      unit: unit || product.unit || 'oz',
      notes: notes || '',
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.from('product_usage').insert(legacy).select('id').single();
      if (!error) { usageId = data.id; break; }
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
      if (colMatch) { delete legacy[colMatch[1]]; continue; }
      console.error('[crew/products] product_usage insert error:', error.message);
      return Response.json({ error: 'Failed to log product usage' }, { status: 500 });
    }
  }

  if (!usageId) return Response.json({ error: 'Failed to log product usage' }, { status: 500 });

  // Deduct quantity from the catalog row only when there IS a catalog row.
  // Unlisted entries have no inventory to subtract from.
  if (!is_unlisted && product) {
    await supabase.from('products').update({ quantity: newQty }).eq('id', product_id);
  }

  // Feed the learning loop for catalog products. Unlisted entries skip — they
  // have no catalog product_id, so they can't contribute to per-product
  // averages. Resolve aircraft context from the underlying quote (matching
  // the inventory/usage route's pattern). Failures here are non-fatal: the
  // job_product_usage write already succeeded above and stock was deducted.
  if (!is_unlisted && product_id) {
    try {
      const lookupId = resolvedQuoteId || resolvedJobId;
      let aircraftCategory = 'unknown';
      let aircraftMake = '';
      let aircraftModel = '';

      // Prefer quote (has aircraft_id/aircraft_model). Fall back to jobs row.
      const { data: quoteRow } = await supabase
        .from('quotes')
        .select('aircraft_type, aircraft_model, aircraft_id')
        .eq('id', lookupId)
        .maybeSingle();
      if (quoteRow) {
        aircraftCategory = quoteRow.aircraft_type || 'unknown';
        aircraftModel = quoteRow.aircraft_model || '';
        if (quoteRow.aircraft_id) {
          const { data: ac } = await supabase
            .from('aircraft')
            .select('category, manufacturer')
            .eq('id', quoteRow.aircraft_id)
            .single();
          if (ac) {
            aircraftCategory = ac.category || aircraftCategory;
            aircraftMake = ac.manufacturer || '';
          }
        }
      } else if (resolvedJobId) {
        const { data: jobRow2 } = await supabase
          .from('jobs')
          .select('aircraft_make, aircraft_model')
          .eq('id', resolvedJobId)
          .maybeSingle();
        if (jobRow2) {
          aircraftMake = jobRow2.aircraft_make || '';
          aircraftModel = jobRow2.aircraft_model || '';
        }
      }

      await recordUsageAndLearn(supabase, {
        detailerId: user.detailer_id,
        jobId: resolvedJobId || resolvedQuoteId,
        productId: product_id,
        serviceId: service_id || null,
        quantityUsed: amount,
        unit: resolvedUnit,
        aircraftMake,
        aircraftModel,
        aircraftCategory,
        loggedBy: user.id,
      });
    } catch (e) {
      console.error('[crew/products] learning loop failed (non-fatal):', e.message);
    }
  }

  // Log to crew_activity_log (non-blocking)
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: user.detailer_id,
      team_member_id: user.id,
      team_member_name: user.name,
      job_id: resolvedJobId || resolvedQuoteId,
      action_type: 'product_usage',
      action_details: {
        product_id: is_unlisted ? null : product_id,
        product_name: resolvedName,
        product_brand: is_unlisted ? ((bodyBrand || '').trim() || null) : null,
        is_unlisted: !!is_unlisted,
        amount_used: amount,
        unit: resolvedUnit,
        old_quantity: is_unlisted ? null : oldQty,
        new_quantity: is_unlisted ? null : newQty,
      },
    });
  } catch (e) {
    console.error('[crew/products] Activity log error:', e.message);
  }

  return Response.json({ success: true, usage_id: usageId });
}
