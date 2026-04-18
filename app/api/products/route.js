import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendLowStockAlertEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const PRODUCT_CATEGORIES = [
  'compound',
  'polish',
  'wax',
  'ceramic',
  'cleaner',
  'degreaser',
  'brightwork',
  'leather',
  'towels',
  'applicators',
  'other',
];

const UNITS = ['oz', 'ml', 'gallon', 'liter', 'each', 'pack', 'bottle'];

// GET - Get user's products with inventory status
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const locationFilter = url.searchParams.get('location_id');

  let query = supabase
    .from('products')
    .select('*')
    .eq('detailer_id', user.id)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (locationFilter && locationFilter !== 'all') {
    if (locationFilter === 'unassigned') {
      query = query.is('location_id', null);
    } else {
      query = query.eq('location_id', locationFilter);
    }
  }

  const { data: products } = await query;

  // Map DB column names to frontend field names
  const mapped = (products || []).map(p => ({
    ...p,
    current_quantity: p.quantity ?? 0,
    reorder_threshold: p.reorder_level ?? 0,
  }));

  // Calculate inventory alerts
  const lowStock = mapped.filter(p =>
    p.reorder_threshold > 0 && p.current_quantity <= p.reorder_threshold
  );

  // Calculate inventory value
  const totalValue = mapped.reduce((sum, p) =>
    sum + ((p.current_quantity || 0) * (p.cost_per_unit || 0)), 0
  );

  return Response.json({
    products: mapped,
    categories: PRODUCT_CATEGORIES,
    units: UNITS,
    lowStock,
    totalValue,
  });
}

// POST - Add a new product
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const body = await request.json();
  const {
    name,
    brand,
    category,
    unit,
    size,
    costPerUnit,
    currentQuantity,
    reorderThreshold,
    supplier,
    notes,
    productUrl,
    imageUrl,
    locationId,
  } = body;

  if (!name) {
    return Response.json({ error: 'Product name required' }, { status: 400 });
  }

  const row = {
    detailer_id: user.id,
    name,
    brand: brand || '',
    category: category || 'other',
    unit: unit || 'oz',
    size: size || '',
    cost_per_unit: parseFloat(costPerUnit) || 0,
    quantity: parseFloat(currentQuantity) || 0,
    reorder_level: parseFloat(reorderThreshold) || 0,
    supplier: supplier || '',
    notes: notes || '',
    product_url: productUrl || '',
    image_url: imageUrl || '',
  };

  if (locationId) row.location_id = locationId;

  // Column-stripping retry pattern for graceful handling of missing columns
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: product, error } = await supabase
      .from('products')
      .insert(row)
      .select()
      .single();

    if (!error) {
      return Response.json({ product: { ...product, current_quantity: product.quantity ?? 0, reorder_threshold: product.reorder_level ?? 0 } });
    }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete row[colMatch[1]];
      continue;
    }

    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ error: 'Failed to create product' }, { status: 500 });
}

// PUT - Update a product
export async function PUT(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const body = await request.json();
  const {
    id,
    name,
    brand,
    category,
    unit,
    size,
    costPerUnit,
    currentQuantity,
    reorderThreshold,
    supplier,
    notes,
    productUrl,
    imageUrl,
  } = body;

  if (!id) {
    return Response.json({ error: 'Product ID required' }, { status: 400 });
  }

  const updates = {};

  if (name !== undefined) updates.name = name;
  if (brand !== undefined) updates.brand = brand;
  if (category !== undefined) updates.category = category;
  if (unit !== undefined) updates.unit = unit;
  if (size !== undefined) updates.size = size;
  if (costPerUnit !== undefined) updates.cost_per_unit = parseFloat(costPerUnit) || 0;
  if (currentQuantity !== undefined) updates.quantity = parseFloat(currentQuantity) || 0;
  if (reorderThreshold !== undefined) updates.reorder_level = parseFloat(reorderThreshold) || 0;
  if (supplier !== undefined) updates.supplier = supplier;
  if (notes !== undefined) updates.notes = notes;
  if (productUrl !== undefined) updates.product_url = productUrl;
  if (imageUrl !== undefined) updates.image_url = imageUrl;
  if (body.locationId !== undefined) updates.location_id = body.locationId || null;

  // Column-stripping retry for graceful handling of missing columns
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .eq('detailer_id', user.id)
      .select()
      .single();

    if (!error) {
      return Response.json({ product: { ...product, current_quantity: product.quantity ?? 0, reorder_threshold: product.reorder_level ?? 0 } });
    }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete updates[colMatch[1]];
      continue;
    }

    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ error: 'Failed to update product' }, { status: 500 });
}

// PATCH - Adjust inventory (add or subtract quantity)
export async function PATCH(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { id, adjustment, reason } = body;

  if (!id || adjustment === undefined) {
    return Response.json({ error: 'Product ID and adjustment required' }, { status: 400 });
  }

  // Get current quantity and reorder info
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('detailer_id', user.id)
    .single();

  if (!product) {
    return Response.json({ error: 'Product not found' }, { status: 404 });
  }

  const oldQuantity = product.quantity || 0;
  const newQuantity = Math.max(0, oldQuantity + parseFloat(adjustment));

  const { data: updated, error } = await supabase
    .from('products')
    .update({
      quantity: newQuantity,
    })
    .eq('id', id)
    .eq('detailer_id', user.id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Send low stock email alert if product just crossed below reorder threshold
  const threshold = product.reorder_level || 0;
  if (threshold > 0 && newQuantity <= threshold && oldQuantity > threshold) {
    try {
      const { data: detailer } = await supabase
        .from('detailers')
        .select('id, name, email, company')
        .eq('id', user.id)
        .single();

      if (detailer?.email) {
        sendLowStockAlertEmail({
          products: [{ ...updated, reorder_threshold: threshold }],
          detailer,
        }).catch(() => {});
      }
    } catch (e) {
      // Never fail the main operation for email
    }
  }

  return Response.json({ product: { ...updated, current_quantity: updated.quantity ?? 0, reorder_threshold: updated.reorder_level ?? 0 } });
}

// DELETE - Remove a product
export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'Product ID required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('detailer_id', user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
