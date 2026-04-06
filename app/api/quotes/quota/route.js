import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { getTier } from '@/lib/pricing-tiers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  const plan = detailer?.plan || 'free';
  const tierConfig = getTier(plan);

  if (tierConfig.quotesPerMonth === Infinity) {
    return Response.json({ plan, used: 0, limit: null, unlimited: true });
  }

  // Count non-draft quotes created this calendar month
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count, error } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .eq('detailer_id', user.id)
    .neq('status', 'draft')
    .gte('created_at', firstOfMonth);

  const used = error ? 0 : (count || 0);

  return Response.json({
    plan,
    used,
    limit: tierConfig.quotesPerMonth,
    unlimited: false,
  });
}
