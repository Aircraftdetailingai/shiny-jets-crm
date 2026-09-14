import { getAuthUser } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * GET — find open days from Google Calendar free/busy.
 * Query: duration (hours), excludeWeekends (default true), days (search window, default 21), limit (max open days, default 8)
 * Does NOT invent availability when calendar is empty/disconnected — returns openDays: [].
 */
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const durationHours = parseFloat(searchParams.get('duration') || '4');
  const excludeWeekends = searchParams.get('excludeWeekends') !== 'false';
  const searchDays = Math.min(Math.max(parseInt(searchParams.get('days') || '21', 10) || 21, 7), 60);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '8', 10) || 8, 1), 20);

  const tokenData = await getValidAccessToken(user.id);
  if (!tokenData) {
    return Response.json({
      connected: false,
      suggested: null,
      openDays: [],
      reconnect: true,
      message: 'Google Calendar not connected',
    });
  }

  try {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + searchDays);

    const res = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: 'primary' }],
      }),
    });

    if (!res.ok) {
      return Response.json({
        connected: true,
        suggested: null,
        openDays: [],
        error: 'Calendar API error',
      });
    }

    const data = await res.json();
    const busySlots = (data.calendars?.primary?.busy || []).map(b => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));

    const durationMs = durationHours * 60 * 60 * 1000;
    const workStart = 8; // 8 AM
    const workEnd = 17; // 5 PM
    const leadDays = 2;

    const startSearch = new Date(now);
    startSearch.setDate(startSearch.getDate() + leadDays);
    startSearch.setHours(workStart, 0, 0, 0);

    const openDays = [];
    const seenDates = new Set();

    for (let day = 0; day < searchDays && openDays.length < limit; day++) {
      const candidate = new Date(startSearch);
      candidate.setDate(candidate.getDate() + day);

      const dow = candidate.getDay();
      if (excludeWeekends && (dow === 0 || dow === 6)) continue;

      const dateStr = candidate.toISOString().split('T')[0];
      if (seenDates.has(dateStr)) continue;

      let daySlot = null;
      for (let hour = workStart; hour <= workEnd - Math.ceil(durationHours); hour++) {
        const slotStart = new Date(candidate);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + durationMs);

        if (slotEnd.getHours() > workEnd || (slotEnd.getHours() === workEnd && slotEnd.getMinutes() > 0)) {
          if (slotEnd.toDateString() === slotStart.toDateString()) continue;
        }

        const conflicts = busySlots.some(busy =>
          (slotStart < busy.end && slotEnd > busy.start)
        );

        if (!conflicts) {
          daySlot = {
            date: dateStr,
            time: `${String(hour).padStart(2, '0')}:00`,
            endTime: `${String(Math.floor(hour + durationHours)).padStart(2, '0')}:${String(Math.round((durationHours % 1) * 60)).padStart(2, '0')}`,
            dayName: slotStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
          };
          break;
        }
      }

      if (daySlot) {
        seenDates.add(dateStr);
        openDays.push(daySlot);
      }
    }

    const suggested = openDays[0] || null;

    if (!suggested) {
      return Response.json({
        connected: true,
        suggested: null,
        openDays: [],
        busyCount: busySlots.length,
        message: `No available slots in next ${searchDays} days`,
      });
    }

    return Response.json({
      connected: true,
      suggested,
      openDays,
      busyCount: busySlots.length,
    });
  } catch (err) {
    return Response.json({
      connected: true,
      suggested: null,
      openDays: [],
      error: err.message,
    });
  }
}
