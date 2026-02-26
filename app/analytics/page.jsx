"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import { useTranslation } from '@/lib/i18n';

// --- Pure CSS chart components ---

function BarChart({ data, valueKey, labelKey, color = 'amber', maxBars = 12 }) {
  const sliced = data.slice(-maxBars);
  const max = Math.max(...sliced.map(d => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {sliced.map((d, i) => {
        const val = d[valueKey] || 0;
        const pct = (val / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {val}
            </div>
            <div
              className={`w-full rounded-t transition-all duration-300 ${
                color === 'amber' ? 'bg-amber-500' :
                color === 'green' ? 'bg-green-500' :
                color === 'blue' ? 'bg-blue-500' :
                'bg-purple-500'
              }`}
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            <span className="text-[9px] text-gray-500 mt-1 truncate w-full text-center">{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBar({ label, value, max, suffix = '', color = 'amber' }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const colorClass = color === 'amber' ? 'bg-amber-500' : color === 'green' ? 'bg-green-500' : color === 'blue' ? 'bg-blue-500' : 'bg-purple-500';
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-300 w-28 truncate">{label}</span>
      <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} rounded-full transition-all duration-500`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="text-sm text-white font-medium w-20 text-right">{suffix}{value.toLocaleString()}</span>
    </div>
  );
}

function FunnelStep({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex-1 text-center">
      <div className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
      {total > 0 && value !== total && (
        <div className="text-[10px] text-gray-500 mt-0.5">{pct}%</div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// --- Main page ---

export default function AnalyticsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchData(days);
  }, [days]);

  const fetchData = async (period) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/analytics?days=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const conversionRate = data?.funnel
    ? (data.funnel.totalCreated > 0
        ? Math.round((data.funnel.totalPaid / data.funnel.totalCreated) * 100)
        : 0)
    : 0;

  const totalRevenue = data?.revenueTrend?.reduce((s, m) => s + m.revenue, 0) || 0;
  const totalJobs = data?.funnel?.totalPaid || 0;
  const avgJobValue = totalJobs > 0 ? Math.round(totalRevenue / totalJobs) : 0;

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-xl sm:text-2xl font-bold">{t('nav.analytics')}</h1>
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: '30d', value: 30 },
            { label: '90d', value: 90 },
            { label: '6mo', value: 180 },
            { label: '1yr', value: 365 },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all min-h-[36px] ${
                days === opt.value
                  ? 'bg-white text-gray-900'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : data ? (
        <div className="space-y-6 max-w-6xl mx-auto">
          {/* Top stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon="💰" label={t('reports.totalRevenue')} value={`${currencySymbol()}${totalRevenue.toLocaleString()}`} sub={`Last ${days} days`} />
            <StatCard icon="📊" label={t('reports.conversionRate')} value={`${conversionRate}%`} sub={`${data.funnel.totalPaid} of ${data.funnel.totalCreated} quotes`} />
            <StatCard icon="📋" label={t('reports.avgJobValue')} value={`${currencySymbol()}${avgJobValue.toLocaleString()}`} sub={`${totalJobs} jobs`} />
            <StatCard icon="🔄" label="Retention" value={`${data.retention.retentionRate}%`} sub={`${data.retention.repeatCustomers} repeat of ${data.retention.totalCustomers}`} />
          </div>

          {/* Conversion Funnel */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Quote Funnel</h2>
            <div className="flex items-center">
              <FunnelStep label={t('dashboard.quoteCreated')} value={data.funnel.totalCreated} total={data.funnel.totalCreated} color="text-gray-300" />
              <span className="text-gray-600 mx-1">›</span>
              <FunnelStep label={t('status.sent')} value={data.funnel.totalSent} total={data.funnel.totalCreated} color="text-blue-400" />
              <span className="text-gray-600 mx-1">›</span>
              <FunnelStep label={t('status.viewed')} value={data.funnel.totalViewed} total={data.funnel.totalCreated} color="text-amber-400" />
              <span className="text-gray-600 mx-1">›</span>
              <FunnelStep label={t('status.paid')} value={data.funnel.totalPaid} total={data.funnel.totalCreated} color="text-green-400" />
              <span className="text-gray-600 mx-1">›</span>
              <FunnelStep label={t('status.completed')} value={data.funnel.totalCompleted} total={data.funnel.totalCreated} color="text-purple-400" />
            </div>
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversion Rate Trend */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">{t('reports.conversionRate')}</h2>
              <p className="text-xs text-gray-500 mb-4">Weekly quote-to-paid percentage</p>
              {data.conversionTrend.length > 0 ? (
                <BarChart
                  data={data.conversionTrend.map(w => ({
                    ...w,
                    label: new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  }))}
                  valueKey="rate"
                  labelKey="label"
                  color="blue"
                />
              ) : (
                <p className="text-gray-500 text-sm text-center py-10">{t('reports.noData')}</p>
              )}
            </div>

            {/* Avg Job Value Trend */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">{t('reports.avgJobValue')}</h2>
              <p className="text-xs text-gray-500 mb-4">Weekly average per completed job</p>
              {data.valueTrend.filter(w => w.avgValue > 0).length > 0 ? (
                <BarChart
                  data={data.valueTrend.filter(w => w.avgValue > 0).map(w => ({
                    ...w,
                    label: new Date(w.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  }))}
                  valueKey="avgValue"
                  labelKey="label"
                  color="green"
                />
              ) : (
                <p className="text-gray-500 text-sm text-center py-10">No completed jobs yet</p>
              )}
            </div>

            {/* Revenue Trend */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">{t('reports.revenueByMonth')}</h2>
              <p className="text-xs text-gray-500 mb-4">{t('reports.totalRevenue')} by month</p>
              {data.revenueTrend.length > 0 ? (
                <BarChart
                  data={data.revenueTrend.map(m => {
                    const [y, mo] = m.month.split('-');
                    return { ...m, label: new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'short' }), display: `${currencySymbol()}${m.revenue.toLocaleString()}` };
                  })}
                  valueKey="revenue"
                  labelKey="label"
                  color="amber"
                />
              ) : (
                <p className="text-gray-500 text-sm text-center py-10">No revenue data yet</p>
              )}
            </div>

            {/* Busiest Days */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">Busiest Days</h2>
              <p className="text-xs text-gray-500 mb-4">Jobs by day of week</p>
              <BarChart data={data.busiestDays} valueKey="jobs" labelKey="day" color="purple" maxBars={7} />
            </div>
          </div>

          {/* Top Services */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Top {t('common.services')} by Revenue</h2>
            <p className="text-xs text-gray-500 mb-4">Your highest-earning services</p>
            {data.topServices.length > 0 ? (
              <div className="space-y-3">
                {data.topServices.map((svc, i) => (
                  <HorizontalBar
                    key={svc.name}
                    label={svc.name}
                    value={svc.revenue}
                    max={data.topServices[0]?.revenue || 1}
                    suffix={currencySymbol()}
                    color={i === 0 ? 'amber' : i < 3 ? 'blue' : 'purple'}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-6">No service revenue data yet</p>
            )}
          </div>

          {/* Customer Retention Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <p className="text-3xl font-bold text-white">{data.retention.totalCustomers}</p>
              <p className="text-xs text-gray-400 mt-1">Total {t('nav.customers')}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <p className="text-3xl font-bold text-green-400">{data.retention.repeatCustomers}</p>
              <p className="text-xs text-gray-400 mt-1">Repeat {t('nav.customers')}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <p className="text-3xl font-bold text-amber-400">{data.retention.retentionRate}%</p>
              <p className="text-xs text-gray-400 mt-1">Retention Rate</p>
            </div>
          </div>

          {/* Busiest Hours */}
          {data.busiestHours.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">Busiest Hours</h2>
              <p className="text-xs text-gray-500 mb-4">When your jobs happen</p>
              <BarChart data={data.busiestHours} valueKey="jobs" labelKey="label" color="amber" maxBars={24} />
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-gray-400 py-20">{t('reports.failedToLoad')}</div>
      )}
    </div>
  );
}
