// Server-side plan enforcement for API routes.
//
//   const gate = await requireFeature(request, 'invoices', { user });
//   if (gate) return gate;   // 403 { code: 'PLAN_REQUIRED', upgrade_url, … }
//
// Reads the detailer's CURRENT plan from the database on every call (never
// trusts the plan baked into the JWT, which goes stale after upgrades).
// Crew JWTs carry detailer_id, so crew endpoints are gated on the owner's plan.
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import {
  hasFeature,
  planRequiredBody,
  normalizePlan,
  seatLimitForPlan,
  canAddSeat,
  PLAN_NAMES,
  UPGRADE_PATH,
} from '@/lib/plans';
import { hasDetailingAiAccess } from '@/lib/detailing-ai-access';

export const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai', 'brett@shinyjets.com'];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  // cache:'no-store': without it Next caches supabase GET selects made from GET
  // route handlers, so plan checks can keep reading a stale plan (see lib/supabase-admin.js).
  return createClient(url, key, { global: { fetch: (u, opts) => fetch(u, { ...opts, cache: 'no-store' }) } });
}

export function isAdminDetailer(detailer) {
  if (!detailer) return false;
  if (detailer.is_admin === true) return true;
  return ADMIN_EMAILS.includes(String(detailer.email || '').toLowerCase());
}

export async function loadDetailerPlan(detailerId, supabase = getSupabase()) {
  if (!detailerId || !supabase) return { detailer: null, error: 'unavailable' };
  const { data, error } = await supabase
    .from('detailers')
    .select('id, email, plan, is_admin')
    .eq('id', detailerId)
    .maybeSingle();
  return { detailer: data || null, error: error || null };
}

// Pure check against an already-loaded detailer row. Returns null when
// allowed, or a 403 Response.
export function featureGateResponse(detailer, feature) {
  if (hasFeature(detailer, feature, { isAdmin: isAdminDetailer(detailer) })) return null;
  return Response.json(planRequiredBody(feature, detailer?.plan), { status: 403 });
}

// Returns null when the request may proceed. When there is no authenticated
// user it also returns null so the route's own 401 handling stays in charge.
export async function requireFeature(request, feature, { user, supabase, detailerId } = {}) {
  const authUser = user === undefined ? await getAuthUser(request) : user;
  const id = detailerId || authUser?.detailer_id || authUser?.id;
  if (!id) return null;
  const { detailer, error } = await loadDetailerPlan(id, supabase || getSupabase());
  if (error && !detailer) {
    console.error(`[plan-gate] plan lookup failed for ${id} (${feature}):`, error?.message || error);
    return Response.json({ error: 'Could not verify your plan. Please try again.' }, { status: 503 });
  }
  if (!detailer) return null; // unknown detailer: route decides (usually 404)
  const gate = featureGateResponse(detailer, feature);
  if (gate && feature === 'detailingAi') {
    const extras = await loadDetailingAiExtras(detailer.id, supabase || getSupabase());
    if (hasDetailingAiAccess({ ...detailer, ...extras, is_admin: isAdminDetailer(detailer) })) return null;
  }
  return gate;
}

// Detailing AI is Business-only, plus standalone buyers and grandfathered Lite.
// Each column is read in its own query so a missing column (migration not applied
// yet) never breaks plan checks:
//   ai_access_until               (20261003_detailing_ai_standalone.sql)
//   detailing_ai_grandfathered_at (20261004_detailing_ai_business_only.sql)
// detailing_ai_grandfathered is null when unknown, which keeps the old Lite rule.
export async function loadDetailingAiExtras(detailerId, supabase = getSupabase()) {
  const out = { ai_access_until: null, detailing_ai_grandfathered: null };
  if (!detailerId || !supabase) return out;
  try {
    const { data, error } = await supabase.from('detailers').select('ai_access_until').eq('id', detailerId).maybeSingle();
    if (!error) out.ai_access_until = data?.ai_access_until || null;
  } catch {}
  try {
    const { data, error } = await supabase.from('detailers').select('detailing_ai_grandfathered_at').eq('id', detailerId).maybeSingle();
    if (!error) out.detailing_ai_grandfathered = !!data?.detailing_ai_grandfathered_at;
  } catch {}
  return out;
}


// Detailer-id based check for public/customer-facing routes (portal, crew
// login) where the caller is not the detailer.
export async function detailerHasFeature(detailerId, feature, supabase = getSupabase()) {
  const { detailer } = await loadDetailerPlan(detailerId, supabase);
  if (!detailer) return false;
  return hasFeature(detailer, feature, { isAdmin: isAdminDetailer(detailer) });
}

// Seats = owner + active, non-owner team members.
export async function countUsedSeats(supabase, detailerId) {
  const { count, error } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('detailer_id', detailerId)
    .eq('status', 'active')
    .neq('role', 'owner');
  if (error) throw error;
  return 1 + (count || 0);
}

// Returns null if one more active team member fits, else a 403 Response.
export async function requireSeat(supabase, detailerId) {
  const { detailer } = await loadDetailerPlan(detailerId, supabase);
  if (!detailer) return null;
  const isAdmin = isAdminDetailer(detailer);
  const plan = normalizePlan(detailer.plan);
  const limit = seatLimitForPlan(plan);
  let used;
  try {
    used = await countUsedSeats(supabase, detailerId);
  } catch (e) {
    console.error('[plan-gate] seat count failed:', e?.message || e);
    return Response.json({ error: 'Could not verify team seats. Please try again.' }, { status: 503 });
  }
  if (canAddSeat(detailer, used, { isAdmin })) return null;
  const message = plan === 'business'
    ? `Your Business plan includes up to ${limit} users (you + ${limit - 1} team members). Deactivate a team member to add someone new.`
    : `${PLAN_NAMES[plan]} includes 1 user. Upgrade to Business ($89.95/mo or $899/yr) to add up to 3 users.`;
  return Response.json({
    error: message,
    code: plan === 'business' ? 'SEAT_LIMIT' : 'PLAN_REQUIRED',
    upgrade_required: plan !== 'business',
    feature: 'team',
    current_plan: plan,
    required_plan: 'business',
    seat_limit: limit,
    seats_used: used,
    upgrade_url: `${UPGRADE_PATH}?plan=business`,
  }, { status: 403 });
}

// Customer-facing portals span every detailer that serviced a customer. Drop
// rows (quotes/jobs with detailer_id) from detailers whose plan lacks the
// feature — e.g. the customer portal / live aircraft progress is Lite+.
export async function filterRowsByDetailerFeature(supabase, rows, feature) {
  const list = rows || [];
  const ids = [...new Set(list.map((r) => r?.detailer_id).filter(Boolean))];
  if (!ids.length || !supabase) return list;
  const { data, error } = await supabase
    .from('detailers')
    .select('id, email, plan, is_admin')
    .in('id', ids);
  if (error) {
    console.error('[plan-gate] portal plan lookup failed:', error.message);
    return list; // fail open for customers; owner-side routes stay gated
  }
  const allowed = new Set(
    (data || [])
      .filter((d) => hasFeature(d, feature, { isAdmin: isAdminDetailer(d) }))
      .map((d) => d.id),
  );
  return list.filter((r) => !r?.detailer_id || allowed.has(r.detailer_id));
}

// Memoized per-run checker for cron jobs: `const allowed = planChecker(supabase)`
// then `if (!(await allowed(detailerId, 'quoteFollowups'))) continue;`
export function planChecker(supabase) {
  const cache = new Map();
  return async function allowed(detailerId, feature) {
    if (!detailerId) return false;
    let d = cache.get(detailerId);
    if (d === undefined) {
      const res = await loadDetailerPlan(detailerId, supabase);
      d = res.detailer || null;
      cache.set(detailerId, d);
    }
    if (!d) return false;
    return hasFeature(d, feature, { isAdmin: isAdminDetailer(d) });
  };
}
