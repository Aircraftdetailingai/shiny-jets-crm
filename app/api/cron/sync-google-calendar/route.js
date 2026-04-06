import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken, fetchCalendarEvents } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
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
        if (!tokenData) {
          console.warn(`[gcal-sync] Skipping ${conn.detailer_id}: token expired or missing refresh_token — user must reconnect`);
          results.skipped++;
          results.errors.push(`${conn.detailer_id}: skipped — expired token, no refresh_token`);
          continue;
        }

        // Fetch events
        const calData = await fetchCalendarEvents(
          tokenData.accessToken,
          timeMin.toISOString(),
          timeMax.toISOString(),
          conn.sync_token
        );

        if (calData.fullSyncRequired) {
          // Do a full sync without sync token
          const fullData = await fetchCalendarEvents(
            tokenData.accessToken,
            timeMin.toISOString(),
            timeMax.toISOString()
          );
          await processEvents(supabase, conn.detailer_id, fullData.items || []);
          if (fullData.nextSyncToken) {
            await supabase.from('google_calendar_connections')
              .update({ sync_token: fullData.nextSyncToken, last_sync_at: now.toISOString() })
              .eq('detailer_id', conn.detailer_id);
          }
        } else {
          await processEvents(supabase, conn.detailer_id, calData.items || []);
          if (calData.nextSyncToken) {
            await supabase.from('google_calendar_connections')
              .update({ sync_token: calData.nextSyncToken, last_sync_at: now.toISOString() })
              .eq('detailer_id', conn.detailer_id);
          } else {
            await supabase.from('google_calendar_connections')
              .update({ last_sync_at: now.toISOString() })
              .eq('detailer_id', conn.detailer_id);
          }
        }

        results.synced++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${conn.detailer_id}: ${err.message}`);
      }
    }

    return Response.json({ message: 'Sync complete', ...results });
  } catch (err) {
    console.error('Google Calendar cron error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function processEvents(supabase, detailerId, events) {
  if (!events || events.length === 0) return;

  // Get current availability
  const { data: detailer } = await supabase
    .from('detailers')
    .select('availability')
    .eq('id', detailerId)
    .single();

  const availability = detailer?.availability || {};
  const blockedDates = new Set(availability.blockedDates || []);
  const gcalBlockedDates = new Set(availability.gcalBlockedDates || []);

  for (const event of events) {
    if (event.status === 'cancelled') {
      // Remove cancelled events from blocked dates
      const date = extractDate(event);
      if (date) gcalBlockedDates.delete(date);
      continue;
    }

    const date = extractDate(event);
    if (date) {
      gcalBlockedDates.add(date);
      blockedDates.add(date);
    }
  }

  // Update availability
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
}

function extractDate(event) {
  const start = event.start?.date || event.start?.dateTime;
  if (!start) return null;
  return start.split('T')[0];
}
