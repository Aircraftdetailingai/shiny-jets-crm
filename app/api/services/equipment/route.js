import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get linked equipment for a service (or all services)
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('service_id');

    let query = supabase
      .from('service_equipment')
      .select('*, equipment(id, name, brand, model, status, image_url), services!inner(detailer_id)')
      .eq('services.detailer_id', user.id);

    if (serviceId) {
      query = query.eq('service_id', serviceId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch service equipment:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const links = (data || []).map(({ services, ...rest }) => rest);

    return Response.json({ links });
  } catch (err) {
    console.error('Service equipment GET error:', err);
    return Response.json({ error: 'Failed to fetch service equipment' }, { status: 500 });
  }
}

// POST - Link equipment to a service
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const { service_id, equipment_id, notes } = body;

    if (!service_id || !equipment_id) {
      return Response.json({ error: 'service_id and equipment_id are required' }, { status: 400 });
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
      equipment_id,
      notes: notes || '',
    };

    const { data: link, error } = await supabase
      .from('service_equipment')
      .upsert(row, { onConflict: 'service_id,equipment_id' })
      .select('*, equipment(id, name, brand, model, status, image_url)')
      .single();

    if (error) {
      console.error('Failed to link equipment:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ link }, { status: 201 });
  } catch (err) {
    console.error('Service equipment POST error:', err);
    return Response.json({ error: 'Failed to link equipment' }, { status: 500 });
  }
}

// DELETE - Remove an equipment link
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
      .from('service_equipment')
      .select('id, services!inner(detailer_id)')
      .eq('id', id)
      .eq('services.detailer_id', user.id)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const { error } = await supabase
      .from('service_equipment')
      .delete()
      .eq('id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Failed to remove link' }, { status: 500 });
  }
}
