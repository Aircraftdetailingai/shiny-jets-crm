import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Get current availability and remove ICS fields
  const { data: detailer } = await supabase
    .from('detailers')
    .select('availability')
    .eq('id', user.id)
    .single();

  if (detailer?.availability) {
    const { icsUrl, icsLastSync, ...rest } = detailer.availability;
    await supabase
      .from('detailers')
      .update({ availability: rest })
      .eq('id', user.id);
  }

  // Remove ICS-imported events from calendar cache
  await supabase
    .from('google_calendar_events')
    .delete()
    .eq('detailer_id', user.id)
    .like('google_event_id', 'ics-%');

  return Response.json({ success: true });
}
