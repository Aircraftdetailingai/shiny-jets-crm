export const dynamic = 'force-dynamic';

export async function GET(request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || null;
  const envRedirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || null;
  const clientId = process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 20)}...` : null;
  const hasSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  const origin = request.headers.get('origin') || null;
  const host = request.headers.get('host') || null;

  const derivedRedirectUri = envRedirectUri || (appUrl ? `${appUrl}/api/google-calendar/callback` : null);

  return Response.json({
    NEXT_PUBLIC_APP_URL: appUrl,
    GOOGLE_CALENDAR_REDIRECT_URI_env: envRedirectUri,
    GOOGLE_CLIENT_ID_prefix: clientId,
    GOOGLE_CLIENT_SECRET_set: hasSecret,
    request_origin: origin,
    request_host: host,
    derived_redirect_uri: derivedRedirectUri,
    expected: 'https://crm.shinyjets.com/api/google-calendar/callback',
    match: derivedRedirectUri === 'https://crm.shinyjets.com/api/google-calendar/callback',
  });
}
