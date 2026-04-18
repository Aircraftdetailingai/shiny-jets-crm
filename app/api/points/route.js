import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { POINTS_ACTIONS, calculatePoints, TIER_MULTIPLIERS } from '@/lib/points';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Get user's points balance, recent history, and week stats
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Get detailer points + plan
  const { data: detailer } = await supabase
    .from('detailers')
    .select('points_balance, points_lifetime, plan, login_streak, last_daily_checkin')
    .eq('id', user.id)
    .single();

  // Get recent history (last 50)
  const { data: history } = await supabase
    .from('points_ledger')
    .select('*')
    .eq('detailer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  // Get this week's stats
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: weekStats } = await supabase
    .from('points_ledger')
    .select('final_points')
    .eq('detailer_id', user.id)
    .gte('created_at', weekAgo);

  const weekPoints = weekStats?.reduce((sum, h) => sum + (h.final_points || 0), 0) || 0;

  // Get this week's bookings
  const { data: weekQuotes } = await supabase
    .from('quotes')
    .select('total_price')
    .eq('detailer_id', user.id)
    .eq('status', 'paid')
    .gte('paid_at', weekAgo);

  const weekBooked = weekQuotes?.reduce((sum, q) => sum + (q.total_price || 0), 0) || 0;
  const weekJobs = weekQuotes?.length || 0;

  const tier = detailer?.plan || 'free';

  return Response.json({
    balance: detailer?.points_balance || 0,
    lifetime: detailer?.points_lifetime || 0,
    tier,
    multiplier: TIER_MULTIPLIERS[tier] || 1.0,
    loginStreak: detailer?.login_streak || 0,
    history: history || [],
    weekStats: {
      points: weekPoints,
      booked: weekBooked,
      jobs: weekJobs,
    },
    actions: POINTS_ACTIONS,
  });
}

// POST - Award points (kept for backward compat, prefer /api/points/earn)
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { action, metadata } = await request.json();

  if (!action || !POINTS_ACTIONS[action]) {
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Get detailer plan for tier multiplier
  const { data: detailer } = await supabase
    .from('detailers')
    .select('points_balance, points_lifetime, plan')
    .eq('id', user.id)
    .single();

  const tier = detailer?.plan || 'free';
  const config = POINTS_ACTIONS[action];
  const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
  const finalPoints = calculatePoints(action, tier);

  // Check for one-time actions
  const oneTimeActions = ['COMPLETE_PROFILE', 'UPGRADE_PLAN', 'MILESTONE_10K', 'MILESTONE_50K', 'MILESTONE_100K'];
  if (oneTimeActions.includes(action)) {
    const { data: existing } = await supabase
      .from('points_ledger')
      .select('id')
      .eq('detailer_id', user.id)
      .eq('action', action)
      .limit(1);

    if (existing?.length > 0) {
      return Response.json({ error: 'Already awarded', points: 0 }, { status: 200 });
    }
  }

  // Insert into points_ledger
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
    console.error('Points ledger error:', ledgerError);
    return Response.json({ error: ledgerError.message }, { status: 500 });
  }

  // Update detailer totals
  const newBalance = (detailer?.points_balance || 0) + finalPoints;
  const newLifetime = (detailer?.points_lifetime || 0) + finalPoints;

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
    newBalance,
    newLifetime,
  });
}
