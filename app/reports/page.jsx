"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

const REPORT_TYPES = [
  {
    key: 'revenue',
    label: 'Revenue Report',
    description: 'All paid/completed jobs with fees breakdown',
    icon: '\u2191',
    color: 'text-green-400',
    borderColor: 'border-green-500/30',
    hasPdf: true,
  },
  {
    key: 'customers',
    label: 'Customer Report',
    description: 'Lifetime value, retention status, last service',
    icon: '\u2630',
    color: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    hasPdf: false,
  },
  {
    key: 'services',
    label: 'Services Report',
    description: 'Top services by revenue, bookings, avg ticket',
    icon: '\u2605',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/30',
    hasPdf: false,
  },
  {
    key: 'tax',
    label: 'Tax Summary',
    description: 'Monthly revenue, platform fees, net for accounting',
    icon: '\u2261',
    color: 'text-v-gold',
    borderColor: 'border-v-gold/30',
    hasPdf: true,
  },
];

const DATE_RANGES = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

function getDateRange(rangeKey, customStart, customEnd) {
  const now = new Date();
  let start, end;

  switch (rangeKey) {
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      end = now;
      break;
    }
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1);
      end = now;
      break;
    case 'custom':
      start = customStart ? new Date(customStart) : new Date(now.getFullYear(), 0, 1);
      end = customEnd ? new Date(customEnd + 'T23:59:59') : now;
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

function formatCurrency(val) {
  return `${currencySymbol()}${formatPrice(val)}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMonth(str) {
  if (!str) return '';
  const [y, m] = str.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [pdfLoading, setPdfLoading] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchReports(token);
  }, [router, dateRange, customStart, customEnd]);

  const fetchReports = async (token) => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange(dateRange, customStart, customEnd);
      const params = new URLSearchParams({ start, end, type: 'all' });
      const res = await fetch(`/api/reports?${params}`, {
        headers: { Authorization: `Bearer ${token || localStorage.getItem('vector_token')}` },
      });
      if (res.ok) {
        setData(await res.json());
      } else {
        setError('Failed to load reports');
      }
    } catch {
      setError('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = (type) => {
    if (!data) return;
    let headers, rows, filename;

    switch (type) {
      case 'revenue':
        if (!data.revenue?.rows?.length) return;
        headers = ['Date', 'Customer', 'Email', 'Aircraft', 'Services', 'Subtotal', 'Fees', 'Net Total', 'Status'];
        rows = data.revenue.rows.map(r => [
          r.date ? new Date(r.date).toLocaleDateString() : '',
          r.customer, r.email, r.aircraft, r.services,
          r.subtotal.toFixed(2), r.fees.toFixed(2), r.total.toFixed(2), r.status,
        ]);
        filename = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
        break;

      case 'customers':
        if (!data.customers?.rows?.length) return;
        headers = ['Customer', 'Contact', 'Email', 'Lifetime Value', 'Quotes', 'Paid Jobs', 'Last Service', 'Retention'];
        rows = data.customers.rows.map(r => [
          r.name, r.contact, r.email, r.totalValue.toFixed(2),
          r.quoteCount, r.paidCount,
          r.lastServiceDate ? new Date(r.lastServiceDate).toLocaleDateString() : '',
          r.retention,
        ]);
        filename = `customer-report-${new Date().toISOString().slice(0, 10)}.csv`;
        break;

      case 'services':
        if (!data.services?.rows?.length) return;
        headers = ['Service', 'Times Booked', 'Total Hours', 'Total Revenue', 'Avg Ticket'];
        rows = data.services.rows.map(r => [
          r.name, r.timesBooked,
          r.totalHours > 0 ? r.totalHours.toFixed(1) : '0',
          r.totalRevenue.toFixed(2), r.avgTicket.toFixed(2),
        ]);
        filename = `services-report-${new Date().toISOString().slice(0, 10)}.csv`;
        break;

      case 'tax':
        if (!data.tax?.rows?.length) return;
        headers = ['Month', 'Jobs', 'Gross Revenue', 'Platform Fees', 'Net Revenue'];
        rows = data.tax.rows.map(r => [
          fmtMonth(r.month), r.jobCount,
          r.revenue.toFixed(2), r.fees.toFixed(2), r.net.toFixed(2),
        ]);
        filename = `tax-summary-${new Date().toISOString().slice(0, 10)}.csv`;
        break;

      default:
        return;
    }

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async (type) => {
    setPdfLoading(type);
    try {
      const token = localStorage.getItem('vector_token');
      const { start, end } = getDateRange(dateRange, customStart, customEnd);
      const params = new URLSearchParams({ type, start, end });
      const res = await fetch(`/api/reports/pdf?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        alert('Failed to generate PDF');
      }
    } catch {
      alert('Failed to generate PDF');
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="page-transition min-h-screen bg-v-charcoal">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-2xl text-v-text-secondary hover:text-v-gold">&#8592;</a>
            <div>
              <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>
                REPORTS
              </h1>
              <p className="text-v-text-secondary text-xs mt-1">Downloadable business reports</p>
            </div>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {DATE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                dateRange === r.key
                  ? 'bg-v-gold text-v-charcoal'
                  : 'bg-v-surface text-v-text-secondary border border-v-border hover:text-v-text-primary hover:border-v-gold/50'
              }`}
            >
              {r.label}
            </button>
          ))}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 rounded text-xs bg-v-surface border border-v-border text-v-text-primary [color-scheme:dark]"
              />
              <span className="text-v-text-secondary text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 rounded text-xs bg-v-surface border border-v-border text-v-text-primary [color-scheme:dark]"
              />
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-v-text-secondary text-xs tracking-widest uppercase">Loading reports</p>
            </div>
          </div>
        )}
        {error && <p className="text-red-400 text-center py-8 text-sm">{error}</p>}

        {/* Report Cards Grid */}
        {!loading && data && !activeReport && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {REPORT_TYPES.map(rt => {
              const reportData = data[rt.key];
              const rowCount = reportData?.rows?.length || 0;
              return (
                <div
                  key={rt.key}
                  className={`bg-v-surface border ${rt.borderColor} rounded-sm p-5 hover:bg-white/[0.02] transition-colors`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-xl ${rt.color}`}>{rt.icon}</span>
                      <div>
                        <h3 className="text-sm font-medium text-v-text-primary">{rt.label}</h3>
                        <p className="text-xs text-v-text-secondary mt-0.5">{rt.description}</p>
                      </div>
                    </div>
                    <span className="text-xs text-v-text-secondary bg-v-charcoal px-2 py-0.5 rounded">
                      {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                    </span>
                  </div>

                  {/* Mini summary */}
                  {rt.key === 'revenue' && reportData?.summary && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-v-gold font-data">{formatCurrency(reportData.summary.totalRevenue)}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Revenue</p>
                      </div>
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-red-400 font-data">{formatCurrency(reportData.summary.totalFees)}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Fees</p>
                      </div>
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-green-400 font-data">{formatCurrency(reportData.summary.netRevenue)}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Net</p>
                      </div>
                    </div>
                  )}
                  {rt.key === 'customers' && reportData?.summary && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-blue-400 font-data">{reportData.summary.totalCustomers}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Total</p>
                      </div>
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-green-400 font-data">{reportData.summary.activeCustomers}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Active</p>
                      </div>
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-v-gold font-data">{reportData.summary.atRiskCustomers}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">At Risk</p>
                      </div>
                    </div>
                  )}
                  {rt.key === 'services' && reportData?.summary && (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-purple-400 font-data">{reportData.summary.totalBookings}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Total Bookings</p>
                      </div>
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-v-text-primary font-data truncate">{reportData.summary.topService}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Top Service</p>
                      </div>
                    </div>
                  )}
                  {rt.key === 'tax' && reportData?.summary && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-v-gold font-data">{formatCurrency(reportData.summary.totalRevenue)}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Gross</p>
                      </div>
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-red-400 font-data">{formatCurrency(reportData.summary.totalFees)}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Fees</p>
                      </div>
                      <div className="bg-v-charcoal rounded px-2 py-1.5 text-center">
                        <p className="text-sm font-bold text-green-400 font-data">{formatCurrency(reportData.summary.netRevenue)}</p>
                        <p className="text-[9px] text-v-text-secondary uppercase">Net</p>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveReport(rt.key)}
                      disabled={rowCount === 0}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-v-text-primary bg-v-charcoal border border-v-border rounded hover:border-v-gold/50 transition-colors disabled:opacity-40"
                    >
                      View Report
                    </button>
                    <button
                      onClick={() => exportCSV(rt.key)}
                      disabled={rowCount === 0}
                      className="px-3 py-1.5 text-xs font-medium text-green-400 border border-green-500/30 rounded hover:bg-green-500/10 transition-colors disabled:opacity-40"
                    >
                      CSV
                    </button>
                    {rt.hasPdf && (
                      <button
                        onClick={() => exportPDF(rt.key)}
                        disabled={rowCount === 0 || pdfLoading === rt.key}
                        className="px-3 py-1.5 text-xs font-medium text-v-gold border border-v-gold/30 rounded hover:bg-v-gold/10 transition-colors disabled:opacity-40"
                      >
                        {pdfLoading === rt.key ? '...' : 'PDF'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Active Report Detail View */}
        {!loading && data && activeReport && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setActiveReport(null)}
                className="text-v-text-secondary hover:text-v-gold text-lg"
              >
                &#8592;
              </button>
              <h2 className="text-lg font-medium text-v-text-primary">
                {REPORT_TYPES.find(r => r.key === activeReport)?.label}
              </h2>
              <div className="flex-1" />
              <button
                onClick={() => exportCSV(activeReport)}
                className="px-3 py-1.5 text-xs font-medium text-green-400 border border-green-500/30 rounded hover:bg-green-500/10 transition-colors"
              >
                Export CSV
              </button>
              {REPORT_TYPES.find(r => r.key === activeReport)?.hasPdf && (
                <button
                  onClick={() => exportPDF(activeReport)}
                  disabled={pdfLoading === activeReport}
                  className="px-3 py-1.5 text-xs font-medium text-v-gold border border-v-gold/30 rounded hover:bg-v-gold/10 transition-colors disabled:opacity-40"
                >
                  {pdfLoading === activeReport ? 'Generating...' : 'Export PDF'}
                </button>
              )}
            </div>

            {activeReport === 'revenue' && <RevenueTable data={data.revenue} />}
            {activeReport === 'customers' && <CustomerTable data={data.customers} />}
            {activeReport === 'services' && <ServicesTable data={data.services} />}
            {activeReport === 'tax' && <TaxTable data={data.tax} />}
          </div>
        )}
      </div>
    </div>
  );
}

function RevenueTable({ data }) {
  if (!data?.rows?.length) return <EmptyState />;
  const { rows, summary } = data;
  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard label="Gross Revenue" value={formatCurrency(summary.totalRevenue)} color="text-v-gold" />
        <StatCard label="Platform Fees" value={formatCurrency(summary.totalFees)} color="text-red-400" />
        <StatCard label="Net Revenue" value={formatCurrency(summary.netRevenue)} color="text-green-400" />
        <StatCard label="Avg Job Value" value={formatCurrency(summary.avgJobValue)} color="text-blue-400" />
      </div>
      <div className="bg-v-surface border border-v-border rounded-sm overflow-x-auto">
        <div className="sticky top-0 z-10 bg-v-surface border-b border-[#1A2236]">
          <div className="grid grid-cols-[100px_1fr_1fr_1.5fr_90px_80px_90px] min-w-[800px] px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
            <div>Date</div><div>Customer</div><div>Aircraft</div><div>Services</div>
            <div className="text-right">Subtotal</div><div className="text-right">Fees</div><div className="text-right">Net</div>
          </div>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[100px_1fr_1fr_1.5fr_90px_80px_90px] min-w-[800px] px-5 items-center border-b border-[#1A2236] hover:bg-white/[0.02]" style={{ height: '48px' }}>
            <div className="text-xs text-[#8A9BB0]">{fmtDate(row.date)}</div>
            <div className="text-sm text-white truncate pr-3">{row.customer || '—'}</div>
            <div className="text-sm text-[#8A9BB0] truncate pr-3">{row.aircraft || '—'}</div>
            <div className="text-xs text-[#8A9BB0] truncate pr-3" title={row.services}>{row.services || '—'}</div>
            <div className="text-right text-sm text-v-text-primary font-data">{formatCurrency(row.subtotal)}</div>
            <div className="text-right text-xs text-red-400 font-data">{formatCurrency(row.fees)}</div>
            <div className="text-right text-sm text-v-gold font-data font-medium">{formatCurrency(row.total)}</div>
          </div>
        ))}
        <div className="px-5 py-3 border-t border-[#1A2236] flex justify-between text-xs text-[#8A9BB0]">
          <span>{rows.length} transactions</span>
          <span className="text-v-gold font-data font-medium">Net: {formatCurrency(summary.netRevenue)}</span>
        </div>
      </div>
    </div>
  );
}

function CustomerTable({ data }) {
  if (!data?.rows?.length) return <EmptyState />;
  const { rows, summary } = data;
  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Customers" value={summary.totalCustomers} color="text-blue-400" />
        <StatCard label="Active" value={summary.activeCustomers} color="text-green-400" />
        <StatCard label="At Risk" value={summary.atRiskCustomers} color="text-v-gold" />
        <StatCard label="Avg Lifetime Value" value={formatCurrency(summary.avgLifetimeValue)} color="text-v-gold" />
      </div>
      <div className="bg-v-surface border border-v-border rounded-sm overflow-x-auto">
        <div className="sticky top-0 z-10 bg-v-surface border-b border-[#1A2236]">
          <div className="grid grid-cols-[1fr_90px_60px_100px_80px] min-w-[600px] px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
            <div>Customer</div><div className="text-right">Lifetime Value</div><div className="text-right">Quotes</div><div>Last Service</div><div>Status</div>
          </div>
        </div>
        {rows.map((row, i) => {
          const retColors = { Loyal: 'text-green-400 border-green-500/30', Active: 'text-blue-400 border-blue-500/30', 'At Risk': 'text-v-gold border-v-gold/30', New: 'text-[#8A9BB0] border-gray-500/30' };
          return (
            <div key={i} className="grid grid-cols-[1fr_90px_60px_100px_80px] min-w-[600px] px-5 items-center border-b border-[#1A2236] hover:bg-white/[0.02]" style={{ height: '48px' }}>
              <div className="truncate pr-3">
                <span className="text-sm text-white">{row.name}</span>
                {row.email && <span className="text-xs text-[#8A9BB0] ml-2">{row.email}</span>}
              </div>
              <div className="text-right text-sm text-v-gold font-data">{formatCurrency(row.totalValue)}</div>
              <div className="text-right text-sm text-[#8A9BB0] font-data">{row.quoteCount}</div>
              <div className="text-xs text-[#8A9BB0]">{row.lastServiceDate ? fmtDate(row.lastServiceDate) : '—'}</div>
              <div>
                <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded ${retColors[row.retention] || retColors.New}`}>
                  {row.retention}
                </span>
              </div>
            </div>
          );
        })}
        <div className="px-5 py-3 border-t border-[#1A2236] text-xs text-[#8A9BB0]">{rows.length} customers</div>
      </div>
    </div>
  );
}

function ServicesTable({ data }) {
  if (!data?.rows?.length) return <EmptyState />;
  const { rows, summary } = data;
  const maxRevenue = Math.max(...rows.map(r => r.totalRevenue), 1);
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Service Types" value={summary.totalServices} color="text-purple-400" />
        <StatCard label="Total Bookings" value={summary.totalBookings} color="text-blue-400" />
        <StatCard label="Top Service" value={summary.topService} color="text-v-gold" isText />
      </div>
      <div className="bg-v-surface border border-v-border rounded-sm overflow-x-auto">
        <div className="sticky top-0 z-10 bg-v-surface border-b border-[#1A2236]">
          <div className="grid grid-cols-[1fr_70px_70px_100px_90px_1fr] min-w-[700px] px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
            <div>Service</div><div className="text-right">Booked</div><div className="text-right">Hours</div>
            <div className="text-right">Revenue</div><div className="text-right">Avg Ticket</div><div></div>
          </div>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_70px_100px_90px_1fr] min-w-[700px] px-5 items-center border-b border-[#1A2236] hover:bg-white/[0.02]" style={{ height: '48px' }}>
            <div className="text-sm text-white font-medium truncate pr-3">{row.name}</div>
            <div className="text-right text-sm text-[#8A9BB0] font-data">{row.timesBooked}</div>
            <div className="text-right text-sm text-[#8A9BB0] font-data">{row.totalHours > 0 ? row.totalHours.toFixed(1) : '—'}</div>
            <div className="text-right text-sm text-v-gold font-data">{formatCurrency(row.totalRevenue)}</div>
            <div className="text-right text-sm text-[#8A9BB0] font-data">{formatCurrency(row.avgTicket)}</div>
            <div className="pl-3">
              <div className="h-2 bg-v-charcoal rounded-full overflow-hidden">
                <div className="h-full bg-purple-500/60 rounded-full" style={{ width: `${(row.totalRevenue / maxRevenue) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
        <div className="px-5 py-3 border-t border-[#1A2236] text-xs text-[#8A9BB0]">{rows.length} services</div>
      </div>
    </div>
  );
}

function TaxTable({ data }) {
  if (!data?.rows?.length) return <EmptyState />;
  const { rows, summary } = data;
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Gross Revenue" value={formatCurrency(summary.totalRevenue)} color="text-v-gold" />
        <StatCard label="Platform Fees Paid" value={formatCurrency(summary.totalFees)} color="text-red-400" />
        <StatCard label="Net Revenue" value={formatCurrency(summary.netRevenue)} color="text-green-400" />
      </div>
      <div className="bg-v-surface border border-v-border rounded-sm overflow-x-auto">
        <div className="sticky top-0 z-10 bg-v-surface border-b border-[#1A2236]">
          <div className="grid grid-cols-[1fr_80px_100px_90px_100px] min-w-[550px] px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
            <div>Month</div><div className="text-right">Jobs</div><div className="text-right">Revenue</div>
            <div className="text-right">Fees</div><div className="text-right">Net</div>
          </div>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_100px_90px_100px] min-w-[550px] px-5 items-center border-b border-[#1A2236] hover:bg-white/[0.02]" style={{ height: '48px' }}>
            <div className="text-sm text-white font-medium">{fmtMonth(row.month)}</div>
            <div className="text-right text-sm text-[#8A9BB0] font-data">{row.jobCount}</div>
            <div className="text-right text-sm text-v-text-primary font-data">{formatCurrency(row.revenue)}</div>
            <div className="text-right text-xs text-red-400 font-data">{formatCurrency(row.fees)}</div>
            <div className="text-right text-sm text-v-gold font-data font-medium">{formatCurrency(row.net)}</div>
          </div>
        ))}
        {/* Totals row */}
        <div className="grid grid-cols-[1fr_80px_100px_90px_100px] min-w-[550px] px-5 items-center border-t-2 border-v-gold/30 bg-v-charcoal/50" style={{ height: '48px' }}>
          <div className="text-sm text-white font-bold">TOTAL</div>
          <div className="text-right text-sm text-white font-data font-bold">{rows.reduce((s, r) => s + r.jobCount, 0)}</div>
          <div className="text-right text-sm text-white font-data font-bold">{formatCurrency(summary.totalRevenue)}</div>
          <div className="text-right text-sm text-red-400 font-data font-bold">{formatCurrency(summary.totalFees)}</div>
          <div className="text-right text-sm text-v-gold font-data font-bold">{formatCurrency(summary.netRevenue)}</div>
        </div>
        <div className="px-5 py-3 border-t border-[#1A2236] text-xs text-[#8A9BB0]">{rows.length} months</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, isText }) {
  return (
    <div className="bg-v-surface border border-v-border-subtle rounded-sm p-3 text-center">
      <p className={`text-lg font-bold font-data ${color} ${isText ? 'text-sm truncate' : ''}`}>{value}</p>
      <p className="text-[9px] text-v-text-secondary uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-v-surface border border-v-border rounded-sm p-12 text-center">
      <p className="text-v-text-secondary text-sm">No data for this report in the selected date range.</p>
    </div>
  );
}
