import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

export async function GET(request) {
  try {
    if (!(await isAdmin(request))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('aggregate_calibration_adoption')
      .select('*');

    if (error) {
      console.error('calibration-adoption fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ adoption: data || [] });
  } catch (e) {
    console.error('calibration-adoption GET exception:', e);
    return Response.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
