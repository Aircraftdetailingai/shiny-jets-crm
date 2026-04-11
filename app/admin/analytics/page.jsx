"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai', 'brett@shinyjets.com'];

const CATEGORY_COLUMNS = [
  { key: 'light_jet', label: 'Light Jet', aliases: ['light jet', 'light_jet', 'light'] },
  { key: 'mid_jet', label: 'Mid Jet', aliases: ['mid jet', 'mid_jet', 'midsize', 'mid'] },
  { key: 'heavy_jet', label: 'Heavy Jet', aliases: ['heavy jet', 'heavy_jet', 'heavy'] },
  { key: 'ultra_long_range', label: 'Ultra Long', aliases: ['ultra long', 'ultra_long_range', 'ultra long range', 'ultra'] },
];

function normalizeCategoryKey(raw) {
  if (!raw) return null;
  const lower = String(raw).trim().toLowerCase();
  for (const col of CATEGORY_COLUMNS) {
    if (col.aliases.includes(lower) || lower === col.key) return col.key;
  }
  return null;
}

function varianceClass(avg, stddev) {
  if (!avg || avg <= 0 || stddev == null) return 'text-v-text-secondary';
  const ratio = stddev / avg;
  if (ratio < 0.2) return 'text-green-400';
  if (ratio < 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

function formatHours(n) {
  if (n == null || isNaN(n)) return '—';
  const num = Number(n);
  return num.toFixed(num < 10 ? 2 : 1);
}

export default function AdminServiceAnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [benchmarks, setBenchmarks] = useState([]);
  const [adoption, setAdoption] = useState([]);
  const [anomalies, setAnomalies] = useState(null);
  const [anomaliesSummary, setAnomaliesSummary] = useState('');
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [anomaliesError, setAnomaliesError] = useState('');
  const [user, setUser] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    let parsed = null;
    try {
      const raw = localStorage.getItem('vector_user');
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {
      parsed = null;
    }
    setUser(parsed);

    const email = (parsed?.email || '').toLowerCase();
    const isAdmin = parsed && (parsed.is_admin === true || ADMIN_EMAILS.includes(email));
    if (!isAdmin) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch('/api/admin/benchmarks', { headers }).then(r => r.ok ? r.json() : Promise.reject(r)),
      fetch('/api/admin/calibration-adoption', { headers }).then(r => r.ok ? r.json() : Promise.reject(r)),
    ])
      .then(([b, a]) => {
        setBenchmarks(Array.isArray(b?.benchmarks) ? b.benchmarks : []);
        setAdoption(Array.isArray(a?.adoption) ? a.adoption : []);
      })
      .catch(() => setFetchError('Failed to load analytics data'))
      .finally(() => setLoading(false));
  }, [router]);

  const runAnomalyDetection = async () => {
    setAnomaliesLoading(true);
    setAnomaliesError('');
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/admin/anomalies', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setAnomalies(Array.isArray(data?.anomalies) ? data.anomalies : []);
      setAnomaliesSummary(data?.summary || '');
    } catch (err) {
      setAnomaliesError('Failed to run anomaly detection');
    } finally {
      setAnomaliesLoading(false);
    }
  };

  // Group benchmarks: { service_name: { light_jet: {avg,stddev,n}, ... } }
  const groupedBenchmarks = {};
  for (const row of benchmarks) {
    const svc = row.service_name || 'Unknown';
    if (!groupedBenchmarks[svc]) groupedBenchmarks[svc] = {};
    const catKey = normalizeCategoryKey(row.aircraft_category);
    if (!catKey) continue;
    groupedBenchmarks[svc][catKey] = {
      avg: Number(row.avg_hours) || 0,
      stddev: Number(row.stddev_hours) || 0,
      median: Number(row.median_hours) || 0,
      min: Number(row.min_hours) || 0,
      max: Number(row.max_hours) || 0,
      n: Number(row.sample_size) || 0,
      detailers: Number(row.detailer_count) || 0,
    };
  }
  const serviceNames = Object.keys(groupedBenchmarks).sort();

  if (unauthorized) {
    return (
      <AppShell title="Service Analytics">
        <div className="px-6 md:px-10 py-8 max-w-7xl">
          <div className="bg-v-surface border border-v-border rounded-sm p-12 text-center">
            <h1 className="font-heading text-2xl text-v-text-primary mb-2" style={{ letterSpacing: '0.15em' }}>
              UNAUTHORIZED
            </h1>
            <p className="text-v-text-secondary text-sm">
              You do not have permission to view this page.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Service Analytics">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="font-heading text-[2rem] font-light text-v-text-primary"
            style={{ letterSpacing: '0.15em' }}
          >
            SERVICE HOURS ANALYTICS
          </h1>
          <p className="text-v-text-secondary text-xs mt-1">
            Anonymous aggregate data from all detailers
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-v-text-secondary text-xs tracking-widest uppercase">
                Loading analytics
              </p>
            </div>
          </div>
        ) : fetchError ? (
          <div className="bg-v-surface border border-red-500/30 rounded-sm p-6 text-center">
            <p className="text-red-400 text-sm">{fetchError}</p>
          </div>
        ) : (
          <>
            {/* Benchmarks Table */}
            <section className="mb-10">
              <h2
                className="text-[11px] font-medium uppercase tracking-[0.25em] text-v-gold mb-3"
              >
                Service Hours Benchmarks
              </h2>

              {serviceNames.length === 0 ? (
                <div className="bg-v-surface border border-v-border rounded-sm p-8 text-center">
                  <p className="text-v-text-secondary text-sm">No benchmark data available.</p>
                </div>
              ) : (
                <div className="bg-v-surface border border-v-border rounded-sm overflow-x-auto">
                  <div className="sticky top-0 z-10 bg-v-surface border-b border-[#1A2236]">
                    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_90px] min-w-[900px] px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
                      <div>Service</div>
                      {CATEGORY_COLUMNS.map(c => (
                        <div key={c.key} className="text-center">{c.label}</div>
                      ))}
                      <div className="text-right">Sample</div>
                    </div>
                  </div>

                  {serviceNames.map((svc) => {
                    const row = groupedBenchmarks[svc];
                    const totalN = CATEGORY_COLUMNS.reduce(
                      (acc, c) => acc + (row[c.key]?.n || 0),
                      0
                    );
                    return (
                      <div
                        key={svc}
                        className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_90px] min-w-[900px] px-6 items-center border-b border-[#1A2236] hover:bg-white/[0.02] transition-colors"
                        style={{ minHeight: '64px' }}
                      >
                        <div className="pr-4 py-3">
                          <span className="text-white text-sm capitalize">{svc}</span>
                        </div>
                        {CATEGORY_COLUMNS.map(c => {
                          const cell = row[c.key];
                          if (!cell || !cell.n) {
                            return (
                              <div key={c.key} className="text-center py-3">
                                <span className="text-v-text-secondary/40 text-sm">—</span>
                              </div>
                            );
                          }
                          const cls = varianceClass(cell.avg, cell.stddev);
                          return (
                            <div key={c.key} className="text-center py-3">
                              <div className={`text-sm font-data ${cls}`}>
                                {formatHours(cell.avg)}
                                <span className="text-v-text-secondary/70 text-xs ml-1">
                                  ± {formatHours(cell.stddev)}
                                </span>
                              </div>
                              <div className="text-[10px] text-v-text-secondary/60 mt-0.5">
                                n={cell.n}
                              </div>
                            </div>
                          );
                        })}
                        <div className="text-right py-3">
                          <span className="text-v-gold text-xs font-data">{totalN}</span>
                        </div>
                      </div>
                    );
                  })}

                  <div className="px-6 py-3 border-t border-[#1A2236] text-[#8A9BB0] text-[10px] uppercase tracking-wider flex gap-4">
                    <span><span className="text-green-400">&bull;</span> Low variance (&lt;20%)</span>
                    <span><span className="text-yellow-400">&bull;</span> Medium (20-50%)</span>
                    <span><span className="text-red-400">&bull;</span> High (&gt;50%)</span>
                  </div>
                </div>
              )}
            </section>

            {/* Anomaly Detection */}
            <section className="mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.25em] text-v-gold">
                  Anomaly Detection
                </h2>
                <button
                  onClick={runAnomalyDetection}
                  disabled={anomaliesLoading}
                  className="px-5 py-2.5 text-xs uppercase tracking-widest bg-v-gold text-v-charcoal font-semibold hover:bg-v-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {anomaliesLoading ? 'Analyzing...' : 'Find Anomalies (AI)'}
                </button>
              </div>

              {anomaliesError && (
                <div className="bg-v-surface border border-red-500/30 rounded-sm p-4 mb-3">
                  <p className="text-red-400 text-sm">{anomaliesError}</p>
                </div>
              )}

              {anomalies && !anomaliesError && (
                <div className="bg-v-surface border border-v-border rounded-sm">
                  {anomaliesSummary && (
                    <div className="px-6 py-4 border-b border-[#1A2236]">
                      <p className="text-v-text-primary text-sm leading-relaxed">
                        {anomaliesSummary}
                      </p>
                    </div>
                  )}

                  {anomalies.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <p className="text-v-text-secondary text-sm">No anomalies detected.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="sticky top-0 bg-v-surface border-b border-[#1A2236]">
                        <div className="grid grid-cols-[1.3fr_1fr_90px_90px_2fr_100px] min-w-[900px] px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
                          <div>Service</div>
                          <div>Category</div>
                          <div className="text-right">Avg Hrs</div>
                          <div className="text-center">Type</div>
                          <div>Explanation</div>
                          <div className="text-center">Profitable</div>
                        </div>
                      </div>
                      {anomalies.map((a, i) => {
                        const type = (a.type || a.anomaly_type || '').toLowerCase();
                        const typeClass = type === 'high'
                          ? 'border border-red-500/40 text-red-400'
                          : type === 'low'
                          ? 'border border-cyan-400/40 text-cyan-300'
                          : 'border border-gray-500/30 text-gray-400';
                        const profitable = a.profitable === true || a.is_profitable === true;
                        return (
                          <div
                            key={i}
                            className="grid grid-cols-[1.3fr_1fr_90px_90px_2fr_100px] min-w-[900px] px-6 py-3 items-center border-b border-[#1A2236]"
                          >
                            <div className="text-white text-sm capitalize pr-3 truncate" title={a.service_name || a.service}>
                              {a.service_name || a.service || '—'}
                            </div>
                            <div className="text-[#8A9BB0] text-xs capitalize pr-3 truncate">
                              {(a.aircraft_category || a.category || '—').toString().replace(/_/g, ' ')}
                            </div>
                            <div className="text-right text-v-text-primary text-sm font-data">
                              {formatHours(a.avg_hours)}
                            </div>
                            <div className="flex justify-center">
                              <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider ${typeClass}`}>
                                {type || 'info'}
                              </span>
                            </div>
                            <div className="text-[#8A9BB0] text-xs pr-3">
                              {a.explanation || a.reason || '—'}
                            </div>
                            <div className="flex justify-center">
                              {profitable ? (
                                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider border border-green-500/40 text-green-400">
                                  Profitable
                                </span>
                              ) : (
                                <span className="text-v-text-secondary/50 text-[10px]">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!anomalies && !anomaliesError && !anomaliesLoading && (
                <div className="bg-v-surface border border-v-border rounded-sm p-6 text-center">
                  <p className="text-v-text-secondary text-sm">
                    Click "Find Anomalies (AI)" to analyze benchmark data for outliers.
                  </p>
                </div>
              )}
            </section>

            {/* Calibration Adoption */}
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.25em] text-v-gold mb-3">
                Calibration Adoption
              </h2>
              {adoption.length === 0 ? (
                <div className="bg-v-surface border border-v-border rounded-sm p-8 text-center">
                  <p className="text-v-text-secondary text-sm">No calibration adoption data.</p>
                </div>
              ) : (
                <div className="bg-v-surface border border-v-border rounded-sm overflow-x-auto">
                  <div className="sticky top-0 bg-v-surface border-b border-[#1A2236]">
                    <div className="grid grid-cols-[1.5fr_120px_140px_140px_140px] min-w-[850px] px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
                      <div>Reference Service</div>
                      <div className="text-right">Detailers Using</div>
                      <div className="text-right">Avg Adjustment</div>
                      <div className="text-right">Variance (StdDev)</div>
                      <div className="text-right">Total Calibrations</div>
                    </div>
                  </div>
                  {adoption.map((row, i) => {
                    const adj = Number(row.avg_adjustment_pct) || 0;
                    const adjClass = adj > 0 ? 'text-green-400' : adj < 0 ? 'text-red-400' : 'text-v-text-primary';
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[1.5fr_120px_140px_140px_140px] min-w-[850px] px-6 py-3 items-center border-b border-[#1A2236] hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="text-white text-sm capitalize pr-3 truncate" title={row.reference_service_type}>
                          {row.reference_service_type || '—'}
                        </div>
                        <div className="text-right text-v-text-primary text-sm font-data">
                          {row.detailer_count || 0}
                        </div>
                        <div className={`text-right text-sm font-data ${adjClass}`}>
                          {adj > 0 ? '+' : ''}{adj.toFixed(1)}%
                        </div>
                        <div className="text-right text-[#8A9BB0] text-sm font-data">
                          {(Number(row.stddev_adjustment) || 0).toFixed(2)}
                        </div>
                        <div className="text-right text-v-gold text-sm font-data">
                          {row.total_calibrations || 0}
                        </div>
                      </div>
                    );
                  })}
                  <div className="px-6 py-3 border-t border-[#1A2236] text-[#8A9BB0] text-xs">
                    {adoption.length} reference service{adoption.length === 1 ? '' : 's'}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
