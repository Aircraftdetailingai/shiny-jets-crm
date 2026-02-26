"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';

const COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);
}

function formatMonth(str) {
  if (!str) return '';
  const [y, m] = str.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// CSS bar chart
function BarChart({ data, valueKey, labelKey, formatValue, color, noDataLabel }) {
  if (!data || data.length === 0) return <p className="text-gray-400 text-sm text-center py-6">{noDataLabel}</p>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-28 truncate text-right">{item[labelKey]}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((item[valueKey] / max) * 100, 2)}%`, backgroundColor: color || COLORS[i % COLORS.length] }}
            />
            <span className="absolute right-2 top-0.5 text-xs font-medium text-gray-700">
              {formatValue ? formatValue(item[valueKey]) : item[valueKey]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// CSS pie chart using conic-gradient
function PieChart({ data, valueKey, labelKey, noDataLabel }) {
  if (!data || data.length === 0) return <p className="text-gray-400 text-sm text-center py-6">{noDataLabel}</p>;
  const total = data.reduce((sum, d) => sum + (d[valueKey] || 0), 0);
  if (total === 0) return <p className="text-gray-400 text-sm text-center py-6">{noDataLabel}</p>;

  let cumulative = 0;
  const segments = data.map((item, i) => {
    const pct = (item[valueKey] / total) * 100;
    const start = cumulative;
    cumulative += pct;
    return { ...item, pct, start, end: cumulative, color: COLORS[i % COLORS.length] };
  });

  const gradient = segments
    .map(s => `${s.color} ${s.start}% ${s.end}%`)
    .join(', ');

  return (
    <div className="flex items-center gap-6">
      <div
        className="w-36 h-36 rounded-full flex-shrink-0"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <div className="space-y-1 flex-1 min-w-0">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-700 truncate flex-1">{s[labelKey]}</span>
            <span className="text-gray-500 font-medium">{s[valueKey]}</span>
            <span className="text-gray-400 text-xs">({s.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Revenue timeline chart (vertical bars)
function TimelineChart({ data, noDataLabel }) {
  if (!data || data.length === 0) return <p className="text-gray-400 text-sm text-center py-6">{noDataLabel}</p>;
  const max = Math.max(...data.map(d => d.revenue || 0), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <span className="text-xs text-gray-500 mb-1 hidden md:block">{formatCurrency(item.revenue)}</span>
          <div
            className="w-full rounded-t transition-all duration-500 min-h-[4px]"
            style={{
              height: `${Math.max((item.revenue / max) * 100, 3)}%`,
              backgroundColor: COLORS[i % COLORS.length],
            }}
            title={`${formatMonth(item.month)}: ${formatCurrency(item.revenue)}`}
          />
          <span className="text-xs text-gray-400 mt-1 truncate w-full text-center">{formatMonth(item.month)}</span>
        </div>
      ))}
    </div>
  );
}

// Customer acquisition line (step bars)
function AcquisitionChart({ data, noDataLabel }) {
  if (!data || data.length === 0) return <p className="text-gray-400 text-sm text-center py-6">{noDataLabel}</p>;
  const max = Math.max(...data.map(d => d.count || 0), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <span className="text-xs text-gray-500 mb-1">{item.count}</span>
          <div
            className="w-full rounded-t transition-all duration-500 bg-purple-500 min-h-[4px]"
            style={{ height: `${Math.max((item.count / max) * 100, 3)}%` }}
            title={`${formatMonth(item.month)}: ${t('reportsExtra.newCustomers', { count: item.count })}`}
          />
          <span className="text-xs text-gray-400 mt-1 truncate w-full text-center">{formatMonth(item.month)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [range, setRange] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [error, setError] = useState(null);

  const RANGES = {
    week: { label: t('reports.thisWeek'), days: 7 },
    month: { label: t('reports.thisMonth'), days: 30 },
    quarter: { label: t('reports.thisQuarter'), days: 90 },
    year: { label: t('reports.thisYear'), days: 365 },
    custom: { label: t('reports.custom'), days: 0 },
  };

  const getDateRange = () => {
    if (range === 'custom' && customStart && customEnd) {
      return { start: new Date(customStart).toISOString(), end: new Date(customEnd + 'T23:59:59').toISOString() };
    }
    const days = RANGES[range]?.days || 30;
    const end = new Date();
    const start = new Date(end - days * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchReport(token);
  }, [router, range, customStart, customEnd]);

  const fetchReport = async (token) => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange();
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/reports?${params}`, {
        headers: { Authorization: `Bearer ${token || localStorage.getItem('vector_token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        setError(t('reports.failedToLoad'));
      }
    } catch (err) {
      setError(t('reports.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!report?.exportData?.length) return;
    const headers = [t('common.date'), t('common.customer'), t('common.email'), t('common.aircraft'), t('common.status'), t('common.amount'), t('reports.paidAt')];
    const rows = report.exportData.map(r => [
      r.date ? new Date(r.date).toLocaleDateString() : '',
      r.customer,
      r.email,
      r.aircraft,
      r.status,
      r.amount.toFixed(2),
      r.paid_at ? new Date(r.paid_at).toLocaleDateString() : '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vector-report-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = report?.summary;

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-white text-2xl hover:opacity-70">&larr;</a>
          <h1 className="text-2xl font-bold text-white">{t('reports.title')}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(RANGES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                range === key
                  ? 'bg-amber-500 text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={exportCSV}
            disabled={!report?.exportData?.length}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('reports.exportCsv')}
          </button>
        </div>
      </div>

      {/* Custom date range */}
      {range === 'custom' && (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-white/10 text-white border border-white/20 [color-scheme:dark]"
          />
          <span className="text-white">{t('common.to')}</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-white/10 text-white border border-white/20 [color-scheme:dark]"
          />
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div className="text-white text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
          <p>{t('reports.loadingReport')}</p>
        </div>
      )}
      {error && <p className="text-red-400 text-center py-8">{error}</p>}

      {/* Report Content */}
      {!loading && report && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-lg p-3 shadow">
              <p className="text-gray-500 text-xs">{t('reports.totalRevenue')}</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(s?.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow">
              <p className="text-gray-500 text-xs">{t('reports.quotesSent')}</p>
              <p className="text-xl font-bold text-blue-600">{s?.totalQuotes || 0}</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow">
              <p className="text-gray-500 text-xs">{t('reports.jobsPaid')}</p>
              <p className="text-xl font-bold text-green-600">{s?.totalPaid || 0}</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow">
              <p className="text-gray-500 text-xs">{t('reports.avgJobValue')}</p>
              <p className="text-xl font-bold text-amber-600">{formatCurrency(s?.avgJobValue)}</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow">
              <p className="text-gray-500 text-xs">{t('reports.conversionRate')}</p>
              <p className="text-xl font-bold text-purple-600">{(s?.conversionRate || 0).toFixed(0)}%</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow">
              <p className="text-gray-500 text-xs">{t('reports.pendingRevenue')}</p>
              <p className="text-xl font-bold text-red-500">{formatCurrency(s?.pendingRevenue)}</p>
            </div>
          </div>

          {/* Revenue Timeline */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h2 className="font-semibold text-gray-800 mb-3">{t('reports.revenueByMonth')}</h2>
            <TimelineChart data={report.revenueTimeline} noDataLabel={t('reports.noData')} />
          </div>

          {/* Two column: Service Types + Aircraft Revenue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Jobs by Service Type (Pie) */}
            <div className="bg-white rounded-lg p-4 shadow">
              <h2 className="font-semibold text-gray-800 mb-3">{t('reports.jobsByService')}</h2>
              <PieChart data={report.jobsByService} valueKey="count" labelKey="name" noDataLabel={t('reports.noData')} />
            </div>

            {/* Revenue by Aircraft Type (Bar) */}
            <div className="bg-white rounded-lg p-4 shadow">
              <h2 className="font-semibold text-gray-800 mb-3">{t('reports.revenueByAircraft')}</h2>
              <BarChart
                data={report.revenueByAircraft}
                valueKey="revenue"
                labelKey="name"
                formatValue={formatCurrency}
                noDataLabel={t('reports.noData')}
              />
            </div>
          </div>

          {/* Customer Acquisition */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h2 className="font-semibold text-gray-800 mb-3">{t('reports.newCustomersByMonth')}</h2>
            <AcquisitionChart data={report.customerAcquisition} noDataLabel={t('reports.noData')} />
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-lg p-4 shadow overflow-x-auto">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold text-gray-800">{t('reports.allQuotes')} ({report.exportData?.length || 0})</h2>
              <button
                onClick={exportCSV}
                disabled={!report?.exportData?.length}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40"
              >
                {t('reports.exportCsv')}
              </button>
            </div>
            {report.exportData?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-3">{t('common.date')}</th>
                    <th className="py-2 pr-3">{t('common.customer')}</th>
                    <th className="py-2 pr-3">{t('common.aircraft')}</th>
                    <th className="py-2 pr-3">{t('common.status')}</th>
                    <th className="py-2 text-right">{t('common.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.exportData.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-600">{row.date ? new Date(row.date).toLocaleDateString() : ''}</td>
                      <td className="py-2 pr-3 text-gray-800">{row.customer || '-'}</td>
                      <td className="py-2 pr-3 text-gray-600">{row.aircraft || '-'}</td>
                      <td className="py-2 pr-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          row.status === 'paid' || row.status === 'completed' ? 'bg-green-100 text-green-700' :
                          row.status === 'sent' || row.status === 'viewed' ? 'bg-blue-100 text-blue-700' :
                          row.status === 'declined' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {t('status.' + row.status)}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-400 text-center py-6">{t('reports.noQuotesInPeriod')}</p>
            )}
            {report.exportData?.length > 50 && (
              <p className="text-xs text-gray-400 mt-2 text-center">{t('reports.showingOf')} {report.exportData.length} {t('reports.exportForFull')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
