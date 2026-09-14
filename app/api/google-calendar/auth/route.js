import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import { getAuthUser, verifyToken } from '@/lib/auth';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Sign a short-lived OAuth state so the Google callback can identify the
 * detailer even if the auth_token cookie is missing (common when the UI
 * only has localStorage.vector_token / Bearer).
 */
async function signGcalState({ userId, detailerId }) {
  return new SignJWT({
    purpose: 'gcal_oauth',
    uid: userId,
    did: detailerId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ configured: false, error: 'Google Calendar OAuth is not configured yet' });
  }

  const userId = user.id;
  const detailerId = user.detailer_id || user.id;

  // Re-assert the httpOnly session cookie from the Bearer token the Connect
  // button just sent. Google's redirect is a top-level GET with no Authorization
  // header — without this cookie the callback used to fail with
  // "Authentication required" and then redirect to /settings/integrations,
  // which stripped the error query params so Connections stayed "Not Connected".
  try {
    const authHeader = request.headers.get('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (bearer && (await verifyToken(bearer))) {
      const cookieStore = await cookies();
      cookieStore.set('auth_token', bearer, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      console.log('[gcal-auth] refreshed auth_token cookie for callback');
    }
  } catch (err) {
    console.warn('[gcal-auth] could not refresh auth cookie:', err?.message || err);
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';
  const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI || `${appUrl}/api/google-calendar/callback`;

  // Prefer signed state (detailer_id + user id). Callback still accepts legacy
  // plain user.id for any in-flight redirects.
  let state;
  try {
    state = await signGcalState({ userId, detailerId });
  } catch (err) {
    console.error('[gcal-auth] failed to sign state, falling back to user.id:', err?.message || err);
    state = String(userId);
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  console.log('[gcal-auth] starting OAuth', {
    detailerId,
    userId,
    redirect_uri: redirectUri,
    app_url: appUrl || null,
    state_kind: state === String(userId) ? 'plain' : 'signed',
  });

  return Response.json({ configured: true, url });
}
