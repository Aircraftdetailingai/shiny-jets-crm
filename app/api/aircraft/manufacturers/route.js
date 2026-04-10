import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('aircraft')
    .select('manufacturer')
    .order('manufacturer');

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch manufacturers' }), { status: 500 });
  }

  const manufacturers = new Set(data.map(a => a.manufacturer));

  // If authenticated, include custom aircraft manufacturers
  const user = await getAuthUser(request);
  if (user?.id) {
    const { data: custom } = await supabase
      .from('custom_aircraft')
      .select('manufacturer')
      .eq('detailer_id', user.id);

    if (custom) {
      for (const c of custom) manufacturers.add(c.manufacturer);
    }
  }

  const sorted = [...manufacturers].sort((a, b) => a.localeCompare(b));
  return new Response(JSON.stringify({ manufacturers: sorted }), { status: 200 });
}
