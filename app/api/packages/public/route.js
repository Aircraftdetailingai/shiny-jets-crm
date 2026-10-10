import { createClient } from '@supabase/supabase-js';
import { publicPackageShape } from '@/lib/applicability';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Public GET — returns detailer's packages by detailer_id (no auth required)
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

  let { data, error } = await supabase
    .from('packages')
    .select('id, name, description, service_ids, requires_brightwork, requires_deice_boots, allowed_categories')
    .eq('detailer_id', detailerId)
    .order('created_at', { ascending: true });
  if (error && /column/i.test(error.message || '')) {
    const retry = await supabase
      .from('packages')
      .select('id, name, description, service_ids')
      .eq('detailer_id', detailerId)
      .order('created_at', { ascending: true });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Resolve service_ids to names for fallback descriptions
  const allServiceIds = (data || []).flatMap(p => p.service_ids || []);
  let serviceMap = {};
  if (allServiceIds.length > 0) {
    const { data: svcs } = await supabase
      .from('services')
      .select('id, name')
      .in('id', allServiceIds);
    if (svcs) serviceMap = Object.fromEntries(svcs.map(s => [s.id, s.name]));
  }

  const packages = (data || []).map(p => publicPackageShape(
    p,
    (p.service_ids || []).map(id => serviceMap[id]).filter(Boolean),
  ));

  return Response.json({ packages });
}
