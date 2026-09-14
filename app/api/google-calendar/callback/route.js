import { createAdminClient } from '@/lib/supabase-admin';
import { getAuthUser, verifyToken } from '@/lib/auth';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SETTINGS_URL = '/settings/connections';

function getSupabase() {
  return createAdminClient();
}

function redirectToConnections(origin, params) {
  const q = new URLSearchParams(params);
  return Response.redirect(new URL(`${SETTINGS_URL}?${q.toString()}`, origin));
}

/**
 * Resolve detailer identity from OAuth state.
 * Supports:
 *  - signed JWT { purpose:'gcal_oauth', uid, did } (current)
 *  - legacy plain user.id / detailer_id string
 */
async function resolveState(state, authUser) {
  if (!state) return { ok: false, message: 'Missing state parameter' };

  // Try signed state first. Signed state is authoritative: it was minted
  // after Bearer auth on Connect. A stale auth_token cookie from another
  // CRM account on the same browser (demo / prior login) must NOT reject
  // the upsert — that was silently keeping Shiny Jets "Not Connected"
  // while Google Allow succeeded and tokens landed on the wrong detailer.
  const verified = await verifyToken(state);
  if (verified?.purpose === 'gcal_oauth' && verified.did) {
    const detailerId = verified.did;
    const userId = verified.uid || verified.did;
    if (authUser?.id) {
      const authDetailer = authUser.detailer_id || authUser.id;
      const matches =
        authUser.id === userId ||
        authDetailer === detailerId ||
        authUser.id === detailerId;
      if (!matches) {
        console.warn('[gcal-callback] cookie mismatch ignored; trusting signed state', {
          stateDid: detailerId,
          authId: authUser.id,
          authDetailer,
        });
      }
    }
    return { ok: true, detailerId, userId, stateKind: 'signed' };
  }

  // Legacy: state was raw user.id. Require cookie and match.
  if (!authUser?.id) {
    return { ok: false, message: 'Authentication required' };
  }
  if (state !== authUser.id && state !== (authUser.detailer_id || authUser.id)) {
    console.warn('[gcal-callback] legacy state mismatch', {
      statePrefix: String(state).slice(0, 8),
      authIdPrefix: String(authUser.id).slice(0, 8),
    });
    return { ok: false, message: 'Invalid state parameter' };
  }
  return {
    ok: true,
    detailerId: authUser.detailer_id || authUser.id,
    userId: authUser.id,
    stateKind: 'legacy',
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const origin = url.origin;

  if (error) {
    console.warn('[gcal-callback] Google returned error:', error);
    return redirectToConnections(origin, { gcal: 'error', message: error });
  }

  if (!code) {
    return redirectToConnections(origin, {
      gcal: 'error',
      message: 'No authorization code received',
    });
  }

  const authUser = await getAuthUser(request);
  const resolved = await resolveState(state, authUser);
  if (!resolved.ok) {
    console.warn('[gcal-callback] state/auth failed:', resolved.message, {
      hasCookie: !!authUser?.id,
      stateLen: state?.length || 0,
    });
    return redirectToConnections(origin, { gcal: 'error', message: resolved.message });
  }

  const { detailerId, stateKind } = resolved;

  try {
    // Must match the redirect_uri used in /auth (Google requires exact match).
    const redirectUri =
      env.GOOGLE_CALENDAR_REDIRECT_URI ||
      `${(env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '')}/api/google-calendar/callback`;

    console.log('[gcal-callback] exchanging code', {
      detailerId,
      stateKind,
      redirect_uri: redirectUri,
      hasCookie: !!authUser?.id,
      client_id_prefix: env.GOOGLE_CLIENT_ID ? `${env.GOOGLE_CLIENT_ID.slice(0, 12)}…` : null,
    });

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
      console.error('[gcal-callback] Token exchange failed:', {
        status: tokenRes.status,
        error: err.error || null,
        error_description: err.error_description || null,
      });
      throw new Error(err.error_description || err.error || 'Token exchange failed');
    }

    const tokens = await tokenRes.json();
    console.log('[gcal-callback] Token exchange success', {
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      expires_in: tokens.expires_in || null,
      scope: tokens.scope || null,
    });

    if (!tokens.access_token) {
      throw new Error('Google did not return an access token');
    }

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
        console.warn('[gcal-callback] No refresh_token from Google and none stored');
        return redirectToConnections(origin, {
          gcal: 'error',
          message:
            'Google did not return a refresh token. Disconnect any prior access in your Google Account permissions, then try Connect again.',
        });
      }
      console.log('[gcal-callback] Preserved existing refresh_token (Google omitted a new one)');
    }

    // Best-effort: capture Google account email for the Connections UI
    let googleEmail = null;
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        googleEmail = info.email || null;
      }
    } catch {
      // non-fatal
    }

    let upsertRow = {
      detailer_id: detailerId,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_expires_at: expiresAt.toISOString(),
      connected_at: new Date().toISOString(),
      needs_reconnect: false,
      last_sync_error: null,
      ...(googleEmail ? { google_email: googleEmail } : {}),
    };

    let dbError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase
        .from('google_calendar_connections')
        .upsert(upsertRow, { onConflict: 'detailer_id' });
      dbError = res.error;
      if (!dbError) break;
      const colMatch =
        dbError.message?.match(/column "([^"]+)" of relation "google_calendar_connections" does not exist/) ||
        dbError.message?.match(/Could not find the '([^']+)' column/i);
      const missing = colMatch?.[1];
      if (missing && upsertRow[missing] !== undefined) {
        console.warn('[gcal-callback] dropping missing column and retrying:', missing);
        delete upsertRow[missing];
        continue;
      }
      break;
    }

    if (dbError) {
      console.error('[gcal-callback] Failed to store connection:', {
        message: dbError.message,
        code: dbError.code || null,
        detailerId,
      });
      return redirectToConnections(origin, {
        gcal: 'error',
        message: 'Failed to save connection: ' + dbError.message,
      });
    }

    console.log('[gcal-callback] connection persisted', {
      detailerId,
      googleEmail: googleEmail || null,
      needs_reconnect: false,
    });

    return redirectToConnections(origin, { gcal: 'success' });
  } catch (err) {
    console.error('[gcal-callback] error:', err?.message || err);
    return redirectToConnections(origin, {
      gcal: 'error',
      message: err.message || 'Google Calendar connection failed',
    });
  }
}
