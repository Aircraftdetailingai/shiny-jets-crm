import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';
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

function resolveRedirectUri(request) {
  // Prefer explicit env; otherwise build from the browser Origin / Host so
  // crm.shinyjets.com stays consistent even if NEXT_PUBLIC_APP_URL drifts.
  if (env.GOOGLE_CALENDAR_REDIRECT_URI) return env.GOOGLE_CALENDAR_REDIRECT_URI;
  const origin =
    request.headers.get('origin') ||
    (() => {
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      return host ? `${proto}://${host}` : '';
    })() ||
    env.NEXT_PUBLIC_APP_URL ||
    '';
  return origin ? `${origin.replace(/\/$/, '')}/api/google-calendar/callback` : '';
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ configured: false, error: 'Google Calendar OAuth is not configured yet' });
  }

  const userId = user.id;
  const detailerId = user.detailer_id || user.id;

  // Build JSON response first so we can attach Set-Cookie on the SAME
  // NextResponse. cookies().set() + bare Response.json() often drops the
  // cookie in App Router — leaving a stale auth_token from another CRM
  // account (e.g. demo) that then fails signed-state mismatch checks.
  let bearer = null;
  try {
    const authHeader = request.headers.get('authorization');
    bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (bearer && !(await verifyToken(bearer))) bearer = null;
  } catch {
    bearer = null;
  }

  const redirectUri = resolveRedirectUri(request);
  if (!redirectUri) {
    return NextResponse.json({ configured: false, error: 'Google Calendar redirect URI is not configured' });
  }

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
    app_url: env.NEXT_PUBLIC_APP_URL || null,
    state_kind: state === String(userId) ? 'plain' : 'signed',
    will_set_cookie: !!bearer,
  });

  const res = NextResponse.json({ configured: true, url });
  if (bearer) {
    res.cookies.set('auth_token', bearer, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }
  return res;
}
