import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

// GET - List all inventory items
export async function GET(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { data, error } = await supabase
      .from('reward_inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return Response.json({ items: [], needsMigration: true });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Get redemption counts per reward
    const { data: redemptions } = await supabase
      .from('reward_redemptions')
      .select('reward_id');

    const redemptionCounts = {};
    (redemptions || []).forEach(r => {
      redemptionCounts[r.reward_id] = (redemptionCounts[r.reward_id] || 0) + 1;
    });

    const items = (data || []).map(item => ({
      ...item,
      redeemed_count: redemptionCounts[item.id] || 0,
    }));

    return Response.json({ items });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Create new inventory item
export async function POST(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const body = await request.json();
    const row = {
      name: body.name,
      description: body.description || '',
      image_url: body.image_url || null,
      points_cost: parseInt(body.points_cost) || 0,
      quantity_available: parseInt(body.quantity_available) || 0,
      category: body.category || 'supplies',
      min_tier: body.min_tier || 'pro',
      reward_type: body.reward_type || 'physical',
      reward_value: body.reward_value || '{}',
      active: body.active !== false,
      featured: body.featured || false,
    };

    // Column-stripping retry
    let data, error;
    ({ data, error } = await supabase.from('reward_inventory').insert(row).select().single());

    if (error && error.code === '42P01') {
      return Response.json({ error: 'reward_inventory table not found. Run migration first.' }, { status: 500 });
    }

    if (error && error.message?.includes('column')) {
      // Try without optional columns
      delete row.featured;
      delete row.image_url;
      ({ data, error } = await supabase.from('reward_inventory').insert(row).select().single());
    }

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ item: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// PUT - Update inventory item
export async function PUT(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return Response.json({ error: 'ID required' }, { status: 400 });

    if (updates.points_cost) updates.points_cost = parseInt(updates.points_cost);
    if (updates.quantity_available !== undefined) updates.quantity_available = parseInt(updates.quantity_available);

    let data, error;
    ({ data, error } = await supabase.from('reward_inventory').update(updates).eq('id', id).select().single());

    if (error && error.message?.includes('column')) {
      // Strip unknown columns and retry
      const safeUpdates = { ...updates };
      delete safeUpdates.featured;
      delete safeUpdates.image_url;
      ({ data, error } = await supabase.from('reward_inventory').update(safeUpdates).eq('id', id).select().single());
    }

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ item: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - Remove inventory item
export async function DELETE(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: 'ID required' }, { status: 400 });

    const { error } = await supabase.from('reward_inventory').delete().eq('id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
