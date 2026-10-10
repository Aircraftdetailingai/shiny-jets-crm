import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const detailerId = await resolveDetailerId(supabase, user);
  const body = await request.json();
  const name = String(body.product_name || '').trim();
  if (!body.service_id || !name || (!body.aircraft_id && !body.custom_aircraft_id)) {
    return Response.json({ error: 'service_id, product_name, and a model id are required' }, { status: 400 });
  }
  const qty = body.quantity == null || body.quantity === '' ? null : parseFloat(body.quantity);
  const row = {
    detailer_id: detailerId,
    aircraft_id: body.custom_aircraft_id ? null : body.aircraft_id,
    custom_aircraft_id: body.custom_aircraft_id || null,
    service_id: body.service_id,
    product_id: body.product_id || null,
    product_name: name,
    quantity: Number.isFinite(qty) ? qty : null,
    unit: body.unit || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('model_service_usage').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ usage: data }, { status: 201 });
}

export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const detailerId = await resolveDetailerId(supabase, user);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
  const { error } = await supabase.from('model_service_usage').delete().eq('id', id).eq('detailer_id', detailerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
