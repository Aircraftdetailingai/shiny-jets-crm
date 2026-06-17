import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// PUT - Update an add-on fee
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
    const { name, description, fee_type, amount, buffer_before, buffer_after, is_compound, sub_items } = body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (fee_type !== undefined) updates.fee_type = fee_type;
    if (amount !== undefined) updates.amount = parseFloat(amount) || 0;
    if (buffer_before !== undefined) updates.buffer_before = Math.max(0, parseInt(buffer_before, 10) || 0);
    if (buffer_after !== undefined) updates.buffer_after = Math.max(0, parseInt(buffer_after, 10) || 0);
    if (is_compound !== undefined) updates.is_compound = !!is_compound;
    if (sub_items !== undefined) updates.sub_items = Array.isArray(sub_items) ? sub_items : [];

    const { data: fee, error } = await supabase
      .from('addon_fees')
      .update(updates)
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update addon fee:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ fee });

  } catch (err) {
    console.error('Addon fee PUT error:', err);
    return Response.json({ error: 'Failed to update addon fee' }, { status: 500 });
  }
}

// DELETE - Delete an add-on fee
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
      .from('addon_fees')
      .delete()
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id);

    if (error) {
      console.error('Failed to delete addon fee:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Addon fee DELETE error:', err);
    return Response.json({ error: 'Failed to delete addon fee' }, { status: 500 });
  }
}
