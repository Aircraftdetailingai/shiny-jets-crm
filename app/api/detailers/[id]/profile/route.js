import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request, { params }) {
  const { id } = params;
  const supabase = getSupabase();

  const { data: detailer, error } = await supabase
    .from('detailers')
    .select('id, name, company, country, home_airport, plan, theme_logo_url, logo_url')
    .eq('id', id)
    .eq('listed_in_directory', true)
    .eq('status', 'active')
    .in('plan', ['pro', 'business', 'enterprise'])
    .single();

  if (error || !detailer) {
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  // Public reviews (last 3)
  const { data: reviews } = await supabase
    .from('feedback')
    .select('id, rating, comment, customer_name, created_at')
    .eq('detailer_id', id)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(3);

  // Aggregate stats
  const { data: allPublic } = await supabase
    .from('feedback')
    .select('rating')
    .eq('detailer_id', id)
    .eq('is_public', true);

  const total = (allPublic || []).length;
  const avgRating = total > 0
    ? parseFloat((allPublic.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1))
    : 0;

  return Response.json({
    detailer: {
      id: detailer.id,
      name: detailer.name,
      company: detailer.company,
      country: detailer.country,
      homeAirport: detailer.home_airport,
      logoUrl: detailer.theme_logo_url || detailer.logo_url || null,
    },
    reviews: (reviews || []).map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customer_name,
      createdAt: r.created_at,
    })),
    stats: { total, avgRating },
  });
}
