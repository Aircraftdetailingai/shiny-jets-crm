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

  // Check OAuth connection.
  // The migration in 20260318_scheduling_integration.sql doesn't include
  // `google_email` or `calendars` — they were added later via save-oauth's
  // upsert. If the production DB is missing those columns the SELECT errors
  // and the entire connection check silently reports "not connected" even
  // though the row exists. Column-stripping retry survives schemas at
  // either tier.
  const detailerId = user.detailer_id || user.id;
  let oauthConnected = false;
  let oauthData = null;
  let needsReconnect = false;
  let cols = ['connected_at', 'last_sync_at', 'sync_enabled', 'push_enabled', 'calendar_id', 'google_email', 'calendars', 'refresh_token', 'token_expires_at', 'needs_reconnect', 'last_sync_error'];
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: conn, error } = await supabase
      .from('google_calendar_connections')
      .select(cols.join(', '))
      .eq('detailer_id', detailerId)
      .maybeSingle();
    if (!error) {
      if (conn) {
        oauthConnected = true;
        oauthData = conn;
        const hasRefreshToken = !!conn.refresh_token;
        // conn.needs_reconnect is set by the sync cron when Google actually
        // rejects the token (revoked refresh_token / 401) — a case a mere
        // refresh_token presence check can't detect.
        needsReconnect = !!conn.needs_reconnect || !hasRefreshToken;
      }
      break;
    }
    const colMatch = error.message?.match(/column [\w."]*\.?"?(\w+)"? does not exist/i)
      || error.message?.match(/Could not find the '([^']+)' column/i);
    const missing = colMatch?.[1];
    if (missing && cols.includes(missing)) {
      cols = cols.filter((c) => c !== missing);
      console.warn('[gcal-status] dropped missing column:', missing);
      continue;
    }
    console.error('[gcal-status] OAuth check error:', error.message);
    break;
  }

  // Check ICS sync status from detailer availability
  let icsUrl = null;
  let icsLastSync = null;
  try {
    const { data: detailer } = await supabase
      .from('detailers')
      .select('availability')
      .eq('id', detailerId)
      .single();
    if (detailer?.availability) {
      icsUrl = detailer.availability.icsUrl || null;
      icsLastSync = detailer.availability.icsLastSync || null;
    }
  } catch {}

  console.log('[gcal-status]', {
    detailerId,
    oauthConnected,
    needsReconnect,
    method: oauthConnected ? 'oauth' : (icsUrl ? 'ics' : null),
  });

  if (oauthConnected) {
    return Response.json({
      connected: true,
      needsReconnect,
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
