import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Get notification preferences
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: detailer } = await supabase
    .from('detailers')
    .select('notification_settings, tips_frequency, tips_enabled, push_subscription, leaderboard_opt_in')
    .eq('id', user.id)
    .single();

  return Response.json({
    tipsEnabled: detailer?.tips_enabled ?? null, // null = not yet asked
    tipsFrequency: detailer?.tips_frequency || 'daily',
    leaderboardOptIn: detailer?.leaderboard_opt_in || false,
    hasPushSubscription: !!detailer?.push_subscription,
    notificationSettings: detailer?.notification_settings || {},
  });
}

// POST - Update notification preferences
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const body = await request.json();
  const { tipsEnabled, tipsFrequency, leaderboardOptIn, pushSubscription } = body;

  const updates = {};

  if (typeof tipsEnabled === 'boolean') {
    updates.tips_enabled = tipsEnabled;
  }

  if (tipsFrequency && ['daily', 'weekly', 'monthly', 'none'].includes(tipsFrequency)) {
    updates.tips_frequency = tipsFrequency;
    updates.tips_enabled = tipsFrequency !== 'none';
  }

  if (typeof leaderboardOptIn === 'boolean') {
    updates.leaderboard_opt_in = leaderboardOptIn;
  }

  if (pushSubscription) {
    updates.push_subscription = pushSubscription;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid updates provided' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('detailers')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    tipsEnabled: data.tips_enabled,
    tipsFrequency: data.tips_frequency,
    leaderboardOptIn: data.leaderboard_opt_in,
  });
}
