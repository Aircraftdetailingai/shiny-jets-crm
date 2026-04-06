import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ configured: false, error: 'Google Calendar OAuth is not configured yet' });
  }

  // Derive redirect URI: env var > app URL > request origin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${appUrl}/api/google-calendar/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    state: user.id,
  });

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  console.log('[gcal-auth] redirect_uri:', redirectUri);
  console.log('[gcal-auth] full URL:', url);

  return Response.json({ configured: true, url, debug: { redirectUri } });
}
