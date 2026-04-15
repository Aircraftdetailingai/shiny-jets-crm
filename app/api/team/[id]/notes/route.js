import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function PATCH(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const detailerId = user.detailer_id || user.id;
  const memberId = params.id;

  const { owner_notes } = await request.json();
  const supabase = getSupabase();

  const { error } = await supabase
    .from('team_members')
    .update({ owner_notes: owner_notes ?? null })
    .eq('id', memberId)
    .eq('detailer_id', detailerId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
