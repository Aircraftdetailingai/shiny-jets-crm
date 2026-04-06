import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
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
  let userId;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) throw new Error('Not authenticated');
    const payload = await verifyToken(token);
    userId = payload.id;
  } catch {
    return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent('Authentication required')}`, url.origin));
  }

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
    const { error: dbError } = await supabase
      .from('google_calendar_connections')
      .upsert({
        detailer_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        connected_at: new Date().toISOString(),
      }, { onConflict: 'detailer_id' });

    if (dbError) {
      console.error('Failed to store Google Calendar connection:', dbError);
      return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent('Failed to save connection')}`, url.origin));
    }

    return Response.redirect(new URL(`${settingsUrl}?gcal=success`, url.origin));
  } catch (err) {
    console.error('Google Calendar callback error:', err);
    return Response.redirect(new URL(`${settingsUrl}?gcal=error&message=${encodeURIComponent(err.message)}`, url.origin));
  }
}
