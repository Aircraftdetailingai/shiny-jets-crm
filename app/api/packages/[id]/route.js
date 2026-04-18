import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// PUT - Update a package
export async function PUT(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { id } = params;
    const body = await request.json();
    const { name, description, discount_percent, service_ids } = body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (discount_percent !== undefined) updates.discount_percent = parseFloat(discount_percent) || 0;
    if (service_ids !== undefined) updates.service_ids = service_ids;
    updates.updated_at = new Date().toISOString();

    let { data: pkg, error } = await supabase
      .from('packages')
      .update(updates)
      .eq('id', id)
      .eq('detailer_id', user.id)
      .select()
      .single();

    if (error && error.message?.includes('discount_percent')) {
      delete updates.discount_percent;
      const retry = await supabase.from('packages').update(updates).eq('id', id).eq('detailer_id', user.id).select().single();
      pkg = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Failed to update package:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ package: pkg });

  } catch (err) {
    console.error('Package PUT error:', err);
    return Response.json({ error: 'Failed to update package' }, { status: 500 });
  }
}

// DELETE - Delete a package
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { id } = params;

    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', id)
      .eq('detailer_id', user.id);

    if (error) {
      console.error('Failed to delete package:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Package DELETE error:', err);
    return Response.json({ error: 'Failed to delete package' }, { status: 500 });
  }
}
