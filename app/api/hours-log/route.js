import { getAuthUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Log per-service actual hours after job completion
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
    const { quote_id, entries } = body;

    if (!quote_id) {
      return Response.json({ error: 'quote_id is required' }, { status: 400 });
    }
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return Response.json({ error: 'entries array is required' }, { status: 400 });
    }

    // Get the quote to find aircraft info
    const { data: quote } = await supabase
      .from('quotes')
      .select('aircraft_id, aircraft_model, aircraft_type')
      .eq('id', quote_id)
      .eq('detailer_id', user.id)
      .single();

    if (!quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Get aircraft details
    let aircraftManufacturer = quote.aircraft_type || '';
    let aircraftModel = quote.aircraft_model || '';

    if (quote.aircraft_id) {
      const { data: aircraft } = await supabase
        .from('aircraft')
        .select('manufacturer, model')
        .eq('id', quote.aircraft_id)
        .single();

      if (aircraft) {
        aircraftManufacturer = aircraft.manufacturer;
        aircraftModel = aircraft.model;
      }
    }

    // Insert hours log entries
    const toInsert = entries.map(entry => ({
      quote_id,
      detailer_id: user.id,
      aircraft_id: quote.aircraft_id || null,
      aircraft_manufacturer: aircraftManufacturer,
      aircraft_model: aircraftModel,
      service_name: entry.service_name,
      hours_field: entry.hours_field || 'ext_wash_hours',
      quoted_hours: parseFloat(entry.quoted_hours) || 0,
      actual_hours: parseFloat(entry.actual_hours) || 0,
    }));

    const { error } = await supabase.from('hours_log').insert(toInsert);

    if (error) {
      console.error('Failed to insert hours log:', error);
      return Response.json({ error: 'Failed to log hours' }, { status: 500 });
    }

    return Response.json({ success: true, logged: toInsert.length });
  } catch (err) {
    console.error('Hours log error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
