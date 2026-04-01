import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Convert US N-number to ICAO24 hex code
// FAA N-numbers map to ICAO24 addresses in the range A00001-AFFFFF
function nNumberToIcao24(nNumber) {
  const n = nNumber.toUpperCase().replace(/^N/, '');
  if (!n || n.length < 1) return null;

  // Simplified mapping: numeric-only N-numbers
  // Full mapping requires FAA suffix encoding tables
  const num = parseInt(n.replace(/[^0-9]/g, ''));
  if (isNaN(num) || num < 1) return null;

  // US ICAO24 range starts at 0xA00001
  const icao = (0xA00001 + num).toString(16).toLowerCase();
  return icao;
}

// GET /api/aircraft/flight-hours/[tailNumber]
export async function GET(request, { params }) {
  const { tailNumber } = await params;
  if (!tailNumber) return Response.json({ error: 'Tail number required' }, { status: 400 });

  const tail = tailNumber.toUpperCase();
  const supabase = getSupabase();

  // Check cache first
  const { data: cached } = await supabase
    .from('customers')
    .select('tail_number, last_flight_hours, flight_hours_updated_at')
    .eq('tail_number', tail)
    .order('flight_hours_updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const cacheAge = cached?.flight_hours_updated_at
    ? (Date.now() - new Date(cached.flight_hours_updated_at).getTime()) / (1000 * 60 * 60)
    : Infinity;

  // Return cache if less than 24 hours old
  if (cached?.last_flight_hours && cacheAge < 24) {
    return Response.json({
      tail_number: tail,
      flight_hours: cached.last_flight_hours,
      last_updated: cached.flight_hours_updated_at,
      source: 'cached',
    });
  }

  // Check detailer plan for enterprise features
  let plan = 'free';
  try {
    const user = await getAuthUser(request);
    if (user) {
      const { data: detailer } = await supabase.from('detailers').select('plan').eq('id', user.id).single();
      plan = detailer?.plan || 'free';
    }
  } catch {}

  // Enterprise: FlightAware AeroAPI (placeholder)
  if (plan === 'enterprise') {
    // TODO: Integrate FlightAware AeroAPI
    // Requires FLIGHTAWARE_API_KEY env var
    // Endpoint: https://aeroapi.flightaware.com/aeroapi/flights/{tail}
    return Response.json({
      tail_number: tail,
      flight_hours: null,
      last_updated: null,
      source: 'flightaware',
      status: 'coming_soon',
      message: 'FlightAware integration coming soon for Enterprise plan',
    });
  }

  // Free/Pro/Business: OpenSky Network (free, no API key required)
  try {
    const icao24 = nNumberToIcao24(tail);
    if (!icao24) {
      return Response.json({
        tail_number: tail,
        flight_hours: null,
        source: 'opensky',
        message: 'Could not convert tail number to ICAO24 address',
      });
    }

    // Query OpenSky for current state
    const stateRes = await fetch(`https://opensky-network.org/api/states/all?icao24=${icao24}`, {
      headers: { 'User-Agent': 'ShinyjetsAviation/1.0' },
    });

    let lastSeen = null;
    let onGround = null;

    if (stateRes.ok) {
      const stateData = await stateRes.json();
      const state = stateData.states?.[0];
      if (state) {
        lastSeen = state[4] ? new Date(state[4] * 1000).toISOString() : null; // last contact
        onGround = state[8]; // on_ground boolean
      }
    }

    // Query OpenSky flight history (last 30 days)
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

    const flightsRes = await fetch(
      `https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${thirtyDaysAgo}&end=${now}`,
      { headers: { 'User-Agent': 'ShinyjetsAviation/1.0' } }
    );

    let estimatedHours = null;
    let flightCount = 0;

    if (flightsRes.ok) {
      const flights = await flightsRes.json();
      flightCount = flights.length;
      // Estimate flight hours from departure/arrival times
      let totalSeconds = 0;
      for (const f of flights) {
        if (f.firstSeen && f.lastSeen) {
          totalSeconds += f.lastSeen - f.firstSeen;
        }
      }
      estimatedHours = Math.round((totalSeconds / 3600) * 10) / 10;
    }

    return Response.json({
      tail_number: tail,
      icao24,
      flight_hours: estimatedHours,
      flight_count_30d: flightCount,
      last_seen: lastSeen,
      on_ground: onGround,
      period: '30 days',
      source: 'opensky',
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({
      tail_number: tail,
      flight_hours: null,
      source: 'opensky',
      error: err.message,
      message: 'OpenSky Network temporarily unavailable',
    });
  }
}
