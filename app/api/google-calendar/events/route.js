import { createAdminClient } from '@/lib/supabase-admin';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createAdminClient();
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end) {
    return Response.json({ error: 'start and end parameters required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: events, error } = await supabase
    .from('google_calendar_events')
    .select('*')
    .eq('detailer_id', user.detailer_id || user.id)
    .gte('start_time', start)
    .lte('end_time', end)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Failed to fetch Google Calendar events:', error);
    return Response.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  return Response.json({ events: events || [] });
}
