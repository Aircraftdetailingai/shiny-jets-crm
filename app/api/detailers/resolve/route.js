import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Resolve a detailer by UUID, slug column, or company-name slug
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const identifier = searchParams.get('id');

  if (!identifier) {
    return Response.json({ error: 'id parameter required' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const fields = 'id, company, name, logo_url, plan';

  // 1. Try UUID match
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  if (isUUID) {
    const { data } = await supabase.from('detailers').select(fields).eq('id', identifier).single();
    if (data) return Response.json({ detailer: data });
  }

  // 2. Try slug column (may not exist yet)
  try {
    const { data } = await supabase.from('detailers').select(fields).eq('slug', identifier).single();
    if (data) return Response.json({ detailer: data });
  } catch {}

  // 3. Fuzzy match on company name: normalize slug back to company name
  // e.g., "vector-aviation" → match "Vector Aviation"
  const normalized = identifier.replace(/-/g, ' ');
  const { data: matches } = await supabase
    .from('detailers')
    .select(fields)
    .ilike('company', normalized);

  if (matches?.length === 1) {
    return Response.json({ detailer: matches[0] });
  }

  return Response.json({ error: 'Detailer not found' }, { status: 404 });
}
