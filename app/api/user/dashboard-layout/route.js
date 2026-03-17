import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('detailers')
    .select('dashboard_layout')
    .eq('id', user.id)
    .single();

  // If column doesn't exist yet, return null gracefully
  if (error) return Response.json({ layout: null });

  return Response.json({ layout: data?.dashboard_layout || null });
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.layouts || !body.activeWidgets) {
    return Response.json({ error: 'layouts and activeWidgets required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('detailers')
    .update({ dashboard_layout: body })
    .eq('id', user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
