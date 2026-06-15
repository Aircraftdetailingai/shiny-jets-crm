import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return null;
  if (!ADMIN_EMAILS.includes(user.email?.toLowerCase())) return null;
  return user;
}

// GET — anonymous, network-wide airport revenue analytics (admin only).
// Every number here is an aggregate across the whole network; no individual
// detailer or customer is identifiable. The per-airport leaderboard applies a
// k-anonymity guard (min 3 quotes per airport) in the underlying view.
export async function GET(request) {
  const user = await isAdmin(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

  const views = {
    byClass:     'v_network_by_airport_class',
    byType:      'v_network_by_airport_type',
    byRunway:    'v_network_by_runway_bucket',
    byMro:       'v_network_by_mro_bucket',
    leaderboard: 'v_network_airport_leaderboard',
  };

  const out = {};
  for (const [key, view] of Object.entries(views)) {
    const { data, error } = await supabase.from(view).select('*');
    if (error) {
      console.error(`[airport-analytics] ${view} error:`, error.message);
      return Response.json({ error: `Failed to load ${key}` }, { status: 500 });
    }
    out[key] = data || [];
  }

  // Sort dimensional breakdowns by value for nicer display.
  out.byClass.sort((a, b) => (b.avg_value || 0) - (a.avg_value || 0));
  out.byType.sort((a, b) => (b.avg_value || 0) - (a.avg_value || 0));
  out.byRunway.sort((a, b) => String(a.dimension).localeCompare(String(b.dimension)));

  // Coverage meta: how much airport data is enriched / how many quotes resolve.
  const [{ count: airportsLoaded }, { count: quotesResolved }] = await Promise.all([
    supabase.from('airports').select('icao', { count: 'exact', head: true }),
    supabase.from('v_network_quote_geo').select('id', { count: 'exact', head: true }),
  ]);
  const { count: mroEnriched } = await supabase
    .from('airports').select('icao', { count: 'exact', head: true })
    .not('mro_count', 'is', null);

  out.meta = {
    airportsLoaded: airportsLoaded || 0,
    quotesResolved: quotesResolved || 0,
    mroEnriched: mroEnriched || 0,
    generatedAt: new Date().toISOString(),
  };

  return Response.json(out);
}
