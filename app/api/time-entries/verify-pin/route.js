import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { pin_code } = await request.json();

    if (!pin_code) {
      return Response.json({ error: 'PIN is required' }, { status: 400 });
    }

    // Fetch ALL active matches for this PIN (platform-wide) and never auto-pick.
    const { data: members, error } = await supabase
      .from('team_members')
      .select('id, name, type')
      .eq('pin_code', pin_code)
      .eq('status', 'active');

    if (error) {
      console.error('[verify-pin] member lookup failed:', error.message);
      return Response.json({ error: 'Failed to verify PIN' }, { status: 500 });
    }
    const active = members || [];
    if (active.length === 0) {
      return Response.json({ error: 'Invalid PIN' }, { status: 401 });
    }
    if (active.length > 1) {
      return Response.json({ error: 'This PIN matches more than one worker. Contact your manager for a unique PIN.', code: 'pin_ambiguous' }, { status: 409 });
    }

    return Response.json({ name: active[0].name, type: active[0].type });

  } catch (err) {
    console.error('PIN verify error:', err);
    return Response.json({ error: 'Failed to verify PIN' }, { status: 500 });
  }
}
