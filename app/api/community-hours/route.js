import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Fetch community average hours for a given aircraft make/model
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const make = searchParams.get('make');
    const model = searchParams.get('model');

    if (!make || !model) {
      return Response.json({ error: 'make and model required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('hours_contributions')
      .select('service_type, contributed_hrs')
      .ilike('make', make)
      .ilike('model', model)
      .eq('accepted', true);

    if (error) {
      console.error('Community hours query error:', error);
      return Response.json({ hours: {} });
    }

    // Group by service_type and compute averages
    const groups = {};
    for (const row of (data || [])) {
      if (!groups[row.service_type]) {
        groups[row.service_type] = [];
      }
      groups[row.service_type].push(parseFloat(row.contributed_hrs) || 0);
    }

    // Only return groups with 3+ samples
    const hours = {};
    for (const [serviceType, values] of Object.entries(groups)) {
      if (values.length >= 3) {
        const sum = values.reduce((a, b) => a + b, 0);
        hours[serviceType] = {
          avg_hours: Math.round((sum / values.length) * 100) / 100,
          sample_count: values.length,
        };
      }
    }

    return Response.json({ hours });
  } catch (err) {
    console.error('Community hours error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
