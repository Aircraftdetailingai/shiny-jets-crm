import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { meetsMinTier, canRedeem, TIER_MULTIPLIERS } from '@/lib/points';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get available rewards for user's tier
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  // Get detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('points_balance, points_lifetime, plan')
    .eq('id', user.id)
    .single();

  const tier = detailer?.plan || 'free';

  // Get active rewards from inventory
  const { data: rewards, error: rewardsError } = await supabase
    .from('reward_inventory')
    .select('*')
    .eq('active', true)
    .order('points_cost', { ascending: true });

  if (rewardsError) {
    // Table might not exist yet - return empty
    if (rewardsError.code === '42P01') {
      return Response.json({ rewards: [], points: { available: 0, lifetime: 0 }, redemptions: [] });
    }
    return Response.json({ error: rewardsError.message }, { status: 500 });
  }

  // Filter by tier eligibility and mark affordability
  const available = (rewards || []).map(r => ({
    ...r,
    eligible: meetsMinTier(tier, r.min_tier || 'free'),
    affordable: (detailer?.points_balance || 0) >= r.points_cost,
    in_stock: r.quantity_available === null || r.quantity_available > r.quantity_redeemed,
  }));

  // Get user's redemption history
  const { data: redemptions } = await supabase
    .from('reward_redemptions')
    .select('*')
    .eq('detailer_id', user.id)
    .order('created_at', { ascending: false });

  return Response.json({
    rewards: available,
    points: {
      available: detailer?.points_balance || 0,
      lifetime: detailer?.points_lifetime || 0,
    },
    tier,
    canRedeem: canRedeem(tier),
    multiplier: TIER_MULTIPLIERS[tier] || 1.0,
    redemptions: redemptions || [],
  });
}
