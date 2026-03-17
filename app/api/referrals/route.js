import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET - Get referral stats and code for the authenticated detailer
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Get the detailer's referral code
  const { data: detailer } = await supabase
    .from('detailers')
    .select('referral_code')
    .eq('id', user.id)
    .single();

  let referralCode = detailer?.referral_code;

  // Auto-generate if no code exists
  if (!referralCode) {
    referralCode = generateReferralCode();
    // Try to set it, retry on collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase
        .from('detailers')
        .update({ referral_code: referralCode })
        .eq('id', user.id);
      if (!error) break;
      referralCode = generateReferralCode();
    }
  }

  // Fetch referral stats
  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_id, status, referrer_reward, created_at, completed_at')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });

  // Get referred user names
  const referralList = referrals || [];
  const referredIds = referralList.map(r => r.referred_id).filter(Boolean);
  let referredUsers = {};

  if (referredIds.length > 0) {
    const { data: users } = await supabase
      .from('detailers')
      .select('id, name, company, email, created_at')
      .in('id', referredIds);
    if (users) {
      users.forEach(u => { referredUsers[u.id] = u; });
    }
  }

  const enrichedReferrals = referralList.map(r => ({
    id: r.id,
    status: r.status,
    reward: r.referrer_reward,
    created_at: r.created_at,
    completed_at: r.completed_at,
    referred_user: referredUsers[r.referred_id] ? {
      name: referredUsers[r.referred_id].name,
      company: referredUsers[r.referred_id].company,
      email: referredUsers[r.referred_id].email,
      joined: referredUsers[r.referred_id].created_at,
    } : null,
  }));

  const totalReferrals = referralList.length;
  const rewardedReferrals = referralList.filter(r => r.status === 'rewarded' || r.status === 'completed').length;
  const pendingReferrals = referralList.filter(r => r.status === 'pending').length;
  const monthsEarned = rewardedReferrals; // 1 month free per rewarded referral
  const pointsEarned = rewardedReferrals * 500; // 500 pts per rewarded referral

  return Response.json({
    referral_code: referralCode,
    stats: {
      total: totalReferrals,
      rewarded: rewardedReferrals,
      pending: pendingReferrals,
      months_earned: monthsEarned,
      points_earned: pointsEarned,
    },
    referrals: enrichedReferrals,
  });
}
