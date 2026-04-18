import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get services
    const { data: services, error } = await supabase
      .from('detailer_services')
      .select('*')
      .eq('detailer_id', user.id)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return Response.json({ services: [], message: 'Table not created yet' });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ services: services || [] });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { service_name, category, hourly_rate, default_hours, requires_return_trip, description } = body;

    if (!service_name) {
      return Response.json({ error: 'Service name required' }, { status: 400 });
    }

    const service_key = `custom_${Date.now()}`;

    // Get max order for this category
    const { data: existing } = await supabase
      .from('detailer_services')
      .select('display_order')
      .eq('detailer_id', user.id)
      .eq('category', category || 'other')
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.display_order || 0) + 1;

    const { data: service, error } = await supabase
      .from('detailer_services')
      .insert({
        detailer_id: user.id,
        service_key,
        service_name,
        description: description || '',
        category: category || 'other',
        hourly_rate: parseFloat(hourly_rate) || 75,
        default_hours: parseFloat(default_hours) || 1,
        requires_return_trip: requires_return_trip || false,
        is_custom: true,
        enabled: true,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ service }, { status: 201 });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// Bulk create services (for importing defaults)
export async function PUT(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { services, categoryKey, clearExisting } = await request.json();

    if (!services || !Array.isArray(services)) {
      return Response.json({ error: 'Services array required' }, { status: 400 });
    }

    // Optionally clear existing services in this category
    if (clearExisting && categoryKey) {
      await supabase
        .from('detailer_services')
        .delete()
        .eq('detailer_id', user.id)
        .eq('category', categoryKey);
    }

    // Insert all services
    const toInsert = services.map((s, i) => ({
      detailer_id: user.id,
      service_key: `${categoryKey}_${Date.now()}_${i}`,
      service_name: s.name,
      description: s.description || '',
      category: categoryKey || 'other',
      hourly_rate: parseFloat(s.rate) || 75,
      default_hours: parseFloat(s.hours) || 1,
      requires_return_trip: s.requires_return_trip || false,
      is_custom: true,
      enabled: true,
      display_order: i + 1,
    }));

    const { data, error } = await supabase
      .from('detailer_services')
      .insert(toInsert)
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ services: data });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
