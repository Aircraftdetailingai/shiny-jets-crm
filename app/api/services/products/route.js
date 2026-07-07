import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get linked products for a service (or all services)
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const detailerId = user.detailer_id || user.id;
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');

    let query = supabase
      .from('service_products')
      .select('*, products(id, name, category, unit, cost_per_unit, image_url)')
      .eq('detailer_id', detailerId);

    if (serviceId) query = query.eq('service_id', serviceId);

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch service products:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ links: data || [] });
  } catch (err) {
    console.error('Service products GET error:', err);
    return Response.json({ error: 'Failed to fetch service products' }, { status: 500 });
  }
}

// POST - Link a product to a service (idempotent via unique constraint)
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const detailerId = user.detailer_id || user.id;
    const body = await request.json();
    const { service_id, product_id, quantity_per_job, notes } = body;

    if (!service_id || !product_id) {
      return Response.json({ error: 'service_id and product_id are required' }, { status: 400 });
    }

    // Verify service belongs to this detailer.
    const { data: svc, error: svcErr } = await supabase
      .from('services')
      .select('id')
      .eq('id', service_id)
      .eq('detailer_id', detailerId)
      .single();

    if (svcErr || !svc) {
      console.error('[service-products POST] service lookup failed:', { service_id, detailerId, err: svcErr?.message });
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    const row = {
      detailer_id: detailerId,
      service_id,
      product_id,
      quantity_per_job: parseFloat(quantity_per_job) || 0,
      notes: notes || '',
    };

    const { data: link, error } = await supabase
      .from('service_products')
      .upsert(row, { onConflict: 'service_id,product_id' })
      .select('*, products(id, name, category, unit, cost_per_unit, image_url)')
      .single();

    if (error) {
      console.error('[service-products POST] upsert failed:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ link });
  } catch (err) {
    console.error('Service products POST error:', err);
    return Response.json({ error: 'Failed to link product' }, { status: 500 });
  }
}

// PUT - Update a product link
export async function PUT(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const detailerId = user.detailer_id || user.id;
    const body = await request.json();
    const { id, quantity_per_job, quantity_per_sqft, notes, is_default, service_id } = body;

    if (!id) return Response.json({ error: 'Link ID required' }, { status: 400 });

    // Ownership check: rows now have detailer_id directly.
    const { data: existing } = await supabase
      .from('service_products')
      .select('id')
      .eq('id', id)
      .eq('detailer_id', detailerId)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const updates = {};
    if (quantity_per_job !== undefined) updates.quantity_per_job = parseFloat(quantity_per_job) || 0;
    if (quantity_per_sqft !== undefined) updates.quantity_per_sqft = parseFloat(quantity_per_sqft) || 0;
    if (notes !== undefined) updates.notes = notes;
    if (is_default !== undefined) {
      updates.is_default = !!is_default;
      // Only one default per service: clear siblings if we're setting this one.
      if (is_default && service_id) {
        await supabase
          .from('service_products')
          .update({ is_default: false })
          .eq('service_id', service_id)
          .neq('id', id);
      }
    }

    const { data: link, error } = await supabase
      .from('service_products')
      .update(updates)
      .eq('id', id)
      .select('*, products(id, name, category, unit, cost_per_unit, image_url)')
      .single();

    if (error) {
      console.error('[service-products PUT] update failed:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ link });
  } catch (err) {
    console.error('Service products PUT error:', err);
    return Response.json({ error: 'Failed to update link' }, { status: 500 });
  }
}

// DELETE - Remove a product link
export async function DELETE(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const detailerId = user.detailer_id || user.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: 'Link ID required' }, { status: 400 });

    const { data: existing } = await supabase
      .from('service_products')
      .select('id')
      .eq('id', id)
      .eq('detailer_id', detailerId)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const { error } = await supabase
      .from('service_products')
      .delete()
      .eq('id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Failed to remove link' }, { status: 500 });
  }
}
