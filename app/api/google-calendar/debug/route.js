import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

function hostOf(raw) {
  try {
    return raw ? new URL(raw).host : null;
  } catch {
    return 'INVALID_URL';
  }
}

export async function GET(request) {
  const host = request.headers.get('host') || null;
  const rawSupabase = process.env.SUPABASE_URL || '';
  const trimmedSupabase = env.SUPABASE_URL || '';

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
    supabase: {
      raw_host: hostOf(rawSupabase.trim()),
      trimmed_host: hostOf(trimmedSupabase),
      raw_len: rawSupabase.length,
      trimmed_len: trimmedSupabase.length,
      needs_trim: rawSupabase.length !== trimmedSupabase.length,
      service_key_set: !!env.SUPABASE_SERVICE_KEY,
    },
  });
}
