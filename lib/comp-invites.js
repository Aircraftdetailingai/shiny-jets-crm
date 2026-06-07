// Shared comp-invite redemption logic. Called from every signup path
// (password signup, OAuth signup, Shopify webhook auto-create) right after
// the new detailers row is inserted. Brett or another admin pre-stages a
// pending comp_invites row by email; the first signup matching that email
// auto-applies plan + subscription_status + trial_ends_at and marks the
// invite redeemed. Idempotent and never blocks the signup — any failure
// is swallowed + logged so the new account still works on the free tier.

const VALID_PLANS = new Set(['free', 'pro', 'business', 'enterprise']);
// 'comped' is the canonical status used by admin-staged invites today; the
// older 'complimentary' label is preserved for backward compatibility with
// rows staged before the schema convention settled.
const VALID_STATUSES = new Set(['complimentary', 'comped', 'trial', 'active']);

export async function redeemCompInviteIfAny(supabase, detailerId, email) {
  if (!supabase || !detailerId || !email) {
    return { applied: false, reason: 'missing_args' };
  }

  try {
    const lowered = String(email).trim().toLowerCase();

    // Find the most recently granted pending invite for this email.
    const { data: invites, error: lookupErr } = await supabase
      .from('comp_invites')
      .select('id, plan, subscription_status, trial_ends_at, granted_by_email')
      .ilike('email', lowered)
      .eq('status', 'pending')
      .order('granted_at', { ascending: false })
      .limit(1);

    if (lookupErr) {
      // Most likely the table doesn't exist yet on this deploy — non-fatal.
      console.warn('[comp-invites] lookup failed (non-fatal):', lookupErr.message);
      return { applied: false, reason: 'lookup_failed' };
    }

    const invite = (invites || [])[0];
    if (!invite) {
      return { applied: false, reason: 'no_pending' };
    }

    if (!VALID_PLANS.has(invite.plan) || !VALID_STATUSES.has(invite.subscription_status)) {
      console.warn('[comp-invites] invalid invite payload, skipping:', invite);
      return { applied: false, reason: 'invalid_invite' };
    }

    // Apply the invite to the detailer. If this update fails we surface it,
    // but we still return applied:false rather than throwing — the new
    // detailer is already created and signup must succeed. Stamping
    // subscription_source='comp_invite' so billing/reporting can tell these
    // accounts apart from paid Shopify subscribers and course bundlers.
    // Align platform_fee_percent with the comped plan tier so the new
    // Stripe charge code (which reads detailer.platform_fee_percent) deducts
    // the right amount on day one. Per Brett's matrix:
    //   free=5  pro=2  business=1  enterprise=0
    const { defaultFeePercentForPlan } = await import('@/lib/branding');
    const detailerUpdate = {
      plan: invite.plan,
      subscription_status: invite.subscription_status,
      subscription_source: 'comp_invite',
      plan_updated_at: new Date().toISOString(),
      platform_fee_percent: defaultFeePercentForPlan(invite.plan),
    };
    if (invite.trial_ends_at) {
      detailerUpdate.trial_ends_at = invite.trial_ends_at;
    }

    const { error: applyErr } = await supabase
      .from('detailers')
      .update(detailerUpdate)
      .eq('id', detailerId);

    if (applyErr) {
      console.error('[comp-invites] failed to apply to detailer', detailerId, applyErr.message);
      return { applied: false, reason: 'apply_failed' };
    }

    // Mark the invite redeemed so a second signup with the same email (if
    // the unique partial index didn't catch it) can't double-grant.
    const { error: redeemErr } = await supabase
      .from('comp_invites')
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString(),
        redeemed_detailer_id: detailerId,
      })
      .eq('id', invite.id);

    if (redeemErr) {
      // The detailer already got the upgrade; this is just bookkeeping.
      console.error('[comp-invites] redeem mark failed (detailer still upgraded):', redeemErr.message);
    }

    console.log(`[comp-invites] redeemed ${invite.id} for detailer ${detailerId} (${lowered}) -> ${invite.plan}/${invite.subscription_status}`);

    return {
      applied: true,
      plan: invite.plan,
      subscription_status: invite.subscription_status,
      trial_ends_at: invite.trial_ends_at,
      granted_by_email: invite.granted_by_email,
    };
  } catch (e) {
    console.error('[comp-invites] unexpected error (non-fatal):', e?.message || e);
    return { applied: false, reason: 'exception' };
  }
}
