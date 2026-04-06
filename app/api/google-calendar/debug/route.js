import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const host = request.headers.get('host') || null;

  const redirectUri = env.GOOGLE_CALENDAR_REDIRECT_URI || `${env.NEXT_PUBLIC_APP_URL}/api/google-calendar/callback`;

  return Response.json({
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL || null,
    GOOGLE_CALENDAR_REDIRECT_URI: env.GOOGLE_CALENDAR_REDIRECT_URI || null,
    GOOGLE_CLIENT_ID_prefix: env.GOOGLE_CLIENT_ID ? `${env.GOOGLE_CLIENT_ID.slice(0, 20)}...` : null,
    GOOGLE_CLIENT_SECRET_set: !!env.GOOGLE_CLIENT_SECRET,
    request_host: host,
    derived_redirect_uri: redirectUri,
    expected: 'https://crm.shinyjets.com/api/google-calendar/callback',
    match: redirectUri === 'https://crm.shinyjets.com/api/google-calendar/callback',
    raw_lengths: {
      GOOGLE_CALENDAR_REDIRECT_URI: (process.env.GOOGLE_CALENDAR_REDIRECT_URI || '').length,
      trimmed: env.GOOGLE_CALENDAR_REDIRECT_URI.length,
      diff: (process.env.GOOGLE_CALENDAR_REDIRECT_URI || '').length - env.GOOGLE_CALENDAR_REDIRECT_URI.length,
    },
  });
}
