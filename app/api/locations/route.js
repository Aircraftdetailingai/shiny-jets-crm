import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - List all locations for detailer
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await supabase
    .from('detailer_locations')
    .select('*')
    .eq('detailer_id', user.id)
    .order('created_at', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ locations: data || [] });
}

// POST - Create a new location
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const body = await request.json();
  const { name, location_type, airport_icao, address, notes } = body;

  if (!name) return Response.json({ error: 'Name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('detailer_locations')
    .insert({
      detailer_id: user.id,
      name,
      location_type: location_type || 'other',
      airport_icao: airport_icao || null,
      address: address || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ location: data }, { status: 201 });
}

// PUT - Update a location
export async function PUT(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const body = await request.json();
  const { id, name, location_type, airport_icao, address, notes, active } = body;

  if (!id) return Response.json({ error: 'Location ID required' }, { status: 400 });

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (location_type !== undefined) updates.location_type = location_type;
  if (airport_icao !== undefined) updates.airport_icao = airport_icao || null;
  if (address !== undefined) updates.address = address || null;
  if (notes !== undefined) updates.notes = notes || null;
  if (active !== undefined) updates.active = active;

  const { data, error } = await supabase
    .from('detailer_locations')
    .update(updates)
    .eq('id', id)
    .eq('detailer_id', user.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ location: data });
}

// DELETE - Remove a location
export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return Response.json({ error: 'Location ID required' }, { status: 400 });

  // Unlink products and equipment first
  await supabase.from('products').update({ location_id: null }).eq('location_id', id);
  await supabase.from('equipment').update({ location_id: null }).eq('location_id', id);

  const { error } = await supabase
    .from('detailer_locations')
    .delete()
    .eq('id', id)
    .eq('detailer_id', user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
