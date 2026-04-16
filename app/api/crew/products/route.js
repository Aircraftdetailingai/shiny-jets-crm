import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(authHeader.slice(7));
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

  const body = await request.json();
  const { quote_id, job_id, product_id, amount_used, unit, notes } = body;
  const refId = job_id || quote_id;

  if (!refId || !product_id || !amount_used) {
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

  // Verify product
  const { data: product } = await supabase
    .from('products')
    .select('id, name, quantity, unit')
    .eq('id', product_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!product) return Response.json({ error: 'Product not found' }, { status: 404 });

  const amount = parseFloat(amount_used);
  const oldQty = parseFloat(product.quantity) || 0;
  const newQty = Math.max(0, oldQty - amount);

  // Try job_product_usage first (newer table with team_member_id, logged_at, etc.)
  let usageId = null;
  let entry = {
    job_id: resolvedJobId,
    quote_id: resolvedQuoteId,
    product_id,
    product_name: product.name,
    detailer_id: user.detailer_id,
    team_member_id: user.id,
    actual_quantity: amount,
    amount_used: amount,
    unit: unit || product.unit || 'oz',
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
    if (error.code === '42P01' || error.message?.includes('does not exist in')) break; // table missing — fall back
    console.error('[crew/products] job_product_usage insert error:', error.message);
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

  // Deduct quantity
  await supabase.from('products').update({ quantity: newQty }).eq('id', product_id);

  // Log to crew_activity_log (non-blocking)
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: user.detailer_id,
      team_member_id: user.id,
      team_member_name: user.name,
      job_id: resolvedJobId || resolvedQuoteId,
      action_type: 'product_usage',
      action_details: {
        product_id,
        product_name: product.name,
        amount_used: amount,
        unit: unit || product.unit || 'oz',
        old_quantity: oldQty,
        new_quantity: newQty,
      },
    });
  } catch (e) {
    console.error('[crew/products] Activity log error:', e.message);
  }

  return Response.json({ success: true, usage_id: usageId });
}
