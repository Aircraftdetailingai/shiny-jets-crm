"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ExportGate from '@/components/ExportGate';
import { currencySymbol } from '@/lib/formatPrice';

export default function ProfitabilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(90);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [userPlan, setUserPlan] = useState('free');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    const stored = localStorage.getItem('vector_user');
    if (stored) {
      try { setUserPlan(JSON.parse(stored).plan || 'free'); } catch (e) {}
    }
    fetchStats(token);
  }, [router, period]);

  const fetchStats = async (token) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/stats?period=${period}`, {
        headers: { Authorization: `Bearer ${token || localStorage.getItem('vector_token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setError('Failed to load statistics');
      }
    } catch (err) {
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return currencySymbol() + (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercent = (val) => {
    return `${(val || 0).toFixed(1)}%`;
  };

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4 text-v-text-primary">
      <header className="text-white flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <a href="/dashboard" className="text-2xl">&#8592;</a>
          <h1 className="text-2xl font-bold">{'Profitability'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <ExportGate plan={userPlan}>
            <button
              onClick={() => {
                if (!stats) return;
                const lines = [
                  `Profitability Report - Last ${period} days`,
                  `Generated: ${new Date().toISOString().split('T')[0]}`,
                  '',
                  `Total Revenue,${currencySymbol()}${stats.totalRevenue?.toFixed(2) || '0.00'}`,
                  `Total Jobs,${stats.totalJobs || 0}`,
                  `Avg Job Value,${currencySymbol()}${stats.avgJobValue?.toFixed(2) || '0.00'}`,
                  `Material Costs,${currencySymbol()}${stats.materialCosts?.toFixed(2) || '0.00'}`,
                  `Platform Fees,${currencySymbol()}${stats.platformFees?.toFixed(2) || '0.00'}`,
                  `Effective Hourly Rate,${currencySymbol()}${stats.effectiveHourlyRate?.toFixed(2) || '0.00'}`,
                ];
                const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `profitability-${new Date().toISOString().split('T')[0]}.csv`;
                a.click(); URL.revokeObjectURL(a.href);
              }}
              disabled={!stats}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded px-3 py-1 disabled:opacity-50 text-sm"
            >
              {'Export CSV'}
            </button>
          </ExportGate>
          <select
            value={period}
            onChange={(e) => setPeriod(parseInt(e.target.value))}
            className="bg-white/10 text-white border border-white/20 rounded px-3 py-1"
          >
            <option value={30} className="text-v-text-primary">{'Last 30 days'}</option>
            <option value={90} className="text-v-text-primary">{'Last 90 days'}</option>
            <option value={180} className="text-v-text-primary">{'Last 6 months'}</option>
            <option value={365} className="text-v-text-primary">{'Last year'}</option>
          </select>
        </div>
      </header>

      {loading ? (
        <div className="text-white text-center py-12">{'Loading statistics...'}</div>
      ) : error ? (
        <div className="text-red-400 text-center py-12">{error}</div>
      ) : !stats || stats.overall.totalJobs === 0 ? (
        <div className="bg-v-surface rounded-lg p-8 text-center">
          <p className="text-xl font-semibold mb-2">{'No completed jobs yet'}</p>
          <p className="text-v-text-secondary mb-4">{'Complete jobs and log your actual hours to track profitability.'}</p>
          <a href="/dashboard" className="text-v-gold-dim underline">{'Go to Dashboard'}</a>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overall Stats */}
          <div className="bg-v-surface rounded-lg p-4 shadow">
            <h2 className="font-semibold text-lg mb-3">{'Overall Performance'}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-2xl font-bold text-v-gold-dim">{stats.overall.totalJobs}</p>
                <p className="text-sm text-v-text-secondary">{'Jobs Completed'}</p>
              </div>
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.overall.totalRevenue)}</p>
                <p className="text-sm text-v-text-secondary">{'Total Revenue'}</p>
              </div>
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.overall.totalProfit)}</p>
                <p className="text-sm text-v-text-secondary">{'Total Profit'}</p>
              </div>
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-2xl font-bold text-purple-600">{formatPercent(stats.overall.avgMargin)}</p>
                <p className="text-sm text-v-text-secondary">{'Avg Margin'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-xl font-semibold">{stats.overall.totalHours.toFixed(1)}</p>
                <p className="text-sm text-v-text-secondary">{'Total Hours'}</p>
              </div>
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-xl font-semibold">{formatCurrency(stats.overall.avgRevenuePerJob)}</p>
                <p className="text-sm text-v-text-secondary">{'Avg Revenue/Job'}</p>
              </div>
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-xl font-semibold">{formatCurrency(stats.overall.avgProfitPerJob)}</p>
                <p className="text-sm text-v-text-secondary">{'Avg Profit/Job'}</p>
              </div>
              <div className="text-center p-3 bg-v-charcoal rounded">
                <p className="text-xl font-semibold">{stats.overall.avgHoursPerJob.toFixed(1)}h</p>
                <p className="text-sm text-v-text-secondary">{'Avg Hours/Job'}</p>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-v-surface rounded-lg p-4 shadow">
            <h2 className="font-semibold text-lg mb-3">{'Cost Breakdown'}</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-v-text-secondary">{'Labor Cost'}</span>
                <span className="font-semibold">{formatCurrency(stats.overall.totalLaborCost)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-v-text-secondary">{'Product/Material Cost'}</span>
                <span className="font-semibold">{formatCurrency(stats.overall.totalProductCost)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-medium">{'Total Costs'}</span>
                <span className="font-bold">{formatCurrency(stats.overall.totalLaborCost + stats.overall.totalProductCost)}</span>
              </div>
            </div>
          </div>

          {/* Service Rankings */}
          {stats.serviceRankings && stats.serviceRankings.length > 0 && (
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <h2 className="font-semibold text-lg mb-3">{'Service Profitability Rankings'}</h2>
              <div className="space-y-2">
                {stats.serviceRankings.map((svc, idx) => (
                  <div
                    key={svc.service_key}
                    className="flex items-center justify-between p-3 bg-v-charcoal rounded"
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                        idx === 0 ? 'bg-v-gold text-white' :
                        idx === 1 ? 'bg-v-charcoal text-v-text-secondary' :
                        idx === 2 ? 'bg-v-gold-dim text-white' :
                        'bg-v-charcoal text-v-text-secondary'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-medium">{svc.service_name}</p>
                        <p className="text-xs text-v-text-secondary">{svc.jobCount} {'jobs'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{formatCurrency(svc.totalProfit)}</p>
                      <p className="text-xs text-v-text-secondary">{formatPercent(svc.avgMargin)} {'margin'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly Trend */}
          {stats.monthlyTrend && stats.monthlyTrend.length > 0 && (
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <h2 className="font-semibold text-lg mb-3">{'Monthly Trend'}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-v-text-secondary">
                      <th className="text-left py-2">{'Month'}</th>
                      <th className="text-right py-2">{'Jobs'}</th>
                      <th className="text-right py-2">{'Revenue'}</th>
                      <th className="text-right py-2">{'Profit'}</th>
                      <th className="text-right py-2">{'margin'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.monthlyTrend.map((month) => (
                      <tr key={month.month} className="border-b last:border-0">
                        <td className="py-2 font-medium">{month.month}</td>
                        <td className="text-right py-2">{month.jobs}</td>
                        <td className="text-right py-2">{formatCurrency(month.revenue)}</td>
                        <td className="text-right py-2 text-green-600">{formatCurrency(month.profit)}</td>
                        <td className="text-right py-2">{formatPercent(month.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Link to Job History */}
          <div className="bg-v-surface rounded-lg p-4 shadow">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{'Job History'}</h3>
                <p className="text-sm text-v-text-secondary">{'View and manage completed jobs'}</p>
              </div>
              <a
                href="/jobs"
                className="px-4 py-2 bg-v-gold-muted/200 text-white rounded hover:bg-v-gold-dim"
              >
                {'View Jobs'}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
