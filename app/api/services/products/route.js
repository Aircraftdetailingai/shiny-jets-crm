import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getUser(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token')?.value;
    if (authCookie) {
      const user = await verifyToken(authCookie);
      if (user) return user;
    }
  } catch (e) {}
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }
  return null;
}

// GET - Get linked products for a service (or all services)
export async function GET(request) {
  try {
    const user = await getUser(request);
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
export async function POST(request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const { service_id, product_id, quantity_per_hour, fixed_quantity, notes } = body;

    if (!service_id || !product_id) {
      return Response.json({ error: 'service_id and product_id are required' }, { status: 400 });
    }

    // Verify service belongs to user
    const { data: svc } = await supabase
      .from('services')
      .select('id')
      .eq('id', service_id)
      .eq('detailer_id', user.id)
      .single();

    if (!svc) return Response.json({ error: 'Service not found' }, { status: 404 });

    const row = {
      service_id,
      product_id,
      quantity_per_hour: parseFloat(quantity_per_hour) || 0,
      fixed_quantity: parseFloat(fixed_quantity) || 0,
      notes: notes || '',
    };

    const { data: link, error } = await supabase
      .from('service_products')
      .upsert(row, { onConflict: 'service_id,product_id' })
      .select('*, products(id, name, category, unit, cost_per_unit, image_url)')
      .single();

    if (error) {
      console.error('Failed to link product:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ link }, { status: 201 });
  } catch (err) {
    console.error('Service products POST error:', err);
    return Response.json({ error: 'Failed to link product' }, { status: 500 });
  }
}

// PUT - Update a product link
export async function PUT(request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const { id, quantity_per_hour, fixed_quantity, notes } = body;

    if (!id) return Response.json({ error: 'Link ID required' }, { status: 400 });

    // Verify ownership through service
    const { data: existing } = await supabase
      .from('service_products')
      .select('id, services!inner(detailer_id)')
      .eq('id', id)
      .eq('services.detailer_id', user.id)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const updates = {};
    if (quantity_per_hour !== undefined) updates.quantity_per_hour = parseFloat(quantity_per_hour) || 0;
    if (fixed_quantity !== undefined) updates.fixed_quantity = parseFloat(fixed_quantity) || 0;
    if (notes !== undefined) updates.notes = notes;
    if (body.is_default !== undefined) {
      updates.is_default = !!body.is_default;
      // If setting as default, unset other defaults for this service
      if (body.is_default && body.service_id) {
        await supabase.from('service_products').update({ is_default: false }).eq('service_id', body.service_id).neq('id', id);
      }
    }

    const { data: link, error } = await supabase
      .from('service_products')
      .update(updates)
      .eq('id', id)
      .select('*, products(id, name, category, unit, cost_per_unit, image_url)')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ link });
  } catch (err) {
    return Response.json({ error: 'Failed to update link' }, { status: 500 });
  }
}

// DELETE - Remove a product link
export async function DELETE(request) {
  try {
    const user = await getUser(request);
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
