import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  const { data: reviews, error } = await supabase
    .from('feedback')
    .select('id, rating, comment, customer_name, customer_email, is_public, created_at, quote_id, quotes(aircraft_model, aircraft_type)')
    .eq('detailer_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Reviews query error:', error);
    return Response.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }

  const total = (reviews || []).length;
  const avgRating = total > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1) : '0';
  const breakdown = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    percent: total > 0 ? Math.round((reviews.filter(r => r.rating === star).length / total) * 100) : 0,
  }));

  return Response.json({
    reviews: (reviews || []).map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customer_name,
      isPublic: r.is_public !== false,
      createdAt: r.created_at,
      aircraft: r.quotes?.aircraft_model || r.quotes?.aircraft_type || null,
    })),
    stats: { total, avgRating: parseFloat(avgRating), breakdown },
  });
}
