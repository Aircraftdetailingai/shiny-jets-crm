import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data } = await supabase
    .from('detailers')
    .select('followup_discount_percent')
    .eq('id', user.id)
    .single();

  return Response.json({ followup_discount_percent: data?.followup_discount_percent || 10 });
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { followup_discount_percent } = await request.json();
  const pct = Math.min(25, Math.max(5, parseInt(followup_discount_percent) || 10));

  const supabase = getSupabase();
  const { error } = await supabase
    .from('detailers')
    .update({ followup_discount_percent: pct })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update followup discount:', error);
    return Response.json({ error: 'Failed to update' }, { status: 500 });
  }

  return Response.json({ success: true, followup_discount_percent: pct });
}
