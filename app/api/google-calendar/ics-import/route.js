import { createAdminClient } from '@/lib/supabase-admin';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createAdminClient();
}

// POST - Import events from an ICS/iCal URL
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { icsUrl } = await request.json();
  if (!icsUrl) return Response.json({ error: 'ICS URL is required' }, { status: 400 });

  // Validate URL format
  try {
    const parsed = new URL(icsUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return Response.json({ error: 'URL must use https' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  try {
    // Fetch the ICS file
    const res = await fetch(icsUrl, {
      headers: { 'User-Agent': 'ShinyjetsCalendarSync/1.0' },
    });

    if (!res.ok) {
      return Response.json({ error: `Failed to fetch calendar: ${res.status}` }, { status: 400 });
    }

    const icsText = await res.text();

    if (!icsText.includes('BEGIN:VCALENDAR')) {
      return Response.json({ error: 'URL does not contain valid iCal data' }, { status: 400 });
    }

    // Parse ICS events
    const events = parseICSEvents(icsText);

    if (events.length === 0) {
      return Response.json({ error: 'No events found in calendar' }, { status: 400 });
    }

    // Filter to future events only (past 7 days through next 90 days)
    const now = new Date();
    const pastCutoff = new Date(now);
    pastCutoff.setDate(pastCutoff.getDate() - 7);
    const futureCutoff = new Date(now);
    futureCutoff.setDate(futureCutoff.getDate() + 90);

    const relevantEvents = events.filter(e => {
      const start = new Date(e.start_time);
      return start >= pastCutoff && start <= futureCutoff;
    });

    // Store as blocked dates in detailer availability
    const supabase = getSupabase();

    // Get current availability
    const { data: detailer } = await supabase
      .from('detailers')
      .select('availability')
      .eq('id', user.id)
      .single();

    const availability = detailer?.availability || {};
    const blockedDates = availability.blockedDates || [];

    // Add event dates as blocked dates (deduplicate)
    const existingSet = new Set(blockedDates);
    let added = 0;

    for (const event of relevantEvents) {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);

      // Block each day of the event
      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        if (!existingSet.has(dateStr)) {
          existingSet.add(dateStr);
          added++;
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // Save updated blocked dates
    const updatedAvailability = {
      ...availability,
      blockedDates: Array.from(existingSet).sort(),
      icsUrl,
      icsLastSync: new Date().toISOString(),
    };

    await supabase
      .from('detailers')
      .update({ availability: updatedAvailability })
      .eq('id', user.id);

    // Also store events in google_calendar_events table for calendar display
    const eventRows = relevantEvents.map(e => ({
      detailer_id: user.detailer_id || user.id,
      google_event_id: `ics-${e.uid || Math.random().toString(36).slice(2)}`,
      summary: e.summary || 'Busy',
      description: e.description || null,
      start_time: e.start_time,
      end_time: e.end_time,
      all_day: e.all_day || false,
      status: 'confirmed',
      synced_at: new Date().toISOString(),
    }));

    if (eventRows.length > 0) {
      // Clear previous ICS imports for this user
      await supabase
        .from('google_calendar_events')
        .delete()
        .eq('detailer_id', user.detailer_id || user.id)
        .like('google_event_id', 'ics-%');

      // Insert new events
      await supabase
        .from('google_calendar_events')
        .insert(eventRows);
    }

    return Response.json({
      success: true,
      totalEvents: events.length,
      relevantEvents: relevantEvents.length,
      blockedDatesAdded: added,
      totalBlockedDates: existingSet.size,
    });
  } catch (err) {
    console.error('[ics-import] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Parse VEVENT blocks from ICS text.
 * Handles DTSTART/DTEND with date-only (all-day) and datetime formats.
 */
function parseICSEvents(icsText) {
  const events = [];
  // Unfold long lines (RFC 5545: lines starting with space/tab are continuations)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let event = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      event = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      inEvent = false;
      if (event.start_time) {
        events.push(event);
      }
      continue;
    }

    if (!inEvent) continue;

    // Parse property:value or property;params:value
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const propPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trim();
    const propName = propPart.split(';')[0].toUpperCase();

    switch (propName) {
      case 'SUMMARY':
        event.summary = value;
        break;
      case 'DESCRIPTION':
        event.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ',');
        break;
      case 'UID':
        event.uid = value;
        break;
      case 'DTSTART':
        event.start_time = parseICSDate(value);
        if (value.length === 8) event.all_day = true; // YYYYMMDD = all-day
        break;
      case 'DTEND':
        event.end_time = parseICSDate(value);
        break;
      case 'STATUS':
        if (value.toUpperCase() === 'CANCELLED') event.cancelled = true;
        break;
    }

    // If no DTEND, set end = start + 1 day (for all-day) or start + 1 hour
    if (event.start_time && !event.end_time) {
      const end = new Date(event.start_time);
      if (event.all_day) {
        end.setDate(end.getDate() + 1);
      } else {
        end.setHours(end.getHours() + 1);
      }
      event.end_time = end.toISOString();
    }
  }

  // Filter out cancelled events
  return events.filter(e => !e.cancelled);
}

/**
 * Parse ICS date format: YYYYMMDD or YYYYMMDDTHHmmssZ or YYYYMMDDTHHMMSS
 */
function parseICSDate(value) {
  // Remove TZID prefix if present
  const clean = value.replace(/^TZID=[^:]+:/, '');

  if (clean.length === 8) {
    // YYYYMMDD (all-day)
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00.000Z`;
  }

  if (clean.length >= 15) {
    // YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const h = clean.slice(9, 11);
    const min = clean.slice(11, 13);
    const s = clean.slice(13, 15);
    const isUtc = clean.endsWith('Z');
    return `${y}-${m}-${d}T${h}:${min}:${s}.000${isUtc ? 'Z' : ''}`;
  }

  // Fallback: try native parsing
  return new Date(value).toISOString();
}
