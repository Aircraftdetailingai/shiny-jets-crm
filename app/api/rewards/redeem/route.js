import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { canRedeem, meetsMinTier } from '@/lib/points';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// POST - Redeem a reward
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { rewardId, shippingAddress } = await request.json();

  if (!rewardId) {
    return Response.json({ error: 'rewardId is required' }, { status: 400 });
  }

  // Get reward details
  const { data: reward, error: rewardErr } = await supabase
    .from('reward_inventory')
    .select('*')
    .eq('id', rewardId)
    .eq('active', true)
    .single();

  if (rewardErr || !reward) {
    return Response.json({ error: 'Reward not found' }, { status: 404 });
  }

  // Get detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('points_balance, plan, email, company')
    .eq('id', user.id)
    .single();

  if (!detailer) {
    return Response.json({ error: 'Account not found' }, { status: 404 });
  }

  const tier = detailer.plan || 'free';

  // Check tier eligibility
  if (!canRedeem(tier)) {
    return Response.json({ error: 'Free tier cannot redeem rewards. Upgrade to Pro or higher.' }, { status: 403 });
  }

  if (!meetsMinTier(tier, reward.min_tier || 'free')) {
    return Response.json({ error: `This reward requires ${reward.min_tier} tier or higher` }, { status: 403 });
  }

  // Check points
  if (detailer.points_balance < reward.points_cost) {
    return Response.json({
      error: 'Not enough points',
      required: reward.points_cost,
      available: detailer.points_balance,
    }, { status: 400 });
  }

  // Check stock
  if (reward.quantity_available !== null && reward.quantity_available <= reward.quantity_redeemed) {
    return Response.json({ error: 'This reward is out of stock' }, { status: 400 });
  }

  // Create redemption
  const { data: redemption, error: redemptionErr } = await supabase
    .from('reward_redemptions')
    .insert({
      detailer_id: user.id,
      reward_id: reward.id,
      points_spent: reward.points_cost,
      status: 'pending',
      shipping_address: shippingAddress || null,
    })
    .select()
    .single();

  if (redemptionErr) {
    console.error('Redemption error:', redemptionErr);
    return Response.json({ error: redemptionErr.message }, { status: 500 });
  }

  // Deduct points from balance
  const newBalance = detailer.points_balance - reward.points_cost;
  await supabase
    .from('detailers')
    .update({ points_balance: newBalance })
    .eq('id', user.id);

  // Log negative entry in points_ledger
  await supabase
    .from('points_ledger')
    .insert({
      detailer_id: user.id,
      action: 'REDEEM_REWARD',
      base_points: -reward.points_cost,
      multiplier: 1.0,
      final_points: -reward.points_cost,
      description: `Redeemed: ${reward.name}`,
      metadata: { reward_id: reward.id, redemption_id: redemption.id },
    });

  // Increment quantity_redeemed
  await supabase
    .from('reward_inventory')
    .update({ quantity_redeemed: (reward.quantity_redeemed || 0) + 1 })
    .eq('id', reward.id);

  return Response.json({
    success: true,
    redemption,
    newBalance,
    reward: { id: reward.id, name: reward.name },
  });
}
