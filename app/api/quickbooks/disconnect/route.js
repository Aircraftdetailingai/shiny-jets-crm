import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('quickbooks_connections')
    .delete()
    .eq('detailer_id', user.id);

  if (error) {
    console.error('QB disconnect error:', error);
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return Response.json({ disconnected: true });
}
