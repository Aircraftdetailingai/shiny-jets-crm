import { getAuthUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// Common airport coordinates (ICAO and IATA codes)
const AIRPORT_COORDS = {
  // Major US
  KJFK: { lat: 40.6413, lon: -73.7781, name: 'JFK' }, JFK: { lat: 40.6413, lon: -73.7781, name: 'JFK' },
  KLAX: { lat: 33.9425, lon: -118.4081, name: 'LAX' }, LAX: { lat: 33.9425, lon: -118.4081, name: 'LAX' },
  KORD: { lat: 41.9742, lon: -87.9073, name: "O'Hare" }, ORD: { lat: 41.9742, lon: -87.9073, name: "O'Hare" },
  KATL: { lat: 33.6407, lon: -84.4277, name: 'Atlanta' }, ATL: { lat: 33.6407, lon: -84.4277, name: 'Atlanta' },
  KDFW: { lat: 32.8998, lon: -97.0403, name: 'DFW' }, DFW: { lat: 32.8998, lon: -97.0403, name: 'DFW' },
  KDEN: { lat: 39.8561, lon: -104.6737, name: 'Denver' }, DEN: { lat: 39.8561, lon: -104.6737, name: 'Denver' },
  KSFO: { lat: 37.6213, lon: -122.379, name: 'SFO' }, SFO: { lat: 37.6213, lon: -122.379, name: 'SFO' },
  KLAS: { lat: 36.08, lon: -115.1522, name: 'Las Vegas' }, LAS: { lat: 36.08, lon: -115.1522, name: 'Las Vegas' },
  KMIA: { lat: 25.7959, lon: -80.287, name: 'Miami' }, MIA: { lat: 25.7959, lon: -80.287, name: 'Miami' },
  KPHX: { lat: 33.4373, lon: -112.0078, name: 'Phoenix' }, PHX: { lat: 33.4373, lon: -112.0078, name: 'Phoenix' },
  KIAH: { lat: 29.9844, lon: -95.3414, name: 'Houston IAH' }, IAH: { lat: 29.9844, lon: -95.3414, name: 'Houston IAH' },
  KHOU: { lat: 29.6454, lon: -95.2789, name: 'Houston Hobby' }, HOU: { lat: 29.6454, lon: -95.2789, name: 'Houston Hobby' },
  KSEA: { lat: 47.4502, lon: -122.3088, name: 'Seattle' }, SEA: { lat: 47.4502, lon: -122.3088, name: 'Seattle' },
  KMSP: { lat: 44.8848, lon: -93.2223, name: 'Minneapolis' }, MSP: { lat: 44.8848, lon: -93.2223, name: 'Minneapolis' },
  KDTW: { lat: 42.2124, lon: -83.3534, name: 'Detroit' }, DTW: { lat: 42.2124, lon: -83.3534, name: 'Detroit' },
  KBOS: { lat: 42.3656, lon: -71.0096, name: 'Boston' }, BOS: { lat: 42.3656, lon: -71.0096, name: 'Boston' },
  KEWR: { lat: 40.6895, lon: -74.1745, name: 'Newark' }, EWR: { lat: 40.6895, lon: -74.1745, name: 'Newark' },
  KLGA: { lat: 40.7769, lon: -73.8740, name: 'LaGuardia' }, LGA: { lat: 40.7769, lon: -73.8740, name: 'LaGuardia' },
  KPHL: { lat: 39.8721, lon: -75.2408, name: 'Philadelphia' }, PHL: { lat: 39.8721, lon: -75.2408, name: 'Philadelphia' },
  KCLT: { lat: 35.214, lon: -80.9431, name: 'Charlotte' }, CLT: { lat: 35.214, lon: -80.9431, name: 'Charlotte' },
  KMCO: { lat: 28.4312, lon: -81.308, name: 'Orlando' }, MCO: { lat: 28.4312, lon: -81.308, name: 'Orlando' },
  KTPA: { lat: 27.9755, lon: -82.5332, name: 'Tampa' }, TPA: { lat: 27.9755, lon: -82.5332, name: 'Tampa' },
  KFLL: { lat: 26.0726, lon: -80.1527, name: 'Fort Lauderdale' }, FLL: { lat: 26.0726, lon: -80.1527, name: 'Fort Lauderdale' },
  KSAN: { lat: 32.7338, lon: -117.1933, name: 'San Diego' }, SAN: { lat: 32.7338, lon: -117.1933, name: 'San Diego' },
  KPDX: { lat: 45.5898, lon: -122.5951, name: 'Portland' }, PDX: { lat: 45.5898, lon: -122.5951, name: 'Portland' },
  KSLC: { lat: 40.7884, lon: -111.9778, name: 'Salt Lake City' }, SLC: { lat: 40.7884, lon: -111.9778, name: 'Salt Lake City' },
  KAUS: { lat: 30.1975, lon: -97.6664, name: 'Austin' }, AUS: { lat: 30.1975, lon: -97.6664, name: 'Austin' },
  KSAT: { lat: 29.5337, lon: -98.4698, name: 'San Antonio' }, SAT: { lat: 29.5337, lon: -98.4698, name: 'San Antonio' },
  KBNA: { lat: 36.1245, lon: -86.6782, name: 'Nashville' }, BNA: { lat: 36.1245, lon: -86.6782, name: 'Nashville' },
  KRDU: { lat: 35.8776, lon: -78.7875, name: 'Raleigh' }, RDU: { lat: 35.8776, lon: -78.7875, name: 'Raleigh' },
  KBWI: { lat: 39.1754, lon: -76.6684, name: 'Baltimore' }, BWI: { lat: 39.1754, lon: -76.6684, name: 'Baltimore' },
  KDCA: { lat: 38.8521, lon: -77.0377, name: 'Reagan' }, DCA: { lat: 38.8521, lon: -77.0377, name: 'Reagan' },
  KIAD: { lat: 38.9531, lon: -77.4565, name: 'Dulles' }, IAD: { lat: 38.9531, lon: -77.4565, name: 'Dulles' },
  KSTL: { lat: 38.7487, lon: -90.37, name: 'St. Louis' }, STL: { lat: 38.7487, lon: -90.37, name: 'St. Louis' },
  KMCI: { lat: 39.2976, lon: -94.7139, name: 'Kansas City' }, MCI: { lat: 39.2976, lon: -94.7139, name: 'Kansas City' },
  KPIT: { lat: 40.4915, lon: -80.2329, name: 'Pittsburgh' }, PIT: { lat: 40.4915, lon: -80.2329, name: 'Pittsburgh' },
  KCLE: { lat: 41.4117, lon: -81.8498, name: 'Cleveland' }, CLE: { lat: 41.4117, lon: -81.8498, name: 'Cleveland' },
  KMDW: { lat: 41.786, lon: -87.7524, name: 'Midway' }, MDW: { lat: 41.786, lon: -87.7524, name: 'Midway' },
  KTEB: { lat: 40.8501, lon: -74.0608, name: 'Teterboro' }, TEB: { lat: 40.8501, lon: -74.0608, name: 'Teterboro' },
  KVNY: { lat: 34.2098, lon: -118.4898, name: 'Van Nuys' }, VNY: { lat: 34.2098, lon: -118.4898, name: 'Van Nuys' },
  KSDL: { lat: 33.6229, lon: -111.9107, name: 'Scottsdale' }, SDL: { lat: 33.6229, lon: -111.9107, name: 'Scottsdale' },
  KPBI: { lat: 26.6832, lon: -80.0956, name: 'Palm Beach' }, PBI: { lat: 26.6832, lon: -80.0956, name: 'Palm Beach' },
  KAPA: { lat: 39.5701, lon: -104.8493, name: 'Centennial' }, APA: { lat: 39.5701, lon: -104.8493, name: 'Centennial' },
  KOPF: { lat: 25.907, lon: -80.2784, name: 'Opa-locka' }, OPF: { lat: 25.907, lon: -80.2784, name: 'Opa-locka' },
  KHPN: { lat: 41.067, lon: -73.7076, name: 'Westchester' }, HPN: { lat: 41.067, lon: -73.7076, name: 'Westchester' },
  KFRG: { lat: 40.7288, lon: -73.4134, name: 'Farmingdale' }, FRG: { lat: 40.7288, lon: -73.4134, name: 'Farmingdale' },
  KADS: { lat: 32.9686, lon: -96.8364, name: 'Addison' }, ADS: { lat: 32.9686, lon: -96.8364, name: 'Addison' },
  KBJC: { lat: 39.9089, lon: -105.1172, name: 'Broomfield' }, BJC: { lat: 39.9089, lon: -105.1172, name: 'Broomfield' },
  // International
  EGLL: { lat: 51.4775, lon: -0.4614, name: 'Heathrow' }, LHR: { lat: 51.4775, lon: -0.4614, name: 'Heathrow' },
  CYYZ: { lat: 43.6777, lon: -79.6248, name: 'Toronto' }, YYZ: { lat: 43.6777, lon: -79.6248, name: 'Toronto' },
  CYVR: { lat: 49.1967, lon: -123.1815, name: 'Vancouver' }, YVR: { lat: 49.1967, lon: -123.1815, name: 'Vancouver' },
  YSSY: { lat: -33.9461, lon: 151.1772, name: 'Sydney' }, SYD: { lat: -33.9461, lon: 151.1772, name: 'Sydney' },
  NZAA: { lat: -37.0082, lon: 174.7850, name: 'Auckland' }, AKL: { lat: -37.0082, lon: 174.7850, name: 'Auckland' },
  OMDB: { lat: 25.2528, lon: 55.3644, name: 'Dubai' }, DXB: { lat: 25.2528, lon: 55.3644, name: 'Dubai' },
  VHHH: { lat: 22.3080, lon: 113.9185, name: 'Hong Kong' }, HKG: { lat: 22.3080, lon: 113.9185, name: 'Hong Kong' },
  WSSS: { lat: 1.3644, lon: 103.9915, name: 'Singapore' }, SIN: { lat: 1.3644, lon: 103.9915, name: 'Singapore' },
};

// WMO weather code descriptions
const WMO_CODES = {
  0: { desc: 'Clear sky', icon: '☀️', rain: false },
  1: { desc: 'Mainly clear', icon: '🌤️', rain: false },
  2: { desc: 'Partly cloudy', icon: '⛅', rain: false },
  3: { desc: 'Overcast', icon: '☁️', rain: false },
  45: { desc: 'Fog', icon: '🌫️', rain: false },
  48: { desc: 'Icy fog', icon: '🌫️', rain: false },
  51: { desc: 'Light drizzle', icon: '🌦️', rain: true },
  53: { desc: 'Drizzle', icon: '🌦️', rain: true },
  55: { desc: 'Heavy drizzle', icon: '🌧️', rain: true },
  61: { desc: 'Light rain', icon: '🌦️', rain: true },
  63: { desc: 'Rain', icon: '🌧️', rain: true },
  65: { desc: 'Heavy rain', icon: '🌧️', rain: true },
  66: { desc: 'Freezing rain', icon: '🌧️', rain: true },
  67: { desc: 'Heavy freezing rain', icon: '🌧️', rain: true },
  71: { desc: 'Light snow', icon: '🌨️', rain: true },
  73: { desc: 'Snow', icon: '🌨️', rain: true },
  75: { desc: 'Heavy snow', icon: '❄️', rain: true },
  77: { desc: 'Snow grains', icon: '🌨️', rain: true },
  80: { desc: 'Light showers', icon: '🌦️', rain: true },
  81: { desc: 'Showers', icon: '🌧️', rain: true },
  82: { desc: 'Heavy showers', icon: '🌧️', rain: true },
  85: { desc: 'Light snow showers', icon: '🌨️', rain: true },
  86: { desc: 'Heavy snow showers', icon: '❄️', rain: true },
  95: { desc: 'Thunderstorm', icon: '⛈️', rain: true },
  96: { desc: 'Thunderstorm + hail', icon: '⛈️', rain: true },
  99: { desc: 'Thunderstorm + heavy hail', icon: '⛈️', rain: true },
};

function getWeatherInfo(code) {
  return WMO_CODES[code] || { desc: 'Unknown', icon: '🌡️', rain: false };
}

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    let airport = url.searchParams.get('airport');

    // If no airport provided, fetch from user's profile
    if (!airport) {
      const supabase = getSupabase();
      const { data: detailer } = await supabase
        .from('detailers')
        .select('home_airport')
        .eq('id', user.id)
        .single();
      airport = detailer?.home_airport;
    }

    if (!airport) {
      return Response.json({ error: 'No airport configured', needsSetup: true }, { status: 400 });
    }

    const code = airport.toUpperCase().trim();
    const coords = AIRPORT_COORDS[code];
    if (!coords) {
      return Response.json({ error: `Unknown airport code: ${code}. Use ICAO or IATA code.` }, { status: 400 });
    }

    // Also fetch scheduled jobs for weather warnings
    const supabase = getSupabase();
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    const [weatherRes, jobsRes] = await Promise.all([
      // Fetch 7-day forecast from Open-Meteo (5s timeout)
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`,
        { signal: AbortSignal.timeout(5000) }
      ),
      // Fetch upcoming scheduled jobs
      supabase
        .from('quotes')
        .select('id, client_name, aircraft_model, scheduled_date, total_price')
        .eq('detailer_id', user.id)
        .gte('scheduled_date', today)
        .lte('scheduled_date', sevenDays)
        .in('status', ['paid', 'scheduled', 'in_progress'])
        .order('scheduled_date', { ascending: true }),
    ]);

    if (!weatherRes.ok) {
      return Response.json({ error: 'Failed to fetch weather data' }, { status: 502 });
    }

  const weather = await weatherRes.json();
  const jobs = jobsRes.data || [];

  // Build current conditions
  const current = {
    temp: Math.round(weather.current?.temperature_2m || 0),
    weatherCode: weather.current?.weather_code ?? 0,
    ...getWeatherInfo(weather.current?.weather_code ?? 0),
    windSpeed: Math.round(weather.current?.wind_speed_10m || 0),
    humidity: weather.current?.relative_humidity_2m || 0,
  };

  // Build 7-day forecast
  const daily = weather.daily;
  const forecast = (daily?.time || []).map((date, i) => {
    const code = daily.weather_code[i];
    const info = getWeatherInfo(code);
    return {
      date,
      dayName: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      tempMax: Math.round(daily.temperature_2m_max[i]),
      tempMin: Math.round(daily.temperature_2m_min[i]),
      weatherCode: code,
      ...info,
      precipitation: daily.precipitation_sum[i],
      precipProbability: daily.precipitation_probability_max[i],
      windMax: Math.round(daily.wind_speed_10m_max[i]),
    };
  });

  // Generate weather warnings for scheduled job days
  const warnings = [];
  for (const job of jobs) {
    const jobDate = job.scheduled_date?.split('T')[0];
    const dayForecast = forecast.find(f => f.date === jobDate);
    if (dayForecast && dayForecast.rain) {
      warnings.push({
        jobId: job.id,
        clientName: job.client_name,
        aircraft: job.aircraft_model,
        date: jobDate,
        dayName: dayForecast.dayName,
        weather: dayForecast.desc,
        icon: dayForecast.icon,
        precipProbability: dayForecast.precipProbability,
        precipitation: dayForecast.precipitation,
      });
    }
  }

  return Response.json({
    airport: { code, name: coords.name },
    current,
    forecast,
    warnings,
    scheduledJobs: jobs.length,
  });
  } catch (err) {
    console.error('Weather API error:', err.message);
    return Response.json({ error: 'Weather temporarily unavailable' }, { status: 502 });
  }
}
