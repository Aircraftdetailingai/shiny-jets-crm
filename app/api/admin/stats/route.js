import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

export async function GET(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch all detailers
    const { data: detailers } = await supabase
      .from('detailers')
      .select('id, email, name, company, plan, status, total_points, lifetime_points, created_at, last_login_at')
      .order('created_at', { ascending: false });

    const allDetailers = detailers || [];

    // Key metrics
    const totalDetailers = allDetailers.length;
    const activeDetailers = allDetailers.filter(d => {
      if (!d.last_login_at) return false;
      return new Date(d.last_login_at) > new Date(thirtyDaysAgo);
    }).length;

    // Subscription breakdown
    const planCounts = { free: 0, pro: 0, business: 0, enterprise: 0 };
    allDetailers.forEach(d => {
      const plan = (d.plan || 'free').toLowerCase();
      if (planCounts[plan] !== undefined) planCounts[plan]++;
      else planCounts.free++;
    });

    // MRR calculation
    const PLAN_PRICES = { free: 0, pro: 79, business: 149, enterprise: 499 };
    const mrr = Object.entries(planCounts).reduce((sum, [plan, count]) => {
      return sum + (PLAN_PRICES[plan] || 0) * count;
    }, 0);

    // Points stats
    const totalPointsIssued = allDetailers.reduce((sum, d) => sum + (d.lifetime_points || 0), 0);
    const totalPointsOutstanding = allDetailers.reduce((sum, d) => sum + (d.total_points || 0), 0);
    const totalPointsRedeemed = totalPointsIssued - totalPointsOutstanding;
    const avgPoints = totalDetailers > 0 ? Math.round(totalPointsOutstanding / totalDetailers) : 0;

    // Recent signups (last 30 days)
    const recentSignups = allDetailers.filter(d => new Date(d.created_at) > new Date(thirtyDaysAgo));

    // Signups by day (last 30 days)
    const signupsByDay = {};
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now - i * 86400000);
      const key = date.toISOString().split('T')[0];
      signupsByDay[key] = 0;
    }
    recentSignups.forEach(d => {
      const key = new Date(d.created_at).toISOString().split('T')[0];
      if (signupsByDay[key] !== undefined) signupsByDay[key]++;
    });

    // Recent quotes
    const { data: recentQuotes } = await supabase
      .from('quotes')
      .select('id, client_name, aircraft_model, total_price, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    // Recent redemptions
    const { data: recentRedemptions } = await supabase
      .from('reward_redemptions')
      .select('id, detailer_id, reward_name, points_spent, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    // Platform fees this month (from quotes with status = paid)
    const { data: paidQuotes } = await supabase
      .from('quotes')
      .select('total_price, platform_fee, detailer_id')
      .gte('created_at', monthStart)
      .in('status', ['paid', 'accepted']);

    const platformFeesMonth = (paidQuotes || []).reduce((sum, q) => sum + (q.platform_fee || 0), 0);

    // Revenue by day (last 30 days)
    const { data: monthQuotes } = await supabase
      .from('quotes')
      .select('total_price, created_at, status')
      .gte('created_at', thirtyDaysAgo)
      .in('status', ['paid', 'accepted']);

    const revenueByDay = {};
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now - i * 86400000);
      const key = date.toISOString().split('T')[0];
      revenueByDay[key] = 0;
    }
    (monthQuotes || []).forEach(q => {
      const key = new Date(q.created_at).toISOString().split('T')[0];
      if (revenueByDay[key] !== undefined) revenueByDay[key] += (q.total_price || 0);
    });

    return Response.json({
      metrics: {
        totalDetailers,
        activeDetailers,
        mrr,
        platformFeesMonth,
      },
      planCounts,
      points: {
        issued: totalPointsIssued,
        redeemed: totalPointsRedeemed,
        outstanding: totalPointsOutstanding,
        avgPerUser: avgPoints,
      },
      recentSignups: recentSignups.slice(0, 10),
      recentQuotes: recentQuotes || [],
      recentRedemptions: recentRedemptions || [],
      signupsByDay,
      revenueByDay,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
