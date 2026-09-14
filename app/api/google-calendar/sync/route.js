import { createAdminClient } from '@/lib/supabase-admin';
import { getAuthUser } from '@/lib/auth';
import { getValidAccessToken, fetchCalendarEvents } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createAdminClient();
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const detailerId = user.detailer_id || user.id;
  const tokenData = await getValidAccessToken(detailerId);
  if (!tokenData?.accessToken) {
    const authFail = !tokenData || tokenData.refreshError === 'missing_refresh_token' || /invalid_grant|401|unauthorized/i.test(tokenData.refreshError || '');
    return Response.json({ error: 'Google Calendar not connected — reconnect required', reconnect: !!authFail, refreshError: tokenData?.refreshError || null }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get existing sync token
  const { data: conn } = await supabase
    .from('google_calendar_connections')
    .select('sync_token')
    .eq('detailer_id', detailerId)
    .single();

  // Sync window: 30 days back, 90 days forward
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 90);

  try {
    let result = await fetchCalendarEvents(
      tokenData.accessToken,
      timeMin.toISOString(),
      timeMax.toISOString(),
      conn?.sync_token || null
    );

    // If sync token expired, do full sync
    if (result.fullSyncRequired) {
      result = await fetchCalendarEvents(
        tokenData.accessToken,
        timeMin.toISOString(),
        timeMax.toISOString()
      );
      // Clear existing events for full sync
      await supabase
        .from('google_calendar_events')
        .delete()
        .eq('detailer_id', detailerId);
    }

    const events = result.items || [];
    let synced = 0;
    let deleted = 0;

    for (const event of events) {
      if (event.status === 'cancelled') {
        // Remove cancelled events
        await supabase
          .from('google_calendar_events')
          .delete()
          .eq('detailer_id', detailerId)
          .eq('google_event_id', event.id);
        deleted++;
        continue;
      }

      // Skip events without start/end times
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      if (!start || !end) continue;

      const isAllDay = !!event.start?.date;

      await supabase
        .from('google_calendar_events')
        .upsert({
          detailer_id: detailerId,
          google_event_id: event.id,
          summary: event.summary || '(No title)',
          description: event.description || null,
          start_time: start,
          end_time: end,
          all_day: isAllDay,
          status: event.status || 'confirmed',
          synced_at: new Date().toISOString(),
        }, { onConflict: 'detailer_id,google_event_id' });

      synced++;
    }

    // Save sync token and update last_sync_at
    const updates = { last_sync_at: new Date().toISOString() };
    if (result.nextSyncToken) {
      updates.sync_token = result.nextSyncToken;
    }

    updates.needs_reconnect = false;
    updates.last_sync_error = null;
    await supabase
      .from('google_calendar_connections')
      .update(updates)
      .eq('detailer_id', detailerId);

    return Response.json({ success: true, synced, deleted });
  } catch (err) {
    console.error('Google Calendar sync error:', err);
    return Response.json({ error: 'Sync failed: ' + err.message }, { status: 500 });
  }
}
