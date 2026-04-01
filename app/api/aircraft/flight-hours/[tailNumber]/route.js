import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET /api/aircraft/flight-hours/[tailNumber]
// TODO: Integrate with FAA ADS-B API or FlightAware API when ready.
// Will be used to track how long protective coatings last between services
// and correlate flight hours with surface degradation for coating longevity research.
export async function GET(request, { params }) {
  const { tailNumber } = await params;

  if (!tailNumber) {
    return Response.json({ error: 'Tail number required' }, { status: 400 });
  }

  const tail = tailNumber.toUpperCase();
  const supabase = getSupabase();

  // Check if we have cached flight hours for this tail number
  const { data: customer } = await supabase
    .from('customers')
    .select('tail_number, last_flight_hours, flight_hours_updated_at')
    .eq('tail_number', tail)
    .order('flight_hours_updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (customer?.last_flight_hours) {
    return Response.json({
      tail_number: tail,
      flight_hours: customer.last_flight_hours,
      last_updated: customer.flight_hours_updated_at,
      source: 'cached',
    });
  }

  // TODO: Query external API (FAA ADS-B, FlightAware, etc.)
  // For now return placeholder indicating no data available
  return Response.json({
    tail_number: tail,
    flight_hours: null,
    last_updated: null,
    source: 'not_available',
    message: 'Flight hours tracking coming soon',
  });
}
