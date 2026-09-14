import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function getSupabase() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const settingsUrl = '/settings/integrations';

  if (error) {
    return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent(error)}`, url.origin));
  }

  if (!code) {
    return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent('No authorization code received')}`, url.origin));
  }

  // Verify user authentication
  const authUser = await getAuthUser(request);
  if (!authUser?.id) {
    return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent('Authentication required')}`, url.origin));
  }
  // The OAuth `auth` route signs state with user.id (whatever shape the JWT
  // carried). Match against the same value here. For owner JWTs user.id IS
  // the detailer id, but the connection row keys on detailer_id, so resolve
  // separately for the upsert.
  const userId = authUser.id;
  const detailerId = authUser.detailer_id || authUser.id;

  // Verify state matches user ID (CSRF protection)
  if (state !== userId) {
    return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent('Invalid state parameter')}`, url.origin));
  }

  try {
    const appUrl = env.NEXT_PUBLIC_APP_URL || url.origin;
    const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI || `${appUrl}/api/google-calendar/callback`;

    console.log('[gcal-callback] redirect_uri:', JSON.stringify(redirectUri));
    console.log('[gcal-callback] client_id:', JSON.stringify(env.GOOGLE_CLIENT_ID));

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('[gcal-callback] Token exchange failed:', JSON.stringify(err));
      throw new Error(err.error_description || err.error || 'Token exchange failed');
    }

    const tokens = await tokenRes.json();
    console.log('[gcal-callback] Token exchange success, has refresh_token:', !!tokens.refresh_token);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 3600));

    const supabase = getSupabase();

    // Google often omits refresh_token on re-consent even with prompt=consent.
    // Never overwrite a stored refresh_token with null/undefined.
    let refreshToken = tokens.refresh_token || null;
    if (!refreshToken) {
      const { data: existing } = await supabase
        .from('google_calendar_connections')
        .select('refresh_token')
        .eq('detailer_id', detailerId)
        .maybeSingle();
      refreshToken = existing?.refresh_token || null;
      if (!refreshToken) {
        console.warn('[gcal-callback] No refresh_token from Google and none stored — reconnect will fail after access token expires');
      } else {
        console.log('[gcal-callback] Preserved existing refresh_token (Google omitted a new one)');
      }
    }

    let upsertRow = {
      detailer_id: detailerId,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_expires_at: expiresAt.toISOString(),
      connected_at: new Date().toISOString(),
      needs_reconnect: false,
      last_sync_error: null,
    };
    let dbError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase
        .from('google_calendar_connections')
        .upsert(upsertRow, { onConflict: 'detailer_id' });
      dbError = res.error;
      if (!dbError) break;
      const colMatch = dbError.message?.match(/column "([^"]+)" of relation "google_calendar_connections" does not exist/)
        || dbError.message?.match(/Could not find the '([^']+)' column/i);
      const missing = colMatch?.[1];
      if (missing && upsertRow[missing] !== undefined) {
        delete upsertRow[missing];
        continue;
      }
      break;
    }

    if (dbError) {
      console.error('Failed to store Google Calendar connection:', dbError);
      return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent('Failed to save connection: ' + dbError.message)}`, url.origin));
    }
    console.log('[gcal-callback] connection persisted for detailer:', detailerId);

    return Response.redirect(new URL(`${settingsUrl}?gcal=success`, url.origin));
  } catch (err) {
    console.error('Google Calendar callback error:', err);
    return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent(err.message)}`, url.origin));
  }
}
