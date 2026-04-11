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

async function isAuthorized(request) {
  // Alternate auth via API key (for licensing)
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get('api_key');
  if (apiKey && process.env.BENCHMARKS_API_KEY && apiKey === process.env.BENCHMARKS_API_KEY) {
    return true;
  }

  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

export async function GET(request) {
  try {
    if (!(await isAuthorized(request))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('aggregate_service_hours')
      .select('*');

    if (error) {
      console.error('benchmarks fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ benchmarks: data || [] });
  } catch (e) {
    console.error('benchmarks GET exception:', e);
    return Response.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
