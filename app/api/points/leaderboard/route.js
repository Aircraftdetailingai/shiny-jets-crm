import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const supabase = getSupabase();

  // Get top 20 by lifetime points (only those who opted in)
  const { data: leaders } = await supabase
    .from('detailers')
    .select('id, company, points_lifetime, leaderboard_opt_in')
    .eq('leaderboard_opt_in', true)
    .order('points_lifetime', { ascending: false })
    .limit(20);

  // Anonymize if needed
  const leaderboard = (leaders || []).map((l, i) => ({
    rank: i + 1,
    name: l.company || `Detailer #${l.id.substring(0, 4)}`,
    points: l.points_lifetime || 0,
  }));

  return Response.json({ leaderboard });
}
