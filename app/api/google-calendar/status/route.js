import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALENDAR_REDIRECT_URI);

  const supabase = getSupabase();

  // Check OAuth connection
  let oauthConnected = false;
  let oauthData = null;
  try {
    const { data: conn } = await supabase
      .from('google_calendar_connections')
      .select('connected_at, last_sync_at, sync_enabled, push_enabled, calendar_id, google_email, calendars')
      .eq('detailer_id', user.id)
      .single();
    if (conn) {
      oauthConnected = true;
      oauthData = conn;
    }
  } catch {}

  // Check ICS sync status from detailer availability
  let icsUrl = null;
  let icsLastSync = null;
  try {
    const { data: detailer } = await supabase
      .from('detailers')
      .select('availability')
      .eq('id', user.id)
      .single();
    if (detailer?.availability) {
      icsUrl = detailer.availability.icsUrl || null;
      icsLastSync = detailer.availability.icsLastSync || null;
    }
  } catch {}

  if (oauthConnected) {
    return Response.json({
      connected: true,
      method: 'oauth',
      configured,
      connected_at: oauthData.connected_at,
      last_sync_at: oauthData.last_sync_at,
      sync_enabled: oauthData.sync_enabled,
      push_enabled: oauthData.push_enabled,
      calendar_id: oauthData.calendar_id,
      google_email: oauthData.google_email,
      calendars: oauthData.calendars,
      icsUrl,
      icsLastSync,
    });
  }

  return Response.json({
    connected: !!icsUrl,
    method: icsUrl ? 'ics' : null,
    configured,
    icsUrl,
    icsLastSync,
  });
}
