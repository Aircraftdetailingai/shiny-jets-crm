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

  const { access_token, refresh_token, email, calendars } = await request.json();

  if (!access_token) {
    return Response.json({ error: 'No access token provided' }, { status: 400 });
  }

  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + 3600);

  // Preserve existing refresh_token if Supabase/Google session didn't return one
  // (common on reconnect — otherwise we wipe the only durable credential).
  let refreshToken = refresh_token || null;
  if (!refreshToken) {
    const { data: existing } = await supabase
      .from('google_calendar_connections')
      .select('refresh_token')
      .eq('detailer_id', detailerId)
      .maybeSingle();
    refreshToken = existing?.refresh_token || null;
  }
  if (!refreshToken) {
    console.warn('[gcal-save-oauth] missing refresh_token', { detailerId });
    return Response.json({
      error: 'No refresh token available. Re-authorize Google Calendar with offline access (prompt=consent).',
    }, { status: 400 });
  }

  // Upsert connection — clear reconnect flag so UI stops prompting immediately
  const { error: dbError } = await supabase
    .from('google_calendar_connections')
    .upsert({
      detailer_id: detailerId,
      access_token,
      refresh_token: refreshToken,
      token_expires_at: expiresAt.toISOString(),
      connected_at: new Date().toISOString(),
      google_email: email || null,
      calendars: calendars || null,
      needs_reconnect: false,
      last_sync_error: null,
    }, { onConflict: 'detailer_id' });

  if (dbError) {
    console.error('[gcal-save-oauth] upsert failed:', { message: dbError.message, code: dbError.code || null, detailerId });
    // Try without optional columns
    const { error: retryError } = await supabase
      .from('google_calendar_connections')
      .upsert({
        detailer_id: detailerId,
        access_token,
        refresh_token: refreshToken,
        token_expires_at: expiresAt.toISOString(),
        connected_at: new Date().toISOString(),
        needs_reconnect: false,
        last_sync_error: null,
      }, { onConflict: 'detailer_id' });

    if (retryError) {
      console.error('[gcal-save-oauth] retry upsert failed:', { message: retryError.message, code: retryError.code || null, detailerId });
      return Response.json({ error: 'Failed to save: ' + retryError.message }, { status: 500 });
    }
  }

  console.log('[gcal-save-oauth] connection saved', { detailerId, calendars: calendars?.length || 0, has_refresh: !!refreshToken, email: email || null });
  return Response.json({ success: true, calendars: calendars?.length || 0 });
}
