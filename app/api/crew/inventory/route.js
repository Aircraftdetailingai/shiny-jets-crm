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
    .select('id, name, category, unit, quantity, reorder_level, brand, notes, image_url')
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
    quantity: parseFloat(p.quantity) || 0,
    reorder_level: parseFloat(p.reorder_level) || 0,
    low_stock: parseFloat(p.reorder_level) > 0 && parseFloat(p.quantity) <= parseFloat(p.reorder_level),
    brand: p.brand,
    notes: p.notes,
    image_url: p.image_url,
  }));

  console.log('[crew/inventory] member:', user.id, 'items:', items.length);
  return Response.json({ items });
}

// PATCH — update quantity for a specific product
export async function PATCH(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.can_see_inventory) return Response.json({ error: 'No inventory access' }, { status: 403 });

  const { product_id, quantity } = await request.json();
  if (!product_id || quantity === undefined) {
    return Response.json({ error: 'product_id and quantity required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify product belongs to crew's detailer
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('id', product_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!product) return Response.json({ error: 'Product not found' }, { status: 404 });

  const { error } = await supabase
    .from('products')
    .update({ quantity: parseFloat(quantity) })
    .eq('id', product_id);

  if (error) {
    console.error('[crew/inventory] PATCH error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  console.log('[crew/inventory] Updated product:', product_id, 'qty:', quantity, 'by:', user.id);
  return Response.json({ success: true });
}

// POST — add a new product to inventory
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.can_see_inventory) return Response.json({ error: 'No inventory access' }, { status: 403 });

  const { name, category, unit, quantity, brand, notes } = await request.json();
  if (!name) return Response.json({ error: 'Product name required' }, { status: 400 });

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('products')
    .insert({
      detailer_id: user.detailer_id,
      name,
      category: category || 'General',
      unit: unit || 'oz',
      quantity: parseFloat(quantity) || 0,
      brand: brand || null,
      notes: notes || null,
    })
    .select('id, name')
    .single();

  if (error) {
    console.error('[crew/inventory] POST error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  console.log('[crew/inventory] Added product:', data.name, 'by:', user.id);
  return Response.json({ success: true, product: data });
}
