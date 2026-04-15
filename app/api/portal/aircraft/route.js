import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const { data } = await supabase.from('customer_aircraft').select('*').eq('customer_account_id', user.customer_id).order('created_at');
  return Response.json({ aircraft: data || [] });
}

export async function POST(request) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.tail_number) return Response.json({ error: 'Tail number required' }, { status: 400 });

  const supabase = getSupabase();

  let entry = {
    customer_account_id: user.customer_id,
    tail_number: body.tail_number.toUpperCase().trim(),
    manufacturer: body.manufacturer || null,
    model: body.model || null,
    year: body.year ? parseInt(body.year) : null,
    nickname: body.nickname || null,
    engine_type: body.engine_type || null,
    storage_type: body.storage_type || null,
    storage_location: body.storage_location || null,
    home_airport: body.home_airport || null,
    notes: body.notes || null,
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from('customer_aircraft').insert(entry).select().single();
    if (!error) return Response.json({ aircraft: data }, { status: 201 });
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) { delete entry[colMatch[1]]; continue; }
    if (error.message?.includes('duplicate') || error.code === '23505') {
      return Response.json({ error: 'Aircraft already added' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ error: 'Failed to add aircraft' }, { status: 500 });
}

export async function DELETE(request) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const supabase = getSupabase();
  await supabase.from('customer_aircraft').delete().eq('id', id).eq('customer_account_id', user.customer_id);
  return Response.json({ success: true });
}
