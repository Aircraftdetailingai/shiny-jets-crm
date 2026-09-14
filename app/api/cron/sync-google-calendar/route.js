import { getValidAccessToken, fetchCalendarEvents } from '@/lib/google-calendar';
import { createAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  // Use trimmed env + cache:'no-store' — raw process.env.SUPABASE_URL on
  // Vercel currently has a trailing newline, and uncached reads prevent
  // stale needs_reconnect decisions.
  return createAdminClient();
}

// Update a connection row, dropping columns the current schema doesn't have
// (matches the codebase's column-strip pattern) so a not-yet-applied
// needs_reconnect/last_sync_error migration never breaks the sync.
async function updateConnection(supabase, detailerId, fields) {
  let row = { ...fields };
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase
      .from('google_calendar_connections')
      .update(row)
      .eq('detailer_id', detailerId);
    if (!error) return;
    const colMatch = error.message?.match(/column "([^"]+)" of relation "google_calendar_connections" does not exist/)
      || error.message?.match(/Could not find the '([^']+)' column/i);
    const missing = colMatch?.[1];
    if (missing && row[missing] !== undefined) {
      delete row[missing];
      if (Object.keys(row).length === 0) return;
      continue;
    }
    console.error(`[gcal-sync] connection update failed for detailer=${detailerId}:`, error.message);
    return;
  }
}

// A revoked/expired Google auth surfaces either as a null token from
// getValidAccessToken (refresh threw invalid_grant) or a 401 from the
// Calendar API. Detect the auth-failure shape so we only prompt reconnect
// for genuine auth problems, not transient network/5xx errors.
function isAuthError(err) {
  const msg = (err?.message || String(err || '')).toLowerCase();
  return msg.includes('401') || msg.includes('invalid_grant') || msg.includes('unauthorized') || msg.includes('invalid credentials');
}

export async function GET(request) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !process.env.VERCEL_URL?.includes('localhost')) {
    // Also allow if no CRON_SECRET is set (development)
    if (process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabase();
  const results = { synced: 0, failed: 0, skipped: 0, errors: [] };

  try {
    // Find all active Google Calendar connections
    const { data: connections } = await supabase
      .from('google_calendar_connections')
      .select('detailer_id, sync_token')
      .not('access_token', 'is', null);

    if (!connections || connections.length === 0) {
      return Response.json({ message: 'No connections to sync', ...results });
    }

    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setDate(timeMin.getDate() - 1);
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + 90);

    for (const conn of connections) {
      try {
        // Get valid access token (refreshes if expired)
        const tokenData = await getValidAccessToken(conn.detailer_id);
        if (!tokenData?.accessToken) {
          const refreshErr = tokenData?.refreshError || 'token_refresh_failed';
          console.warn(`[gcal-sync] Skipping ${conn.detailer_id}: ${refreshErr}`);
          results.skipped++;
          results.errors.push(`${conn.detailer_id}: skipped — ${refreshErr}`);
          // Only prompt reconnect for missing refresh_token or Google auth
          // rejection (invalid_grant / 401). Transient network errors leave
          // needs_reconnect untouched so a repaired connection is not flipped
          // back to RECONNECT REQUIRED by one bad cron tick.
          if (refreshErr === 'missing_refresh_token' || isAuthError(refreshErr)) {
            await updateConnection(supabase, conn.detailer_id, {
              needs_reconnect: true,
              last_sync_error: String(refreshErr).slice(0, 300),
            });
          } else {
            await updateConnection(supabase, conn.detailer_id, {
              last_sync_error: `Token refresh failed (will retry): ${String(refreshErr).slice(0, 200)}`,
            });
          }
          continue;
        }

        // Fetch events
        const calData = await fetchCalendarEvents(
          tokenData.accessToken,
          timeMin.toISOString(),
          timeMax.toISOString(),
          conn.sync_token
        );

        let items = [];
        let nextSyncToken = null;
        if (calData.fullSyncRequired) {
          // Sync token expired; redo full sync without one.
          const fullData = await fetchCalendarEvents(
            tokenData.accessToken,
            timeMin.toISOString(),
            timeMax.toISOString()
          );
          items = fullData.items || [];
          nextSyncToken = fullData.nextSyncToken || null;
        } else {
          items = calData.items || [];
          nextSyncToken = calData.nextSyncToken || null;
        }

        const processed = await processEvents(supabase, conn.detailer_id, items);
        console.log(`[gcal-sync] detailer=${conn.detailer_id} pulled=${items.length} upserted=${processed.upserted} cancelled=${processed.cancelled} fullSync=${!!calData.fullSyncRequired}`);

        const tokenUpdate = nextSyncToken
          ? { sync_token: nextSyncToken, last_sync_at: now.toISOString() }
          : { last_sync_at: now.toISOString() };
        // Successful sync clears any stale reconnect flag.
        await updateConnection(supabase, conn.detailer_id, {
          ...tokenUpdate,
          needs_reconnect: false,
          last_sync_error: null,
        });

        results.synced++;
      } catch (err) {
        console.error(`[gcal-sync] detailer=${conn.detailer_id} error:`, err?.message || err);
        results.failed++;
        results.errors.push(`${conn.detailer_id}: ${err.message}`);
        // Only prompt reconnect for genuine auth failures (401/invalid_grant),
        // not transient network/5xx errors that will recover on their own.
        if (isAuthError(err)) {
          await updateConnection(supabase, conn.detailer_id, {
            needs_reconnect: true,
            last_sync_error: `Calendar sync failed: ${err.message}`.slice(0, 300),
          });
        }
      }
    }

    return Response.json({ message: 'Sync complete', ...results });
  } catch (err) {
    console.error('Google Calendar cron error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function processEvents(supabase, detailerId, events) {
  const summary = { upserted: 0, cancelled: 0 };
  if (!events || events.length === 0) return summary;

  // Get current availability so we can reconcile cron output with manual blocks.
  const { data: detailer } = await supabase
    .from('detailers')
    .select('availability')
    .eq('id', detailerId)
    .single();

  const availability = detailer?.availability || {};
  const blockedDates = new Set(availability.blockedDates || []);
  const gcalBlockedDates = new Set(availability.gcalBlockedDates || []);

  // 1) Upsert non-cancelled events into google_calendar_events. The events
  // GET endpoint reads from this table, so without these rows the in-CRM
  // Schedule view shows nothing even though availability.blockedDates is
  // populated. Cancelled events trigger row deletion + date un-block.
  const upsertRows = [];
  const cancelledIds = [];
  for (const event of events) {
    if (!event.id) continue;
    if (event.status === 'cancelled') {
      cancelledIds.push(event.id);
      const date = extractDate(event);
      if (date) gcalBlockedDates.delete(date);
      continue;
    }

    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date || startTime;
    if (!startTime) continue;

    upsertRows.push({
      detailer_id: detailerId,
      google_event_id: event.id,
      summary: event.summary || null,
      description: event.description || null,
      start_time: startTime,
      end_time: endTime,
      all_day: !!event.start?.date && !event.start?.dateTime,
      status: event.status || 'confirmed',
      synced_at: new Date().toISOString(),
    });

    const date = extractDate(event);
    if (date) {
      gcalBlockedDates.add(date);
      blockedDates.add(date);
    }
  }

  if (upsertRows.length > 0) {
    const { error: upsertErr } = await supabase
      .from('google_calendar_events')
      .upsert(upsertRows, { onConflict: 'detailer_id,google_event_id' });
    if (upsertErr) {
      console.error(`[gcal-sync] upsert failed for detailer=${detailerId}:`, upsertErr.message);
    } else {
      summary.upserted = upsertRows.length;
    }
  }

  if (cancelledIds.length > 0) {
    const { error: delErr } = await supabase
      .from('google_calendar_events')
      .delete()
      .eq('detailer_id', detailerId)
      .in('google_event_id', cancelledIds);
    if (delErr) {
      console.error(`[gcal-sync] cancel-delete failed for detailer=${detailerId}:`, delErr.message);
    } else {
      summary.cancelled = cancelledIds.length;
    }
  }

  // 2) Update availability blocked-date sets — this is what
  // /api/quotes/[id]/availability and the customer-facing booking calendar
  // already read, so this keeps existing booking gating working unchanged.
  await supabase
    .from('detailers')
    .update({
      availability: {
        ...availability,
        blockedDates: [...blockedDates].sort(),
        gcalBlockedDates: [...gcalBlockedDates].sort(),
      },
    })
    .eq('id', detailerId);

  return summary;
}

function extractDate(event) {
  const start = event.start?.date || event.start?.dateTime;
  if (!start) return null;
  return start.split('T')[0];
}
