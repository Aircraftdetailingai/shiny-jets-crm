import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { normalizePlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

// GET — lightweight plan-only read designed for client polling (focus +
// visibility + 60s interval). Explicit column list, no secrets, no cache.
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const detailerId = user.detailer_id || user.id;
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('detailers')
    .select('id, plan, subscription_status, subscription_source, plan_updated_at, updated_at')
    .eq('id', detailerId)
    .single();

  if (error || !data) {
    console.error('[plan-status] fetch failed for detailer', detailerId, error?.message);
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  // Standalone Detailing AI access (separate query: safe before the migration is applied).
  let aiAccessUntil = null;
  try {
    const { data: ai, error: aiErr } = await supabase.from('detailers').select('ai_access_until').eq('id', detailerId).maybeSingle();
    if (!aiErr) aiAccessUntil = ai?.ai_access_until || null;
  } catch {}

  console.log(`[plan-status] detailer_id=${data.id} plan=${data.plan} status=${data.subscription_status}`);

  return new Response(
    JSON.stringify({
      plan: normalizePlan(data.plan),
      plan_raw: data.plan || 'free',
      subscription_status: data.subscription_status || null,
      subscription_source: data.subscription_source || null,
      plan_updated_at: data.plan_updated_at || null,
      updated_at: data.updated_at || null,
      ai_access_until: aiAccessUntil,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
