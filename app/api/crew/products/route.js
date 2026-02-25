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
    .select('id, name, category, unit, current_quantity, reorder_threshold, brand, notes, image_url')
    .eq('detailer_id', user.detailer_id)
    .order('name', { ascending: true });

  if (error) {
    console.error('Crew products fetch error:', error);
    return Response.json({ error: 'Failed to fetch products' }, { status: 500 });
  }

  // Strip any cost fields - crew never sees pricing
  const sanitized = (products || []).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    current_quantity: p.current_quantity,
    low_stock: p.reorder_threshold > 0 && p.current_quantity <= p.reorder_threshold,
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

  const { quote_id, product_id, amount_used, unit, notes } = await request.json();

  if (!quote_id || !product_id || !amount_used) {
    return Response.json({ error: 'quote_id, product_id, and amount_used are required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify job belongs to crew's detailer
  const { data: quote } = await supabase
    .from('quotes')
    .select('id')
    .eq('id', quote_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!quote) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Verify product belongs to crew's detailer
  const { data: product } = await supabase
    .from('products')
    .select('id, current_quantity')
    .eq('id', product_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!product) return Response.json({ error: 'Product not found' }, { status: 404 });

  let entry = {
    quote_id,
    product_id,
    amount_used: parseFloat(amount_used),
    unit: unit || 'oz',
    notes: notes || '',
  };

  // Column-stripping retry
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('product_usage')
      .insert(entry)
      .select('id')
      .single();

    if (!error) {
      // Deduct from current_quantity
      const newQty = Math.max(0, (product.current_quantity || 0) - parseFloat(amount_used));
      await supabase
        .from('products')
        .update({ current_quantity: newQty })
        .eq('id', product_id);

      return Response.json({ success: true, usage_id: data.id });
    }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete entry[colMatch[1]];
      continue;
    }

    console.error('Log product usage error:', error);
    return Response.json({ error: 'Failed to log product usage' }, { status: 500 });
  }

  return Response.json({ error: 'Failed to log product usage' }, { status: 500 });
}
