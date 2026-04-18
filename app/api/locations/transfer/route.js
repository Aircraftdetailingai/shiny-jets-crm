import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Transfer product/equipment to a new location
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { item_type, item_id, to_location_id, quantity, notes } = await request.json();

  if (!item_type || !item_id || !to_location_id) {
    return Response.json({ error: 'item_type, item_id, and to_location_id required' }, { status: 400 });
  }

  if (!['product', 'equipment'].includes(item_type)) {
    return Response.json({ error: 'item_type must be product or equipment' }, { status: 400 });
  }

  const table = item_type === 'product' ? 'products' : 'equipment';

  // Get current item
  const { data: item } = await supabase
    .from(table)
    .select('*')
    .eq('id', item_id)
    .eq('detailer_id', user.id)
    .single();

  if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });

  const fromLocationId = item.location_id || null;

  // For products: if transferring partial quantity, split the item
  if (item_type === 'product' && quantity && quantity < (item.quantity || 0)) {
    // Reduce quantity at source
    await supabase
      .from('products')
      .update({ quantity: (item.quantity || 0) - quantity })
      .eq('id', item_id)
      .eq('detailer_id', user.id);

    // Create new product at destination with transferred quantity
    const newRow = { ...item };
    delete newRow.id;
    delete newRow.created_at;
    delete newRow.updated_at;
    newRow.location_id = to_location_id;
    newRow.quantity = quantity;

    // Check if same product already exists at destination
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('detailer_id', user.id)
      .eq('name', item.name)
      .eq('location_id', to_location_id)
      .limit(1);

    if (existing && existing.length > 0) {
      // Merge into existing
      await supabase
        .from('products')
        .update({ quantity: (existing[0].quantity || 0) + quantity })
        .eq('id', existing[0].id);
    } else {
      await supabase.from('products').insert(newRow);
    }
  } else {
    // Move the entire item
    await supabase
      .from(table)
      .update({ location_id: to_location_id })
      .eq('id', item_id)
      .eq('detailer_id', user.id);
  }

  // Log the transfer
  const transferRow = {
    detailer_id: user.id,
    item_type,
    item_id,
    from_location_id: fromLocationId,
    to_location_id: to_location_id,
    quantity: quantity || 1,
    notes: notes || null,
  };

  // Try to insert transfer log (table may not exist yet)
  try {
    await supabase.from('location_transfers').insert(transferRow);
  } catch (e) {
    // Transfer log is non-critical
  }

  return Response.json({ success: true });
}

// GET - Transfer history
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await supabase
    .from('location_transfers')
    .select('*')
    .eq('detailer_id', user.id)
    .order('transferred_at', { ascending: false })
    .limit(50);

  if (error) return Response.json({ transfers: [] });

  return Response.json({ transfers: data || [] });
}
