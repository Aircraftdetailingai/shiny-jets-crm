export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();

    const { data: overrides, error } = await supabase
      .from('detailer_aircraft_overrides')
      .select('*')
      .eq('detailer_id', user.id);

    if (error) {
      console.error('Failed to fetch overrides:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ overrides: overrides || [] });
  } catch (err) {
    console.error('Overrides GET error:', err);
    return Response.json({ error: 'Failed to fetch overrides' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const body = await request.json();
    const { aircraft_id, custom_aircraft_id, service_id, service_name, hours } = body;

    if (!service_name || hours == null) {
      return Response.json({ error: 'service_name and hours are required' }, { status: 400 });
    }

    // Build the upsert row
    const row = {
      detailer_id: user.id,
      aircraft_id: aircraft_id || null,
      custom_aircraft_id: custom_aircraft_id || null,
      service_id: service_id || null,
      service_name,
      hours: parseFloat(hours),
    };

    // Try upsert - find existing override first
    let query = supabase
      .from('detailer_aircraft_overrides')
      .select('id')
      .eq('detailer_id', user.id)
      .eq('service_name', service_name);

    if (aircraft_id) {
      query = query.eq('aircraft_id', aircraft_id);
    } else {
      query = query.is('aircraft_id', null);
    }

    if (custom_aircraft_id) {
      query = query.eq('custom_aircraft_id', custom_aircraft_id);
    } else {
      query = query.is('custom_aircraft_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('detailer_aircraft_overrides')
        .update({ hours: parseFloat(hours), service_id: service_id || null })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Failed to update override:', error);
        return Response.json({ error: error.message }, { status: 500 });
      }
      result = data;
    } else {
      const { data, error } = await supabase
        .from('detailer_aircraft_overrides')
        .insert(row)
        .select()
        .single();

      if (error) {
        console.error('Failed to insert override:', error);
        return Response.json({ error: error.message }, { status: 500 });
      }
      result = data;
    }

    return Response.json({ override: result });
  } catch (err) {
    console.error('Overrides POST error:', err);
    return Response.json({ error: 'Failed to save override' }, { status: 500 });
  }
}
