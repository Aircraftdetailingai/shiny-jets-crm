import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// POST - Claim a referral reward (called after login by the referred user)
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { referral_code } = await request.json();
  if (!referral_code) {
    return Response.json({ error: 'Referral code required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Find the referrer by code
  const { data: referrer } = await supabase
    .from('detailers')
    .select('id, name, company')
    .eq('referral_code', referral_code.toUpperCase())
    .single();

  if (!referrer) {
    return Response.json({ error: 'Invalid referral code' }, { status: 404 });
  }

  // Can't refer yourself
  if (referrer.id === user.id) {
    return Response.json({ error: 'Cannot use your own referral code' }, { status: 400 });
  }

  // Check if this user was already referred
  const { data: existing } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_id', user.id)
    .maybeSingle();

  if (existing) {
    return Response.json({ error: 'Referral already claimed' }, { status: 409 });
  }

  // Check if this user's account is less than 7 days old (only new users can claim)
  const { data: currentUser } = await supabase
    .from('detailers')
    .select('created_at')
    .eq('id', user.id)
    .single();

  if (currentUser) {
    const accountAge = Date.now() - new Date(currentUser.created_at).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (accountAge > sevenDays) {
      return Response.json({ error: 'Referral can only be claimed within 7 days of signup' }, { status: 400 });
    }
  }

  // Create the referral record as pending — rewards given when first paid quote completes
  const { error: insertError } = await supabase
    .from('referrals')
    .insert({
      referrer_id: referrer.id,
      referred_id: user.id,
      referral_code: referral_code.toUpperCase(),
      status: 'pending',
      referrer_reward: '1_month_pro',
      referred_reward: '500_points',
    });

  if (insertError) {
    console.error('Referral insert error:', insertError);
    return Response.json({ error: 'Failed to process referral' }, { status: 500 });
  }

  // Store referrer_id on the referred user
  await supabase
    .from('detailers')
    .update({ referrer_id: referrer.id })
    .eq('id', user.id);

  return Response.json({
    success: true,
    message: 'Referral linked! You\'ll both earn rewards when you complete your first paid quote.',
    referrer_name: referrer.company || referrer.name,
  });
}
