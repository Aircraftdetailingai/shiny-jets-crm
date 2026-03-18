"use client";

import { useState, useEffect } from 'react';
import { STRIPE_COUNTRIES, CURRENCY_MAP } from '@/lib/currency';

export default function FindADetailerPage() {
  const [detailers, setDetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState('');
  const [airport, setAirport] = useState('');
  const [search, setSearch] = useState('');

  const fetchDetailers = async (c, a, s) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (c) params.set('country', c);
      if (a) params.set('airport', a);
      if (s) params.set('search', s);
      const res = await fetch(`/api/detailers/directory?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDetailers(data.detailers || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchDetailers('', '', '');
  }, []);

  // Country filter — immediate
  useEffect(() => {
    fetchDetailers(country, airport, search);
  }, [country]);

  // Text inputs — debounced
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDetailers(country, airport, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [airport, search]);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center space-x-2 text-white text-xl font-bold">
            <span className="text-2xl">{'\u2708\uFE0F'}</span>
            <span>Vector</span>
          </a>
          <div className="flex items-center space-x-4">
            <a href="/find-a-detailer" className="text-v-gold text-sm font-medium hidden sm:inline">Directory</a>
            <a href="/login" className="text-gray-300 hover:text-white text-sm transition-colors">Sign In</a>
            <a href="/login" className="px-4 py-2 bg-gradient-to-r from-v-gold to-v-gold-dim text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
              Start Free
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-4">
            Find an Aviation Detailer
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Browse verified aviation detailing professionals worldwide. Request a quote directly from any listed detailer.
          </p>
        </div>
      </section>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-white/[0.05] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-v-gold/50 min-w-[180px]"
          >
            <option value="">All Countries</option>
            {STRIPE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={airport}
            onChange={(e) => setAirport(e.target.value)}
            placeholder="Airport code (e.g. KJFK)"
            className="bg-white/[0.05] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none focus:border-v-gold/50 sm:w-[200px]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name..."
            className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none focus:border-v-gold/50"
          />
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading directory...</p>
          </div>
        ) : detailers.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-2">No detailers found</p>
            <p className="text-gray-600 text-sm">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-6">{detailers.length} detailer{detailers.length !== 1 ? 's' : ''} found</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {detailers.map((d) => {
                const countryData = STRIPE_COUNTRIES.find(c => c.code === d.country);
                const currencyInfo = CURRENCY_MAP[d.preferred_currency];
                return (
                  <div key={d.id} className="p-6 rounded-xl bg-white/[0.03] border border-white/5 hover:border-v-gold/30 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        d.plan === 'enterprise' ? 'bg-v-gold/20 text-v-gold' :
                        d.plan === 'business' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-white/10 text-gray-400'
                      }`}>
                        {d.plan}
                      </span>
                    </div>
                    <a href={`/detailer/${d.id}`} className="text-lg font-semibold text-white mb-1 block hover:text-v-gold transition-colors">
                      {d.company || d.name}
                    </a>
                    {d.avg_rating && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(s => (
                            <svg key={s} className={`w-3.5 h-3.5 ${s <= Math.round(d.avg_rating) ? 'text-v-gold' : 'text-white/10'}`} viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          ))}
                        </div>
                        <span className="text-sm text-v-gold font-medium">{d.avg_rating}</span>
                        <span className="text-xs text-gray-500">({d.review_count})</span>
                      </div>
                    )}
                    <div className="space-y-1.5 mb-5">
                      {countryData && (
                        <p className="text-sm text-gray-400">
                          {countryData.flag} {countryData.name}
                        </p>
                      )}
                      {d.home_airport && (
                        <p className="text-sm text-gray-400">
                          {'\u2708\uFE0F'} {d.home_airport}
                        </p>
                      )}
                      {currencyInfo && (
                        <p className="text-sm text-gray-400">
                          {currencyInfo.flag} {currencyInfo.code} ({currencyInfo.symbol})
                        </p>
                      )}
                    </div>
                    <a
                      href={`/quote-request/${d.id}`}
                      className="block w-full text-center px-4 py-2.5 border border-v-gold/30 text-v-gold text-sm font-medium rounded-lg hover:bg-v-gold/10 transition-colors"
                    >
                      Request a Quote
                    </a>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer CTA */}
      <section className="py-16 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Are you an aviation detailer?</h2>
          <p className="text-gray-400 mb-6">Join Vector and get listed in our directory. Reach customers worldwide.</p>
          <a
            href="/login"
            className="inline-block px-8 py-3 bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Get Started Free
          </a>
        </div>
      </section>
    </div>
  );
}
