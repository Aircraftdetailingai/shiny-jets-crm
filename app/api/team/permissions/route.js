import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { DEFAULT_PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Fetch custom permissions for this detailer
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data } = await supabase
      .from('team_permissions')
      .select('permissions')
      .eq('detailer_id', user.id)
      .single();

    // Merge custom overrides with defaults
    const custom = data?.permissions || {};
    const merged = {};
    for (const role of Object.keys(DEFAULT_PERMISSIONS)) {
      merged[role] = { ...DEFAULT_PERMISSIONS[role], ...(custom[role] || {}) };
    }

    return Response.json({
      permissions: merged,
      custom_overrides: custom,
      defaults: DEFAULT_PERMISSIONS,
    });
  } catch (err) {
    console.error('Permissions GET error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Save custom permissions
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { permissions } = await request.json();
    if (!permissions || typeof permissions !== 'object') {
      return Response.json({ error: 'Invalid permissions data' }, { status: 400 });
    }

    // Upsert into team_permissions
    const { error } = await supabase
      .from('team_permissions')
      .upsert({
        detailer_id: user.id,
        permissions,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'detailer_id' });

    if (error) {
      console.error('Permissions save error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Permissions POST error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
