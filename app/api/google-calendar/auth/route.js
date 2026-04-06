import { getAuthUser } from '@/lib/auth';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ configured: false, error: 'Google Calendar OAuth is not configured yet' });
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';
  const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI || `${appUrl}/api/google-calendar/callback`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    state: user.id,
  });

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  console.log('[gcal-auth] redirect_uri:', JSON.stringify(redirectUri));

  return Response.json({ configured: true, url });
}
