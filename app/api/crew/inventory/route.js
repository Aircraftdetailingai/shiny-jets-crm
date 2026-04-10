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

// GET — fetch inventory items for crew's detailer
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.can_see_inventory) return Response.json({ error: 'No inventory access' }, { status: 403 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, unit, size, quantity, reorder_level, brand, notes, image_url')
    .eq('detailer_id', user.detailer_id)
    .order('name', { ascending: true });

  if (error) {
    console.error('[crew/inventory] GET error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const items = (data || []).map(p => ({
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

  console.log('[crew/inventory] member:', user.id, 'items:', items.length);
  return Response.json({ items });
}

// PATCH — update quantity for a specific product (absolute or delta)
export async function PATCH(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.can_see_inventory) return Response.json({ error: 'No inventory access' }, { status: 403 });

  const { product_id, quantity, adjustment } = await request.json();
  if (!product_id || (quantity === undefined && adjustment === undefined)) {
    return Response.json({ error: 'product_id and quantity or adjustment required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch product to verify ownership and get current state
  const { data: product } = await supabase
    .from('products')
    .select('id, name, quantity, unit')
    .eq('id', product_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!product) return Response.json({ error: 'Product not found' }, { status: 404 });

  const oldQuantity = parseFloat(product.quantity) || 0;
  let newQuantity;

  if (adjustment !== undefined) {
    // Delta mode: add/subtract from current
    newQuantity = Math.max(0, oldQuantity + parseFloat(adjustment));
  } else {
    // Absolute mode
    newQuantity = Math.max(0, parseFloat(quantity));
  }

  const { error } = await supabase
    .from('products')
    .update({ quantity: newQuantity })
    .eq('id', product_id);

  if (error) {
    console.error('[crew/inventory] PATCH error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Log to crew_activity_log (non-blocking)
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: user.detailer_id,
      team_member_id: user.id,
      team_member_name: user.name,
      action_type: 'inventory_update',
      action_details: {
        product_id,
        product_name: product.name,
        old_quantity: oldQuantity,
        new_quantity: newQuantity,
        unit: product.unit,
      },
    });
  } catch (e) {
    console.error('[crew/inventory] Activity log error:', e);
  }

  console.log('[crew/inventory] Updated product:', product_id, 'qty:', oldQuantity, '->', newQuantity, 'by:', user.id);
  return Response.json({
    success: true,
    product: {
      id: product_id,
      name: product.name,
      quantity: newQuantity,
      unit: product.unit,
    },
  });
}

// POST — add a new product to inventory
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.can_see_inventory) return Response.json({ error: 'No inventory access' }, { status: 403 });

  const { name, category, unit, size, quantity, brand, notes } = await request.json();
  if (!name) return Response.json({ error: 'Product name required' }, { status: 400 });

  const supabase = getSupabase();

  const newQty = parseFloat(quantity) || 0;
  const { data, error } = await supabase
    .from('products')
    .insert({
      detailer_id: user.detailer_id,
      name,
      category: category || 'General',
      unit: unit || 'oz',
      size: size || null,
      quantity: newQty,
      brand: brand || null,
      notes: notes || null,
    })
    .select('id, name, category, unit, size, quantity, brand')
    .single();

  if (error) {
    console.error('[crew/inventory] POST error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Log to crew_activity_log (non-blocking)
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: user.detailer_id,
      team_member_id: user.id,
      team_member_name: user.name,
      action_type: 'inventory_add',
      action_details: {
        product_id: data.id,
        product_name: data.name,
        category: data.category,
        quantity: newQty,
        unit: data.unit,
      },
    });
  } catch (e) {
    console.error('[crew/inventory] Activity log error:', e);
  }

  console.log('[crew/inventory] Added product:', data.name, 'by:', user.id);
  return Response.json({ success: true, product: data });
}
