import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function PATCH(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const body = await request.json();
  const supabase = getSupabase();

  // Verify ownership
  const { data: review } = await supabase
    .from('feedback')
    .select('id, detailer_id')
    .eq('id', id)
    .eq('detailer_id', user.id)
    .single();

  if (!review) {
    return Response.json({ error: 'Review not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('feedback')
    .update({ is_public: !!body.isPublic })
    .eq('id', id);

  if (error) {
    return Response.json({ error: 'Update failed' }, { status: 500 });
  }

  return Response.json({ success: true });
}
