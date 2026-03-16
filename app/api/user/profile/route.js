import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const updates = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.company !== undefined) updates.company = body.company;
  if (body.phone !== undefined) updates.phone = body.phone;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('detailers')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update profile:', error);
    return Response.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  return Response.json({ success: true });
}
