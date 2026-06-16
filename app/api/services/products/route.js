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

    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');

    let query = supabase
      .from('service_products')
      .select('*, products(id, name, category, unit, cost_per_unit, image_url), services!inner(detailer_id)')
      .eq('services.detailer_id', user.id);

    if (serviceId) {
      query = query.eq('service_id', serviceId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch service products:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Strip the inner join helper
    const links = (data || []).map(({ services, ...rest }) => rest);

    return Response.json({ links });
  } catch (err) {
    console.error('Service products GET error:', err);
    return Response.json({ error: 'Failed to fetch service products' }, { status: 500 });
  }
}

// POST - Link a product to a service
//
// Accepts BOTH the legacy interface (quantity_per_hour, fixed_quantity) and
// the new pace interface (quantity_per_job, quantity_per_sqft) that the
// column-drift migration added. We were silently 500ing because the route
// only sent the legacy fields and the upsert's onConflict needs a unique
// constraint that may not exist on every deploy — both problems handled
// below with column-stripping retry + insert-or-update fallback.
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const {
      service_id,
      product_id,
      quantity_per_hour,
      fixed_quantity,
      quantity_per_job,
      quantity_per_sqft,
      notes,
    } = body;

    if (!service_id || !product_id) {
      return Response.json({ error: 'service_id and product_id are required' }, { status: 400 });
    }

    // Verify service belongs to user
    const detailerId = user.detailer_id || user.id;
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

    // Build row with every supported column populated. The column-stripping
    // retry below silently drops fields that don't exist on this deploy.
    let row = {
      service_id,
      product_id,
      quantity_per_hour: parseFloat(quantity_per_hour) || 0,
      fixed_quantity: parseFloat(fixed_quantity) || 0,
      quantity_per_job: parseFloat(quantity_per_job) || 0,
      quantity_per_sqft: parseFloat(quantity_per_sqft) || 0,
      notes: notes || '',
    };

    // Check for an existing link first — manual upsert avoids relying on a
    // unique constraint that may or may not exist on every Supabase deploy
    // ("no constraint matching the ON CONFLICT specification" was almost
    // certainly the silent failure).
    const { data: existing } = await supabase
      .from('service_products')
      .select('id')
      .eq('service_id', service_id)
      .eq('product_id', product_id)
      .maybeSingle();

    let link = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const q = existing
        ? supabase.from('service_products').update(row).eq('id', existing.id)
        : supabase.from('service_products').insert(row);
      const { data, error } = await q
        .select('*, products(id, name, category, unit, cost_per_unit, image_url)')
        .single();
      if (!error) { link = data; lastErr = null; break; }
      lastErr = error;
      const colMatch =
        error.message?.match(/column "([^"]+)" of relation "service_products" does not exist/) ||
        error.message?.match(/Could not find the '([^']+)' column of 'service_products'/);
      if (colMatch && row[colMatch[1]] !== undefined) {
        delete row[colMatch[1]];
        continue;
      }
      break;
    }

    if (lastErr) {
      console.error('[service-products POST] insert/update failed:', lastErr.message, 'row keys:', Object.keys(row));
      return Response.json({ error: lastErr.message }, { status: 500 });
    }

    return Response.json({ link }, { status: existing ? 200 : 201 });
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

    const body = await request.json();
    const {
      id,
      quantity_per_hour,
      fixed_quantity,
      quantity_per_job,
      quantity_per_sqft,
      notes,
    } = body;

    if (!id) return Response.json({ error: 'Link ID required' }, { status: 400 });

    // Verify ownership through service
    const detailerId = user.detailer_id || user.id;
    const { data: existing } = await supabase
      .from('service_products')
      .select('id, services!inner(detailer_id)')
      .eq('id', id)
      .eq('services.detailer_id', detailerId)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const updates = {};
    if (quantity_per_hour !== undefined) updates.quantity_per_hour = parseFloat(quantity_per_hour) || 0;
    if (fixed_quantity !== undefined) updates.fixed_quantity = parseFloat(fixed_quantity) || 0;
    if (quantity_per_job !== undefined) updates.quantity_per_job = parseFloat(quantity_per_job) || 0;
    if (quantity_per_sqft !== undefined) updates.quantity_per_sqft = parseFloat(quantity_per_sqft) || 0;
    if (notes !== undefined) updates.notes = notes;
    if (body.is_default !== undefined) {
      updates.is_default = !!body.is_default;
      // If setting as default, unset other defaults for this service
      if (body.is_default && body.service_id) {
        await supabase.from('service_products').update({ is_default: false }).eq('service_id', body.service_id).neq('id', id);
      }
    }

    // Column-stripping retry — if quantity_per_job / quantity_per_sqft
    // haven't been migrated on this deploy yet, silently drop and continue.
    let link = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await supabase
        .from('service_products')
        .update(updates)
        .eq('id', id)
        .select('*, products(id, name, category, unit, cost_per_unit, image_url)')
        .single();
      if (!error) { link = data; lastErr = null; break; }
      lastErr = error;
      const colMatch =
        error.message?.match(/column "([^"]+)" of relation "service_products" does not exist/) ||
        error.message?.match(/Could not find the '([^']+)' column of 'service_products'/);
      if (colMatch && updates[colMatch[1]] !== undefined) {
        delete updates[colMatch[1]];
        continue;
      }
      break;
    }

    if (lastErr) {
      console.error('[service-products PUT] update failed:', lastErr.message, 'updates:', Object.keys(updates));
      return Response.json({ error: lastErr.message }, { status: 500 });
    }

    return Response.json({ link });
  } catch (err) {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: 'Link ID required' }, { status: 400 });

    // Verify ownership
    const { data: existing } = await supabase
      .from('service_products')
      .select('id, services!inner(detailer_id)')
      .eq('id', id)
      .eq('services.detailer_id', user.id)
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
