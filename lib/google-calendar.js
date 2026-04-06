import { createClient } from '@supabase/supabase-js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

/**
 * Generate Google OAuth authorization URL
 */
export function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code, redirectUri) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri || process.env.GOOGLE_CALENDAR_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || 'Failed to exchange code for tokens');
  }

  return res.json();
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || 'Failed to refresh token');
  }

  return res.json();
}

/**
 * Get a valid access token for a detailer, refreshing if needed.
 * Returns { accessToken, connection } or null if not connected.
 */
export async function getValidAccessToken(detailerId) {
  const supabase = getSupabase();

  const { data: conn } = await supabase
    .from('google_calendar_connections')
    .select('*')
    .eq('detailer_id', detailerId)
    .single();

  if (!conn) return null;

  // Check if token is expired (with 5 minute buffer)
  const expiresAt = new Date(conn.token_expires_at);
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);

  if (now < expiresAt) {
    return { accessToken: conn.access_token, connection: conn };
  }

  // Need to refresh — but check if we have a refresh token
  if (!conn.refresh_token) {
    console.error('Google Calendar token expired and no refresh token available. User must reconnect.');
    return null;
  }

  // Refresh the token
  try {
    const tokens = await refreshAccessToken(conn.refresh_token);

    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (tokens.expires_in || 3600));

    await supabase
      .from('google_calendar_connections')
      .update({
        access_token: tokens.access_token,
        token_expires_at: newExpiresAt.toISOString(),
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      })
      .eq('id', conn.id);

    return { accessToken: tokens.access_token, connection: { ...conn, access_token: tokens.access_token } };
  } catch (err) {
    console.error('Failed to refresh Google Calendar token:', err);
    return null;
  }
}

/**
 * Fetch events from Google Calendar
 */
export async function fetchCalendarEvents(accessToken, timeMin, timeMax, syncToken = null) {
  const params = new URLSearchParams({
    maxResults: '250',
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  if (syncToken) {
    params.set('syncToken', syncToken);
  } else {
    params.set('timeMin', timeMin);
    params.set('timeMax', timeMax);
  }

  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 410) {
      // Sync token expired, need full sync
      return { items: [], nextSyncToken: null, fullSyncRequired: true };
    }
    throw new Error(`Google Calendar API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Create a calendar event in Google Calendar
 */
export async function createCalendarEvent(accessToken, event) {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create calendar event');
  }

  return res.json();
}

/**
 * Update a calendar event in Google Calendar
 */
export async function updateCalendarEvent(accessToken, eventId, event) {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to update calendar event');
  }

  return res.json();
}

/**
 * Delete a calendar event from Google Calendar
 */
export async function deleteCalendarEvent(accessToken, eventId) {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete calendar event: ${res.status}`);
  }
}

/**
 * Push a job (quote) to Google Calendar.
 * Creates or updates the Google Calendar event.
 */
export async function pushJobToGoogleCalendar(detailerId, quote) {
  const tokenData = await getValidAccessToken(detailerId);
  if (!tokenData) return null;

  const supabase = getSupabase();
  const { data: conn } = await supabase
    .from('google_calendar_connections')
    .select('push_enabled')
    .eq('detailer_id', detailerId)
    .single();

  if (!conn?.push_enabled) return null;

  const scheduledDate = quote.scheduled_date;
  if (!scheduledDate) return null;

  const eventData = {
    summary: `${quote.aircraft_model || quote.aircraft_type || 'Aircraft'} - ${quote.client_name || 'Client'}`,
    description: [
      quote.tail_number ? `Tail: ${quote.tail_number}` : null,
      quote.client_email ? `Client: ${quote.client_email}` : null,
      `Quote #${quote.id?.slice(0, 8)}`,
    ].filter(Boolean).join('\n'),
    start: {
      date: scheduledDate.split('T')[0],
    },
    end: {
      date: scheduledDate.split('T')[0],
    },
  };

  try {
    if (quote.google_event_id) {
      // Update existing event
      const event = await updateCalendarEvent(tokenData.accessToken, quote.google_event_id, eventData);
      return event.id;
    } else {
      // Create new event
      const event = await createCalendarEvent(tokenData.accessToken, eventData);
      // Store the Google event ID on the quote
      await supabase
        .from('quotes')
        .update({ google_event_id: event.id })
        .eq('id', quote.id);
      return event.id;
    }
  } catch (err) {
    console.error('Failed to push job to Google Calendar:', err);
    return null;
  }
}
