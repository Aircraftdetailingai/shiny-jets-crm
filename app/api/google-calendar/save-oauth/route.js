import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { access_token, refresh_token, email, calendars } = await request.json();

  if (!access_token) {
    return Response.json({ error: 'No access token provided' }, { status: 400 });
  }

  const supabase = getSupabase();

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + 3600);

  // Upsert connection
  const { error: dbError } = await supabase
    .from('google_calendar_connections')
    .upsert({
      detailer_id: user.id,
      access_token,
      refresh_token: refresh_token || null,
      token_expires_at: expiresAt.toISOString(),
      connected_at: new Date().toISOString(),
      google_email: email || null,
      calendars: calendars || null,
    }, { onConflict: 'detailer_id' });

  if (dbError) {
    console.error('Failed to save Google Calendar connection:', dbError);
    // Try without optional columns
    const { error: retryError } = await supabase
      .from('google_calendar_connections')
      .upsert({
        detailer_id: user.id,
        access_token,
        refresh_token: refresh_token || null,
        token_expires_at: expiresAt.toISOString(),
        connected_at: new Date().toISOString(),
      }, { onConflict: 'detailer_id' });

    if (retryError) {
      return Response.json({ error: 'Failed to save: ' + retryError.message }, { status: 500 });
    }
  }

  return Response.json({ success: true, calendars: calendars?.length || 0 });
}
