import { createClient } from '@supabase/supabase-js';
import { US_AIRPORTS, AIRPORT_MAP } from '@/lib/airports';
import Link from 'next/link';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function generateStaticParams() {
  return US_AIRPORTS.map((a) => ({ icao: a.icao }));
}

export async function generateMetadata({ params }) {
  const { icao } = await params;
  const airport = AIRPORT_MAP[icao?.toUpperCase()];
  if (!airport) {
    return { title: 'Airport Not Found | Vector' };
  }
  const title = `Aircraft Detailing at ${airport.name} (${airport.icao}) | Vector`;
  const description = `Find professional aircraft detailing services at ${airport.name} in ${airport.city}, ${airport.state}. Browse verified aviation detailers, request quotes, and keep your aircraft looking its best at ${airport.icao}.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://app.vectorav.ai/airport/${airport.icao}`,
      siteName: 'Vector Aviation',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `https://app.vectorav.ai/airport/${airport.icao}`,
    },
  };
}

async function getDetailersAtAirport(icao) {
  const supabase = getSupabase();
  if (!supabase) return [];

  // Find detailers where home_airport matches OR airports_served contains this ICAO
  const { data, error } = await supabase
    .from('detailers')
    .select('id, name, company, country, home_airport, airports_served, preferred_currency, plan, theme_logo_url')
    .eq('listed_in_directory', true)
    .eq('status', 'active')
    .in('plan', ['pro', 'business', 'enterprise']);

  if (error || !data) return [];

  // Filter to detailers at this airport
  const upper = icao.toUpperCase();
  const matched = data.filter(d => {
    if (d.home_airport?.toUpperCase() === upper) return true;
    if (Array.isArray(d.airports_served) && d.airports_served.some(a => a?.toUpperCase() === upper)) return true;
    return false;
  });

  // Attach review stats
  if (matched.length > 0) {
    const ids = matched.map(d => d.id);
    const { data: reviews } = await supabase
      .from('feedback')
      .select('detailer_id, rating')
      .in('detailer_id', ids)
      .eq('is_public', true);

    const statsMap = {};
    for (const r of (reviews || [])) {
      if (!statsMap[r.detailer_id]) statsMap[r.detailer_id] = { total: 0, sum: 0 };
      statsMap[r.detailer_id].total++;
      statsMap[r.detailer_id].sum += r.rating;
    }

    return matched.map(d => ({
      ...d,
      review_count: statsMap[d.id]?.total || 0,
      avg_rating: statsMap[d.id] ? parseFloat((statsMap[d.id].sum / statsMap[d.id].total).toFixed(1)) : null,
    }));
  }

  return matched;
}

function StarRating({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} className={`w-4 h-4 ${s <= Math.round(rating) ? 'text-amber-400' : 'text-white/10'}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

function NearbyAirports({ current }) {
  if (!current) return null;
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dist = (a, b) => {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 0.621371; // miles
  };

  const nearby = US_AIRPORTS
    .filter(a => a.icao !== current.icao)
    .map(a => ({ ...a, distance: dist(current, a) }))
    .filter(a => a.distance <= 100)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);

  if (nearby.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="text-2xl font-bold text-white mb-6">Nearby Airports</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {nearby.map(a => (
          <Link
            key={a.icao}
            href={`/airport/${a.icao}`}
            className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-colors group"
          >
            <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">{a.icao}</p>
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{a.name}</p>
            <p className="text-xs text-gray-500 mt-1">{Math.round(a.distance)} mi away</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export const dynamicParams = false;
export const revalidate = 3600; // Revalidate every hour

export default async function AirportPage({ params }) {
  const { icao } = await params;
  const airport = AIRPORT_MAP[icao?.toUpperCase()];

  if (!airport) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Airport Not Found</h1>
          <p className="text-gray-400 mb-6">We don't have data for this airport code.</p>
          <Link href="/find-a-detailer" className="text-amber-400 hover:text-amber-300 text-sm">Browse all detailers</Link>
        </div>
      </div>
    );
  }

  const detailers = await getDetailersAtAirport(airport.icao);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: `Aircraft Detailing at ${airport.name}`,
    description: `Professional aircraft detailing services at ${airport.name} (${airport.icao}) in ${airport.city}, ${airport.state}.`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: airport.city,
      addressRegion: airport.state,
      addressCountry: 'US',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: airport.lat,
      longitude: airport.lon,
    },
    url: `https://app.vectorav.ai/airport/${airport.icao}`,
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2 text-white text-xl font-bold">
            <span className="text-2xl">{'\u2708\uFE0F'}</span>
            <span>Vector</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/find-a-detailer" className="text-gray-300 hover:text-white text-sm transition-colors">Directory</Link>
            <Link href="/login" className="text-gray-300 hover:text-white text-sm transition-colors">Sign In</Link>
            <Link href="/signup" className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-20">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <span>/</span>
          <Link href="/find-a-detailer" className="hover:text-white transition-colors">Detailers</Link>
          <span>/</span>
          <span className="text-gray-300">{airport.icao}</span>
        </nav>

        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className={`text-xs font-medium uppercase tracking-wider px-2.5 py-1 rounded-full ${
              airport.type === 'International' ? 'bg-blue-500/20 text-blue-400' :
              airport.type === 'Executive' ? 'bg-amber-500/20 text-amber-400' :
              airport.type === 'General Aviation' ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-white/10 text-gray-400'
            }`}>
              {airport.type}
            </span>
            <span className="text-xs text-gray-500">{airport.iata && `IATA: ${airport.iata}`} {airport.iata && '·'} ICAO: {airport.icao}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Aircraft Detailing at {airport.name} ({airport.icao})
          </h1>
          <p className="text-lg text-gray-400 max-w-3xl">
            {airport.city}, {airport.state} — Find professional aircraft detailing, washing, and ceramic coating services at {airport.name}.
          </p>
        </div>

        {/* Detailers Section */}
        {detailers.length > 0 ? (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6">
              {detailers.length} Registered Detailer{detailers.length !== 1 ? 's' : ''}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {detailers.map(d => (
                <div key={d.id} className="p-6 rounded-xl bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    {d.theme_logo_url ? (
                      <img src={d.theme_logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white/5 p-0.5" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-lg">
                        {'\u2708\uFE0F'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Link href={`/detailer/${d.id}`} className="text-lg font-semibold text-white hover:text-amber-400 transition-colors block truncate">
                        {d.company || d.name}
                      </Link>
                      <span className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        d.plan === 'enterprise' ? 'bg-amber-500/20 text-amber-400' :
                        d.plan === 'business' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-white/10 text-gray-400'
                      }`}>
                        {d.plan}
                      </span>
                    </div>
                  </div>
                  {d.avg_rating && (
                    <div className="flex items-center gap-2 mb-3">
                      <StarRating rating={d.avg_rating} />
                      <span className="text-sm text-amber-400 font-medium">{d.avg_rating}</span>
                      <span className="text-xs text-gray-500">({d.review_count} review{d.review_count !== 1 ? 's' : ''})</span>
                    </div>
                  )}
                  <div className="space-y-1 mb-4 text-sm text-gray-400">
                    {d.home_airport && <p>{'\u2708\uFE0F'} Home: {d.home_airport}</p>}
                  </div>
                  <Link
                    href={`/quote-request/${d.id}`}
                    className="block w-full text-center px-4 py-2.5 border border-amber-500/30 text-amber-400 text-sm font-medium rounded-lg hover:bg-amber-500/10 transition-colors"
                  >
                    Request a Quote
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="py-16 text-center rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-5xl mb-4">{'\u2708\uFE0F'}</div>
            <h2 className="text-2xl font-bold text-white mb-3">No Detailers Registered Yet</h2>
            <p className="text-gray-400 max-w-lg mx-auto mb-6">
              There are no registered detailers at {airport.name} yet.
              Are you an aircraft detailer based here?
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="px-8 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Join Vector Free
              </Link>
              <Link
                href="/find-a-detailer"
                className="px-8 py-3 border border-white/10 text-gray-300 font-medium rounded-lg hover:border-amber-500/30 hover:text-white transition-colors"
              >
                Browse All Detailers
              </Link>
            </div>
          </section>
        )}

        {/* Airport Info */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white mb-6">About {airport.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Location</p>
              <p className="text-white font-medium">{airport.city}, {airport.state}</p>
            </div>
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">ICAO Code</p>
              <p className="text-white font-medium">{airport.icao}</p>
            </div>
            {airport.iata && (
              <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">IATA Code</p>
                <p className="text-white font-medium">{airport.iata}</p>
              </div>
            )}
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Airport Type</p>
              <p className="text-white font-medium">{airport.type}</p>
            </div>
          </div>
        </section>

        {/* SEO Content */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-white mb-4">Aircraft Detailing Services at {airport.icao}</h2>
          <div className="prose prose-invert max-w-none text-gray-400 space-y-4">
            <p>
              Vector connects aircraft owners and operators at {airport.name} ({airport.icao}) with professional aviation detailers.
              Whether you need a maintenance wash, full detail, ceramic coating, or interior cleaning, our verified detailers
              deliver premium results for jets, turboprops, and piston aircraft.
            </p>
            <p>
              Services available at {airport.city} area airports include exterior wash and dry, oxidation removal,
              paint correction, ceramic coating application, brightwork polishing, interior deep cleaning,
              leather conditioning, carpet extraction, and window treatment. Many detailers also offer
              recurring maintenance programs to keep your aircraft looking its best year-round.
            </p>
            <p>
              All detailers listed on Vector are verified professionals with experience in aviation-grade products
              and techniques. Request a quote directly through our platform to get competitive pricing for your aircraft type.
            </p>
          </div>
        </section>

        {/* Nearby Airports */}
        <NearbyAirports current={airport} />

        {/* CTA */}
        <section className="mt-16 py-12 px-8 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to Get Your Aircraft Detailed?</h2>
          <p className="text-gray-400 mb-6 max-w-xl mx-auto">
            Browse our directory of verified aviation detailers and request a quote in minutes.
          </p>
          <Link
            href="/find-a-detailer"
            className="inline-block px-8 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            Get a Quote
          </Link>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-2 text-white font-bold">
              <span>{'\u2708\uFE0F'}</span>
              <span>Vector</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link href="/find-a-detailer" className="hover:text-white transition-colors">Directory</Link>
              <Link href="/landing" className="hover:text-white transition-colors">About</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            </div>
            <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} Vector Aviation</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
