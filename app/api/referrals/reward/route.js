import { createClient } from '@supabase/supabase-js';
import { calculatePoints, POINTS_ACTIONS } from '@/lib/points';
import { sendReferralRewardReferrerEmail, sendReferralRewardReferredEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

/**
 * Process referral reward when a referred user completes their first paid quote.
 * Called internally from the Stripe webhook after a quote is marked as 'paid'.
 *
 * @param {string} referredId - The detailer ID of the referred user
 * @returns {object} result with success flag
 */
export async function processReferralReward(referredId) {
  const supabase = getSupabase();

  // Check if this user has a pending referral
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, referrer_id, referred_id, status')
    .eq('referred_id', referredId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!referral) return { rewarded: false, reason: 'no_pending_referral' };

  // Check if this is the referred user's first paid quote
  const { count } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .eq('detailer_id', referredId)
    .eq('status', 'paid');

  // Only trigger on first paid quote (count should be 1 since we just marked it paid)
  if (count > 1) return { rewarded: false, reason: 'not_first_paid_quote' };

  // Get referrer and referred details for email + points
  const { data: referrer } = await supabase
    .from('detailers')
    .select('id, name, company, email, plan, trial_ends_at, points_balance, points_lifetime')
    .eq('id', referral.referrer_id)
    .single();

  const { data: referred } = await supabase
    .from('detailers')
    .select('id, name, company, email, plan, country, points_balance, points_lifetime')
    .eq('id', referral.referred_id)
    .single();

  if (!referrer || !referred) return { rewarded: false, reason: 'user_not_found' };

  // --- Award referrer: 500 points + 1 month free Pro ---
  const referrerPoints = calculatePoints('REFERRAL_SIGNUP', referrer.plan);

  // Points for referrer
  await supabase.from('points_ledger').insert({
    detailer_id: referrer.id,
    action: 'REFERRAL_SIGNUP',
    points: referrerPoints,
    description: `Referral reward: ${referred.company || referred.name} completed first paid quote`,
  });
  await supabase
    .from('detailers')
    .update({
      points_balance: (referrer.points_balance || 0) + referrerPoints,
      points_lifetime: (referrer.points_lifetime || 0) + referrerPoints,
    })
    .eq('id', referrer.id);

  // Extend referrer's trial/subscription by 1 month (or upgrade to pro if on free)
  const currentEnd = referrer.trial_ends_at ? new Date(referrer.trial_ends_at) : new Date();
  const extendedEnd = new Date(Math.max(currentEnd.getTime(), Date.now()));
  extendedEnd.setDate(extendedEnd.getDate() + 30);

  const referrerUpdate = { trial_ends_at: extendedEnd.toISOString() };
  if (referrer.plan === 'free') referrerUpdate.plan = 'pro';

  await supabase.from('detailers').update(referrerUpdate).eq('id', referrer.id);

  // --- Award referred: 500 points ---
  const referredPoints = calculatePoints('REFERRAL_SIGNUP', referred.plan);

  await supabase.from('points_ledger').insert({
    detailer_id: referred.id,
    action: 'REFERRAL_SIGNUP',
    points: referredPoints,
    description: 'Welcome bonus: completed first paid quote via referral',
  });
  await supabase
    .from('detailers')
    .update({
      points_balance: (referred.points_balance || 0) + referredPoints,
      points_lifetime: (referred.points_lifetime || 0) + referredPoints,
    })
    .eq('id', referred.id);

  // --- Update referral status to rewarded ---
  await supabase
    .from('referrals')
    .update({
      status: 'rewarded',
      completed_at: new Date().toISOString(),
    })
    .eq('id', referral.id);

  // --- Send notification emails ---
  try {
    await sendReferralRewardReferrerEmail({
      referrer,
      referredName: referred.company || referred.name,
      pointsEarned: referrerPoints,
    });
  } catch (e) {
    console.error('Failed to send referrer reward email:', e);
  }

  try {
    await sendReferralRewardReferredEmail({
      referred,
      pointsEarned: referredPoints,
    });
  } catch (e) {
    console.error('Failed to send referred reward email:', e);
  }

  return { rewarded: true, referrerPoints, referredPoints };
}

// POST endpoint for manual/external triggering
export async function POST(request) {
  // This endpoint should only be called internally
  const authHeader = request.headers.get('authorization');
  const internalKey = process.env.INTERNAL_API_KEY;
  if (internalKey && authHeader !== `Bearer ${internalKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { referred_id } = await request.json();
  if (!referred_id) {
    return Response.json({ error: 'referred_id required' }, { status: 400 });
  }

  const result = await processReferralReward(referred_id);
  return Response.json(result);
}
