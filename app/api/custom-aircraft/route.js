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

    const { data: aircraft, error } = await supabase
      .from('custom_aircraft')
      .select('*')
      .eq('detailer_id', user.id)
      .order('manufacturer')
      .order('model');

    if (error) {
      console.error('Failed to fetch custom aircraft:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Fetch service hours for all custom aircraft
    const aircraftIds = (aircraft || []).map(a => a.id);
    let serviceHoursMap = {};

    if (aircraftIds.length > 0) {
      const { data: hours, error: hErr } = await supabase
        .from('custom_aircraft_service_hours')
        .select('*')
        .in('custom_aircraft_id', aircraftIds);

      if (!hErr && hours) {
        for (const h of hours) {
          if (!serviceHoursMap[h.custom_aircraft_id]) {
            serviceHoursMap[h.custom_aircraft_id] = [];
          }
          serviceHoursMap[h.custom_aircraft_id].push(h);
        }
      }
    }

    const result = (aircraft || []).map(a => ({
      ...a,
      service_hours: serviceHoursMap[a.id] || [],
    }));

    return Response.json({ aircraft: result });
  } catch (err) {
    console.error('Custom aircraft GET error:', err);
    return Response.json({ error: 'Failed to fetch custom aircraft' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const body = await request.json();
    const { manufacturer, model, category, notes, service_hours } = body;

    if (!manufacturer || !model) {
      return Response.json({ error: 'Manufacturer and model are required' }, { status: 400 });
    }

    const { data: aircraft, error } = await supabase
      .from('custom_aircraft')
      .insert({
        detailer_id: user.id,
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        category: category || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create custom aircraft:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Insert service hours if provided
    if (service_hours && service_hours.length > 0) {
      const rows = service_hours
        .filter(sh => sh.hours > 0)
        .map(sh => ({
          custom_aircraft_id: aircraft.id,
          detailer_id: user.id,
          service_id: sh.service_id || null,
          service_name: sh.service_name,
          hours: parseFloat(sh.hours),
        }));

      if (rows.length > 0) {
        const { error: shErr } = await supabase
          .from('custom_aircraft_service_hours')
          .insert(rows);

        if (shErr) {
          console.error('Failed to insert service hours:', shErr);
        }
      }
    }

    return Response.json({ aircraft }, { status: 201 });
  } catch (err) {
    console.error('Custom aircraft POST error:', err);
    return Response.json({ error: 'Failed to create custom aircraft' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return Response.json({ error: 'Aircraft id is required' }, { status: 400 });
    }

    // Delete service hours first (in case no cascade)
    await supabase
      .from('custom_aircraft_service_hours')
      .delete()
      .eq('custom_aircraft_id', id)
      .eq('detailer_id', user.id);

    const { error } = await supabase
      .from('custom_aircraft')
      .delete()
      .eq('id', id)
      .eq('detailer_id', user.id);

    if (error) {
      console.error('Failed to delete custom aircraft:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Custom aircraft DELETE error:', err);
    return Response.json({ error: 'Failed to delete custom aircraft' }, { status: 500 });
  }
}
