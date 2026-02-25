"use client";
import { useState, useEffect } from 'react';
import { currencySymbol } from '@/lib/formatPrice';

export default function ROIDashboard({ compact = false }) {
  const [metrics, setMetrics] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('year');

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [metricsRes, benchmarksRes] = await Promise.all([
        fetch(`/api/roi/metrics?period=${period}`, { headers }),
        fetch('/api/roi/benchmarks', { headers }),
      ]);

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      }

      if (benchmarksRes.ok) {
        const data = await benchmarksRes.json();
        setBenchmarks(data);
      }
    } catch (err) {
      console.error('Failed to fetch ROI data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg p-4 shadow ${compact ? 'mb-4' : ''}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-100 rounded w-1/3"></div>
          <div className="h-20 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const { metrics: m, baseline } = metrics;

  // Compact widget version for dashboard
  if (compact) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-4 shadow mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📈</span>
            <h3 className="font-semibold text-emerald-900">Your Vector ROI</h3>
          </div>
          <a
            href="/roi"
            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
          >
            View Details →
          </a>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Time Saved</p>
            <p className="text-xl font-bold text-emerald-600">{m.timeSavedHours}h</p>
            <p className="text-xs text-gray-400">${m.timeSavedValue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Extra Revenue</p>
            <p className="text-xl font-bold text-emerald-600">${m.extraRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Your ROI</p>
            <p className="text-xl font-bold text-amber-500">{m.roiMultiple}</p>
            <p className="text-xs text-gray-400">return</p>
          </div>
        </div>

        {m.totalValue > 0 && (
          <p className="text-xs text-emerald-700 text-center mt-3">
            Total value: <strong>${m.totalValue.toLocaleString()}</strong> this year
          </p>
        )}
      </div>
    );
  }

  // Full page version
  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex gap-2">
        {['month', 'year', 'all_time'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              period === p
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time'}
          </button>
        ))}
      </div>

      {/* Main ROI Card */}
      <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-6 text-white">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <span>📈</span> Your Vector ROI
        </h2>
        <p className="text-emerald-100 text-sm mb-6">
          {period === 'month' ? 'This Month' : period === 'year' ? 'This Year' : 'Since You Joined'}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-emerald-100 text-xs">Time Saved</p>
            <p className="text-2xl font-bold">{m.timeSavedHours} hours</p>
            <p className="text-emerald-200 text-sm">${m.timeSavedValue.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-emerald-100 text-xs">Extra Revenue</p>
            <p className="text-2xl font-bold">${m.extraRevenue.toLocaleString()}</p>
            <p className="text-emerald-200 text-sm">upsells + rate increases</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-emerald-100 text-xs">Recovered Costs</p>
            <p className="text-2xl font-bold">${m.recoveredCosts.toLocaleString()}</p>
            <p className="text-emerald-200 text-sm">wait fees + repositioning</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-emerald-100 text-xs">Total Value</p>
            <p className="text-2xl font-bold">${m.totalValue.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white/20 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm">You Pay</p>
            <p className="text-xl font-semibold">${m.subscriptionCost}/yr</p>
          </div>
          <div className="text-right">
            <p className="text-emerald-100 text-sm">Your ROI</p>
            <p className="text-4xl font-bold text-amber-300">{m.roiMultiple}</p>
            <p className="text-emerald-200 text-xs">return on investment</p>
          </div>
        </div>
      </div>

      {/* Activity Stats */}
      <div className="bg-white rounded-xl p-6 shadow">
        <h3 className="font-semibold text-gray-900 mb-4">Activity Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-blue-600">{m.quotesCreated}</p>
            <p className="text-sm text-gray-500">Quotes Created</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-green-600">{m.quotesPaid}</p>
            <p className="text-sm text-gray-500">Jobs Booked</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-purple-600">{m.conversionRate}%</p>
            <p className="text-sm text-gray-500">Close Rate</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-3xl font-bold text-amber-600">${m.totalRevenue.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Revenue Booked</p>
          </div>
        </div>
      </div>

      {/* Benchmarks */}
      {benchmarks?.benchmarks && (
        <div className="bg-white rounded-xl p-6 shadow">
          <h3 className="font-semibold text-gray-900 mb-4">How You Compare</h3>
          <p className="text-xs text-gray-400 mb-4">Compared to industry averages for aircraft detailing</p>
          <div className="space-y-4">
            {Object.entries(benchmarks.benchmarks).map(([key, b]) => {
              const yours = key === 'closeRate' ? m.conversionRate
                : key === 'quoteSpeed' ? m.avgQuoteCreationMinutes
                : key === 'avgTicket' ? (m.totalRevenue && m.quotesPaid ? Math.round(m.totalRevenue / m.quotesPaid) : 0)
                : null;
              const better = key === 'quoteSpeed'
                ? yours !== null && yours <= b.average
                : yours !== null && yours >= b.average;
              return (
                <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{b.label}</p>
                    <p className="text-sm text-gray-500">
                      Industry avg: {b.format === 'percent' ? `${b.average}%` : b.format === 'currency' ? `${currencySymbol()}${b.average.toLocaleString()}` : `${b.average} min`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">
                      {b.format === 'percent' ? `${yours ?? 0}%` : b.format === 'currency' ? `${currencySymbol()}${(yours ?? 0).toLocaleString()}` : yours !== null ? `${yours} min` : '-'}
                    </p>
                    {better && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        &#10003; Above Average
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Baseline Comparison */}
      {baseline && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 mb-4">Before vs After Vector</h3>
          <div className="grid grid-cols-2 gap-4">
            {baseline.quote_creation_time_minutes && m.avgQuoteCreationMinutes && (
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-2">Quote Creation Time</p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Before</p>
                    <p className="text-xl font-semibold text-gray-400 line-through">
                      {baseline.quote_creation_time_minutes} min
                    </p>
                  </div>
                  <span className="text-blue-500">→</span>
                  <div>
                    <p className="text-xs text-blue-600">Now</p>
                    <p className="text-xl font-semibold text-blue-600">
                      {m.avgQuoteCreationMinutes} min
                    </p>
                  </div>
                </div>
              </div>
            )}
            {baseline.quote_conversion_rate && (
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-2">Close Rate</p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Before</p>
                    <p className="text-xl font-semibold text-gray-400 line-through">
                      {baseline.quote_conversion_rate}%
                    </p>
                  </div>
                  <span className="text-blue-500">→</span>
                  <div>
                    <p className="text-xs text-blue-600">Now</p>
                    <p className="text-xl font-semibold text-blue-600">
                      {m.conversionRate}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
