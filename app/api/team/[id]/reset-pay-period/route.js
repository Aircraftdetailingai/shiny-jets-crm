import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const detailerId = user.detailer_id || user.id;
  const memberId = params.id;

  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('team_members')
    .update({ pay_period_start: today })
    .eq('id', memberId)
    .eq('detailer_id', detailerId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, pay_period_start: today });
}
