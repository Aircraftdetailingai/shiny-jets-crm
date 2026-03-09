import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { POINTS_ACTIONS, calculatePoints, TIER_MULTIPLIERS } from '@/lib/points';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Actions that can only be earned once
const ONE_TIME_ACTIONS = [
  'COMPLETE_PROFILE',
  'UPGRADE_PLAN',
  'MILESTONE_10K',
  'MILESTONE_50K',
  'MILESTONE_100K',
];

// Actions with daily limits
const DAILY_ACTIONS = ['DAILY_LOGIN'];

// POST - Earn points for an action
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { action, metadata } = await request.json();

  // Validate action
  const config = POINTS_ACTIONS[action];
  if (!config) {
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Get detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('points_balance, points_lifetime, plan, login_streak, last_daily_checkin')
    .eq('id', user.id)
    .single();

  if (!detailer) {
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  const tier = detailer.plan || 'free';
  const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
  const finalPoints = calculatePoints(action, tier);

  // Check one-time actions
  if (ONE_TIME_ACTIONS.includes(action)) {
    const { data: existing } = await supabase
      .from('points_ledger')
      .select('id')
      .eq('detailer_id', user.id)
      .eq('action', action)
      .limit(1);

    if (existing?.length > 0) {
      return Response.json({ already_earned: true, points: 0 });
    }
  }

  // Handle daily login with streak tracking
  let streakBonus = 0;
  let newStreak = detailer.login_streak || 0;
  if (action === 'DAILY_LOGIN') {
    const today = new Date().toISOString().split('T')[0];
    const lastCheckin = detailer.last_daily_checkin?.split('T')[0];

    if (lastCheckin === today) {
      return Response.json({ already_earned: true, points: 0, streak: newStreak });
    }

    // Calculate streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (lastCheckin === yesterday) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    // Update daily checkin + streak
    await supabase
      .from('detailers')
      .update({ last_daily_checkin: new Date().toISOString(), login_streak: newStreak })
      .eq('id', user.id);

    // Check streak milestones
    if (newStreak === 7) {
      streakBonus = calculatePoints('STREAK_7_DAYS', tier);
    } else if (newStreak === 30) {
      streakBonus = calculatePoints('STREAK_30_DAYS', tier);
    }
  }

  // Insert ledger entry
  const { error: ledgerError } = await supabase
    .from('points_ledger')
    .insert({
      detailer_id: user.id,
      action,
      base_points: config.base,
      multiplier,
      final_points: finalPoints,
      description: config.description,
      metadata: metadata || {},
    });

  if (ledgerError) {
    console.error('Points earn error:', ledgerError);
    return Response.json({ error: ledgerError.message }, { status: 500 });
  }

  // Insert streak bonus if earned
  if (streakBonus > 0) {
    const streakAction = newStreak === 30 ? 'STREAK_30_DAYS' : 'STREAK_7_DAYS';
    const streakConfig = POINTS_ACTIONS[streakAction];
    await supabase
      .from('points_ledger')
      .insert({
        detailer_id: user.id,
        action: streakAction,
        base_points: streakConfig.base,
        multiplier,
        final_points: streakBonus,
        description: streakConfig.description,
        metadata: { streak: newStreak },
      });
  }

  // Update totals
  const totalEarned = finalPoints + streakBonus;
  const newBalance = (detailer.points_balance || 0) + totalEarned;
  const newLifetime = (detailer.points_lifetime || 0) + totalEarned;

  await supabase
    .from('detailers')
    .update({
      points_balance: newBalance,
      points_lifetime: newLifetime,
    })
    .eq('id', user.id);

  return Response.json({
    success: true,
    action,
    basePoints: config.base,
    multiplier,
    finalPoints,
    streakBonus: streakBonus || undefined,
    streak: action === 'DAILY_LOGIN' ? newStreak : undefined,
    newBalance,
    newLifetime,
  });
}
