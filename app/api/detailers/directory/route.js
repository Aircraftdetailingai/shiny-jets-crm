import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country') || '';
  const airport = searchParams.get('airport') || '';
  const search = searchParams.get('search') || '';

  let query = supabase
    .from('detailers')
    .select('id, name, company, country, home_airport, preferred_currency, plan')
    .eq('listed_in_directory', true)
    .eq('status', 'active')
    .in('plan', ['pro', 'business', 'enterprise']);

  if (country) {
    query = query.eq('country', country.toUpperCase());
  }

  if (airport) {
    query = query.ilike('home_airport', `%${airport.toUpperCase()}%`);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%`);
  }

  query = query.order('company', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Directory query error:', error);
    return Response.json({ error: 'Failed to fetch directory' }, { status: 500 });
  }

  // Attach public review stats
  const detailerIds = (data || []).map(d => d.id);
  let enriched = data || [];

  if (detailerIds.length > 0) {
    const { data: allReviews } = await supabase
      .from('feedback')
      .select('detailer_id, rating')
      .in('detailer_id', detailerIds)
      .eq('is_public', true);

    const statsMap = {};
    for (const r of (allReviews || [])) {
      if (!statsMap[r.detailer_id]) statsMap[r.detailer_id] = { total: 0, sum: 0 };
      statsMap[r.detailer_id].total++;
      statsMap[r.detailer_id].sum += r.rating;
    }

    enriched = (data || []).map(d => ({
      ...d,
      review_count: statsMap[d.id]?.total || 0,
      avg_rating: statsMap[d.id] ? parseFloat((statsMap[d.id].sum / statsMap[d.id].total).toFixed(1)) : null,
    }));
  }

  return Response.json({ detailers: enriched });
}
