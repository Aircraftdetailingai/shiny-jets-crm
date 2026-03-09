import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { TIER_MULTIPLIERS, TIER_CAN_REDEEM } from '@/lib/points';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Quick balance check with recent history preview
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: detailer } = await supabase
    .from('detailers')
    .select('points_balance, points_lifetime, plan, login_streak, last_daily_checkin')
    .eq('id', user.id)
    .single();

  // Last 5 entries for preview
  const { data: recent } = await supabase
    .from('points_ledger')
    .select('action, final_points, description, created_at')
    .eq('detailer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const tier = detailer?.plan || 'free';

  return Response.json({
    balance: detailer?.points_balance || 0,
    lifetime: detailer?.points_lifetime || 0,
    tier,
    multiplier: TIER_MULTIPLIERS[tier] || 1.0,
    canRedeem: TIER_CAN_REDEEM[tier] || false,
    loginStreak: detailer?.login_streak || 0,
    recentActivity: recent || [],
  });
}
