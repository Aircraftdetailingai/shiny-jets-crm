import { getAuthUser } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// GET — find next available slot for a given duration
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const durationHours = parseFloat(searchParams.get('duration') || '4');
  const excludeWeekends = searchParams.get('excludeWeekends') !== 'false';

  const tokenData = await getValidAccessToken(user.id);
  if (!tokenData) {
    return Response.json({ connected: false, suggested: null });
  }

  try {
    // Query free/busy for next 14 days
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 14);

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
      return Response.json({ connected: true, suggested: null, error: 'Calendar API error' });
    }

    const data = await res.json();
    const busySlots = (data.calendars?.primary?.busy || []).map(b => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));

    // Find first available slot that fits the duration
    const durationMs = durationHours * 60 * 60 * 1000;
    const workStart = 8; // 8 AM
    const workEnd = 17; // 5 PM
    const leadDays = 2; // minimum 2 days out

    const startSearch = new Date(now);
    startSearch.setDate(startSearch.getDate() + leadDays);
    startSearch.setHours(workStart, 0, 0, 0);

    for (let day = 0; day < 14; day++) {
      const candidate = new Date(startSearch);
      candidate.setDate(candidate.getDate() + day);

      // Skip weekends if requested
      const dow = candidate.getDay();
      if (excludeWeekends && (dow === 0 || dow === 6)) continue;

      // Try each hour slot in the work day
      for (let hour = workStart; hour <= workEnd - Math.ceil(durationHours); hour++) {
        const slotStart = new Date(candidate);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + durationMs);

        // Check if slot end exceeds work hours
        if (slotEnd.getHours() > workEnd || (slotEnd.getHours() === workEnd && slotEnd.getMinutes() > 0)) {
          if (slotEnd.toDateString() === slotStart.toDateString()) continue;
        }

        // Check if slot conflicts with any busy period
        const conflicts = busySlots.some(busy =>
          (slotStart < busy.end && slotEnd > busy.start)
        );

        if (!conflicts) {
          return Response.json({
            connected: true,
            suggested: {
              date: slotStart.toISOString().split('T')[0],
              time: `${String(hour).padStart(2, '0')}:00`,
              endTime: `${String(Math.floor(hour + durationHours)).padStart(2, '0')}:${String(Math.round((durationHours % 1) * 60)).padStart(2, '0')}`,
              dayName: slotStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            },
            busyCount: busySlots.length,
          });
        }
      }
    }

    // No slot found in 14 days
    return Response.json({ connected: true, suggested: null, message: 'No available slots in next 14 days' });
  } catch (err) {
    return Response.json({ connected: true, suggested: null, error: err.message });
  }
}
