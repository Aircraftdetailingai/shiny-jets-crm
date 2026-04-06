import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Public GET — returns detailer's services by detailer_id (no auth required)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const detailerId = searchParams.get('detailer_id');

  if (!detailerId) {
    return Response.json({ error: 'detailer_id required' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, category')
    .eq('detailer_id', detailerId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ services: data || [] });
}
