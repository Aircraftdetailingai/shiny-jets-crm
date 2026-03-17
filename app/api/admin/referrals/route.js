import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.is_admin) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = getSupabase();

  // Get all referrals
  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referrer_id, referred_id, referral_code, status, created_at, completed_at')
    .order('created_at', { ascending: false });

  const allReferrals = referrals || [];

  // Get unique detailer IDs for enrichment
  const detailerIds = [...new Set([
    ...allReferrals.map(r => r.referrer_id),
    ...allReferrals.map(r => r.referred_id),
  ].filter(Boolean))];

  let detailersMap = {};
  if (detailerIds.length > 0) {
    const { data: detailers } = await supabase
      .from('detailers')
      .select('id, name, company, email, plan, country, created_at')
      .in('id', detailerIds);
    if (detailers) {
      detailers.forEach(d => { detailersMap[d.id] = d; });
    }
  }

  // Calculate top referrers
  const referrerCounts = {};
  allReferrals.forEach(r => {
    if (!referrerCounts[r.referrer_id]) {
      referrerCounts[r.referrer_id] = { total: 0, rewarded: 0 };
    }
    referrerCounts[r.referrer_id].total++;
    if (r.status === 'rewarded' || r.status === 'completed') {
      referrerCounts[r.referrer_id].rewarded++;
    }
  });

  const topReferrers = Object.entries(referrerCounts)
    .map(([id, counts]) => ({
      id,
      name: detailersMap[id]?.name || 'Unknown',
      company: detailersMap[id]?.company || '',
      email: detailersMap[id]?.email || '',
      plan: detailersMap[id]?.plan || 'free',
      total: counts.total,
      rewarded: counts.rewarded,
      conversion_rate: counts.total > 0 ? Math.round((counts.rewarded / counts.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // This month's stats
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthReferrals = allReferrals.filter(r => r.created_at >= firstOfMonth);
  const thisMonthRewarded = thisMonthReferrals.filter(r => r.status === 'rewarded' || r.status === 'completed');

  // Overall stats
  const totalAll = allReferrals.length;
  const totalRewarded = allReferrals.filter(r => r.status === 'rewarded' || r.status === 'completed').length;
  const totalPending = allReferrals.filter(r => r.status === 'pending').length;

  // Recent referrals (last 50) enriched
  const recentReferrals = allReferrals.slice(0, 50).map(r => ({
    id: r.id,
    referrer: detailersMap[r.referrer_id] ? {
      name: detailersMap[r.referrer_id].name,
      company: detailersMap[r.referrer_id].company,
      email: detailersMap[r.referrer_id].email,
    } : null,
    referred: detailersMap[r.referred_id] ? {
      name: detailersMap[r.referred_id].name,
      company: detailersMap[r.referred_id].company,
      email: detailersMap[r.referred_id].email,
    } : null,
    status: r.status,
    created_at: r.created_at,
    completed_at: r.completed_at,
  }));

  return Response.json({
    stats: {
      total: totalAll,
      rewarded: totalRewarded,
      pending: totalPending,
      conversion_rate: totalAll > 0 ? Math.round((totalRewarded / totalAll) * 100) : 0,
      this_month: thisMonthReferrals.length,
      this_month_rewarded: thisMonthRewarded.length,
    },
    top_referrers: topReferrers,
    recent_referrals: recentReferrals,
  });
}
