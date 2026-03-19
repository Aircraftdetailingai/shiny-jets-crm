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

// PUT - Update a service
export async function PUT(request, { params }) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { id } = params;
    const body = await request.json();
    const { name, description, hourly_rate, hours_field, product_cost_per_hour, product_notes, default_hours, category } = body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (hourly_rate !== undefined) updates.hourly_rate = parseFloat(hourly_rate) || 0;
    if (category !== undefined) updates.category = category;
    if (hours_field !== undefined) updates.hours_field = hours_field;
    if (default_hours !== undefined) updates.default_hours = default_hours === null ? null : parseFloat(default_hours);
    if (product_cost_per_hour !== undefined) updates.product_cost_per_hour = parseFloat(product_cost_per_hour) || 0;
    if (product_notes !== undefined) updates.product_notes = product_notes || '';
    updates.updated_at = new Date().toISOString();

    let { data: service, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
      .eq('detailer_id', user.id)
      .select()
      .single();

    // Column-stripping retry if default_hours or other new columns don't exist
    if (error && error.message?.includes('column')) {
      const retryUpdates = { ...updates };
      delete retryUpdates.default_hours;
      delete retryUpdates.product_cost_per_hour;
      delete retryUpdates.product_notes;
      const retry = await supabase
        .from('services')
        .update(retryUpdates)
        .eq('id', id)
        .eq('detailer_id', user.id)
        .select()
        .single();
      if (retry.error) {
        console.error('Failed to update service (retry):', retry.error);
        return Response.json({ error: retry.error.message }, { status: 500 });
      }
      // Attach the values we couldn't save so the client still sees them
      service = { ...retry.data };
      if (updates.default_hours !== undefined) service.default_hours = updates.default_hours;
      return Response.json({ service });
    }

    if (error) {
      console.error('Failed to update service:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ service });

  } catch (err) {
    console.error('Service PUT error:', err);
    return Response.json({ error: 'Failed to update service' }, { status: 500 });
  }
}

// DELETE - Delete a service
export async function DELETE(request, { params }) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { id } = params;

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id)
      .eq('detailer_id', user.id);

    if (error) {
      console.error('Failed to delete service:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Service DELETE error:', err);
    return Response.json({ error: 'Failed to delete service' }, { status: 500 });
  }
}
