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
    .select('id, name, company, country, home_airport, airports_served, preferred_currency, plan, stripe_account_id, stripe_publishable_key, has_online_booking, logo_url, theme_logo_url, directory_description, certifications, slug, verified_finish, insurance_verified')
    .eq('listed_in_directory', true)
    .eq('status', 'active');

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

  // Attach public review stats (platform + Google)
  const detailerIds = (data || []).map(d => d.id);
  let enriched = data || [];

  if (detailerIds.length > 0) {
    const [vectorResult, googleResult] = await Promise.all([
      supabase.from('feedback').select('detailer_id, rating').in('detailer_id', detailerIds).eq('is_public', true),
      supabase.from('google_reviews').select('detailer_id, rating').in('detailer_id', detailerIds),
    ]);

    const statsMap = {};
    for (const r of (vectorResult.data || [])) {
      if (!statsMap[r.detailer_id]) statsMap[r.detailer_id] = { vectorTotal: 0, vectorSum: 0, googleTotal: 0, googleSum: 0 };
      statsMap[r.detailer_id].vectorTotal++;
      statsMap[r.detailer_id].vectorSum += r.rating;
    }
    for (const r of (googleResult.data || [])) {
      if (!statsMap[r.detailer_id]) statsMap[r.detailer_id] = { vectorTotal: 0, vectorSum: 0, googleTotal: 0, googleSum: 0 };
      statsMap[r.detailer_id].googleTotal++;
      statsMap[r.detailer_id].googleSum += r.rating;
    }

    enriched = (data || []).map(d => {
      const s = statsMap[d.id];
      if (!s) return { ...d, review_count: 0, avg_rating: null, google_review_count: 0, google_avg_rating: null };
      const totalCount = s.vectorTotal + s.googleTotal;
      const combinedAvg = totalCount > 0 ? parseFloat(((s.vectorSum + s.googleSum) / totalCount).toFixed(1)) : null;
      return {
        ...d,
        review_count: s.vectorTotal,
        avg_rating: s.vectorTotal > 0 ? parseFloat((s.vectorSum / s.vectorTotal).toFixed(1)) : null,
        google_review_count: s.googleTotal,
        google_avg_rating: s.googleTotal > 0 ? parseFloat((s.googleSum / s.googleTotal).toFixed(1)) : null,
        combined_review_count: totalCount,
        combined_avg_rating: combinedAvg,
      };
    });
  }

  // Bulk-fetch services for all detailers in this batch
  let servicesByDetailer = {};
  if (detailerIds.length > 0) {
    const { data: svcRows } = await supabase
      .from('services')
      .select('detailer_id, name')
      .in('detailer_id', detailerIds);
    if (svcRows) {
      for (const r of svcRows) {
        if (!servicesByDetailer[r.detailer_id]) servicesByDetailer[r.detailer_id] = [];
        if (r.name) servicesByDetailer[r.detailer_id].push(r.name);
      }
    }
  }

  // Add online booking badge based on Stripe connection
  enriched = enriched.map(d => ({
    ...d,
    online_booking: !!(d.stripe_account_id || d.stripe_publishable_key || d.has_online_booking),
    // Prefer theme_logo_url, fall back to logo_url
    logo_url: d.theme_logo_url || d.logo_url || null,
    // Attach services list
    services: servicesByDetailer[d.id] || [],
    // Remove sensitive/internal fields from response
    stripe_account_id: undefined,
    stripe_publishable_key: undefined,
    theme_logo_url: undefined,
  }));

  return Response.json({ detailers: enriched }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
