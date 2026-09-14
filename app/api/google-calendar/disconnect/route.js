import { createAdminClient } from '@/lib/supabase-admin';
import { env } from '@/lib/env';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createAdminClient();
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Delete cached events
  await supabase
    .from('google_calendar_events')
    .delete()
    .eq('detailer_id', user.detailer_id || user.id);

  // Delete connection
  await supabase
    .from('google_calendar_connections')
    .delete()
    .eq('detailer_id', user.detailer_id || user.id);

  return Response.json({ success: true });
}
