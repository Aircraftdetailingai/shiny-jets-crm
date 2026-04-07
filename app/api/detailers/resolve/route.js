import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const FIELDS = 'id, company, name, logo_url, plan';

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

  // 1. UUID match
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  if (isUUID) {
    const { data } = await supabase.from('detailers').select(FIELDS).eq('id', identifier).single();
    if (data) return Response.json({ detailer: data });
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  // 2. Try slug column (may not exist yet — gracefully handle column-not-found)
  const { data: slugData, error: slugErr } = await supabase
    .from('detailers').select(FIELDS).eq('slug', identifier).single();
  if (!slugErr && slugData) {
    return Response.json({ detailer: slugData });
  }

  // 3. Company name match: "shiny-jets" → "shiny jets" → ilike "Shiny Jets"
  const normalized = identifier.replace(/-/g, ' ');
  const { data: matches } = await supabase
    .from('detailers')
    .select(FIELDS)
    .ilike('company', normalized);

  if (matches?.length === 1) {
    return Response.json({ detailer: matches[0] });
  }

  // Multiple matches on company name — try to disambiguate:
  // Prefer the one with an intake flow configured (actively using the system)
  if (matches?.length > 1) {
    for (const m of matches) {
      const { data: flow } = await supabase
        .from('intake_flows')
        .select('detailer_id')
        .eq('detailer_id', m.id)
        .single();
      if (flow) return Response.json({ detailer: m });
    }
    // Still ambiguous — return the first match as best effort
    return Response.json({ detailer: matches[0] });
  }

  // 4. Wildcard match: try %slug%
  const { data: wildcard } = await supabase
    .from('detailers')
    .select(FIELDS)
    .ilike('company', `%${normalized}%`)
    .limit(1);

  if (wildcard?.length === 1) {
    return Response.json({ detailer: wildcard[0] });
  }

  return Response.json({ error: 'Detailer not found' }, { status: 404 });
}
