import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveAircraftAttributes } from '@/lib/applicability';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Next.js wraps the global fetch with its Data Cache. supabase-js uses that
// wrapped fetch internally, so even `dynamic = 'force-dynamic'` + a cache-
// control: no-store response header can't prevent a cached Supabase response
// from being served inside the Function runtime (x-vercel-cache: MISS is
// misleading — the staleness is in the Function's own Data Cache, not the
// edge). Forcing { cache: 'no-store' } on supabase-js's internal fetch
// bypasses Next's Data Cache entirely. Without this, newly-inserted aircraft
// rows don't appear in the /models response until the next deploy warms a
// fresh Function instance — which is exactly what Brett hit today after 7
// new Gulfstream models were added.
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(request) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const manufacturer = searchParams.get('manufacturer') || searchParams.get('make');
  const category = searchParams.get('category');

  const columns = 'id, manufacturer, model, category, seats, surface_area_sqft, has_polished_brightwork, has_deice_boots, brightwork_hours';
  let query = supabase.from('aircraft').select(columns).order('model');

  if (manufacturer) query = query.eq('manufacturer', manufacturer);
  if (category) query = query.eq('category', category);

  let { data, error } = await query;
  if (error && /column/i.test(error.message || '')) {
    let fallback = supabase.from('aircraft').select('id, manufacturer, model, category, seats, surface_area_sqft').order('model');
    if (manufacturer) fallback = fallback.eq('manufacturer', manufacturer);
    if (category) fallback = fallback.eq('category', category);
    const retry = await fallback;
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch models' }), { status: 500 });
  }

  const toPublic = (m, custom) => {
    const attributes = resolveAircraftAttributes(m);
    return {
      id: m.id,
      manufacturer: m.manufacturer,
      model: m.model,
      category: m.category,
      seats: m.seats,
      surface_area_sqft: m.surface_area_sqft,
      custom,
      attributes,
      has_polished_brightwork: attributes.has_polished_brightwork,
      has_deice_boots: attributes.has_deice_boots,
    };
  };

  let models = (data || []).map(m => toPublic(m, false));

  // If authenticated, include custom aircraft models
  const user = await getAuthUser(request);
  if (user?.id) {
    let customQuery = supabase
      .from('custom_aircraft')
      .select('id, manufacturer, model, category')
      .eq('detailer_id', user.detailer_id || user.id)
      .order('model');

    if (manufacturer) customQuery = customQuery.eq('manufacturer', manufacturer);
    if (category) customQuery = customQuery.eq('category', category);

    const { data: customData } = await customQuery;

    if (customData) {
      models = [...models, ...customData.map(c => toPublic(c, true))];
    }
  }

  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
  });
}
