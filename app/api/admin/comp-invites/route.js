import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const VALID_PLANS = new Set(['lite', 'business', 'pro', 'enterprise']); // pro/enterprise = legacy aliases
const VALID_STATUSES = new Set(['complimentary', 'trial']);
const NO_STORE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' };

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: NO_STORE });
}

// POST /api/admin/comp-invites
// Admin-only endpoint to grant comp plans. Two paths:
//  1. Detailer already exists → upgrade them in place, skip comp_invites table
//  2. Detailer doesn't exist → stage a pending comp_invites row that will
//     auto-redeem on first signup matching the email
// Server-side admin check on detailers.is_admin — never trust the client.
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return jsonError('Unauthorized', 401);

  const supabase = getSupabase();

  // Authoritative admin check against the database — JWT-claimed admin
  // bits would be untrustworthy.
  const { data: caller } = await supabase
    .from('detailers')
    .select('id, email, is_admin')
    .eq('id', user.id)
    .single();

  if (!caller || caller.is_admin !== true) {
    return jsonError('Forbidden', 403);
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const email = String(body.email || '').trim().toLowerCase();
  const plan = String(body.plan || '').trim().toLowerCase();
  const subscriptionStatus = String(body.subscription_status || 'complimentary').trim().toLowerCase();
  const trialEndsAtRaw = body.trial_ends_at;
  const notes = body.notes ? String(body.notes) : null;

  if (!email || !email.includes('@')) return jsonError('Valid email required');
  if (!VALID_PLANS.has(plan)) return jsonError(`plan must be one of: ${[...VALID_PLANS].join(', ')}`);
  if (!VALID_STATUSES.has(subscriptionStatus)) return jsonError(`subscription_status must be one of: ${[...VALID_STATUSES].join(', ')}`);

  // Trial end date validation: required for complimentary (the whole point
  // of staging is the long-dated grant). Optional for trial.
  let trialEndsAt = null;
  if (trialEndsAtRaw) {
    const t = new Date(trialEndsAtRaw);
    if (Number.isNaN(t.getTime())) return jsonError('trial_ends_at must be a valid ISO date');
    if (t.getTime() <= Date.now()) return jsonError('trial_ends_at must be in the future');
    trialEndsAt = t.toISOString();
  } else if (subscriptionStatus === 'complimentary') {
    return jsonError('trial_ends_at is required when subscription_status is complimentary');
  }

  // Path 1: detailer already exists → upgrade in place, no comp_invites row.
  const { data: existing } = await supabase
    .from('detailers')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    const update = {
      plan,
      subscription_status: subscriptionStatus,
      plan_updated_at: new Date().toISOString(),
    };
    if (trialEndsAt) update.trial_ends_at = trialEndsAt;

    const { error: upErr } = await supabase
      .from('detailers')
      .update(update)
      .eq('id', existing.id);

    if (upErr) {
      console.error('[admin/comp-invites] direct upgrade failed:', upErr.message);
      return jsonError(upErr.message, 500);
    }

    console.log(`[admin/comp-invites] direct upgrade ${existing.id} (${email}) -> ${plan}/${subscriptionStatus} by ${caller.email}`);
    return new Response(
      JSON.stringify({ applied: 'directly', detailer_id: existing.id, plan, subscription_status: subscriptionStatus, trial_ends_at: trialEndsAt }),
      { status: 200, headers: NO_STORE },
    );
  }

  // Path 2: stage a comp_invites row. The unique partial index on
  // LOWER(email) WHERE status='pending' rejects duplicates. Revoke any
  // existing pending row first so a new grant replaces an old one.
  const { error: revokeErr } = await supabase
    .from('comp_invites')
    .update({ status: 'revoked' })
    .ilike('email', email)
    .eq('status', 'pending');

  if (revokeErr) {
    console.warn('[admin/comp-invites] revoke previous pending failed (non-fatal):', revokeErr.message);
  }

  const insertRow = {
    email,
    plan,
    subscription_status: subscriptionStatus,
    trial_ends_at: trialEndsAt,
    status: 'pending',
    granted_by_email: caller.email,
    granted_at: new Date().toISOString(),
    notes,
  };

  const { data: invite, error: insErr } = await supabase
    .from('comp_invites')
    .insert(insertRow)
    .select('id')
    .single();

  if (insErr) {
    console.error('[admin/comp-invites] stage insert failed:', insErr.message);
    return jsonError(insErr.message, 500);
  }

  console.log(`[admin/comp-invites] staged invite ${invite.id} for ${email} -> ${plan}/${subscriptionStatus} by ${caller.email}`);
  return new Response(
    JSON.stringify({ applied: 'staged', invite_id: invite.id, plan, subscription_status: subscriptionStatus, trial_ends_at: trialEndsAt }),
    { status: 200, headers: NO_STORE },
  );
}
