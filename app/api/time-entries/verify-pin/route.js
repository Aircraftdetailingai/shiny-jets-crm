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

    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, name, type')
      .eq('pin_code', pin_code)
      .eq('status', 'active')
      .single();

    if (error || !member) {
      return Response.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    return Response.json({ name: member.name, type: member.type });

  } catch (err) {
    console.error('PIN verify error:', err);
    return Response.json({ error: 'Failed to verify PIN' }, { status: 500 });
  }
}
