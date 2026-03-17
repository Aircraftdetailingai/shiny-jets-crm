"use client";

import { useState, useEffect } from 'react';
import { formatPriceWhole } from '@/lib/formatPrice';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Redemptions', href: '/admin/redemptions' },
  { label: 'Aircraft', href: '/admin/aircraft' },
  { label: 'Vendors', href: '/admin/vendors' },
];

const DATE_RANGES = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const TIER_COLORS = {
  free: '#9ca3af',
  pro: '#f59e0b',
  business: '#3b82f6',
  enterprise: '#8b5cf6',
};

function MetricCard({ label, value, sub }) {
  return (
    <div className="bg-v-surface rounded-sm border border-v-border p-5">
      <p className="text-sm text-v-text-secondary">{label}</p>
      <p className="text-2xl font-bold text-v-text-primary mt-1">{value}</p>
      {sub && <p className="text-xs text-v-text-secondary mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-v-surface rounded-sm border border-v-border p-5">
      <h3 className="font-semibold text-v-text-primary mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  const fetchData = (rangeDays) => {
    setLoading(true);
    const token = localStorage.getItem('vector_token');
    if (!token) { window.location.href = '/login'; return; }

    fetch(`/api/admin/analytics?days=${rangeDays}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        setError('');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(days);
  }, []);

  const handleRangeChange = (newDays) => {
    setDays(newDays);
    fetchData(newDays);
  };

  if (error && !data) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  // Prepare tier pie data
  const tierPieData = data?.tierBreakdown ? Object.entries(data.tierBreakdown)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })) : [];

  // Prepare funnel data
  const funnelData = data ? [
    { stage: 'Sent', count: data.acceptanceRate.sent },
    { stage: 'Viewed', count: data.acceptanceRate.viewed },
    { stage: 'Accepted', count: data.acceptanceRate.accepted },
    { stage: 'Paid', count: data.acceptanceRate.paid },
    { stage: 'Completed', count: data.acceptanceRate.completed },
  ] : [];

  return (
    <div className="min-h-screen bg-v-charcoal">
      {/* Nav */}
      <nav className="bg-v-surface border-b border-v-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <span className="text-v-text-primary font-bold text-lg">Admin</span>
            {ADMIN_NAV.map(nav => (
              <a
                key={nav.href}
                href={nav.href}
                className={`text-sm ${nav.href === '/admin/analytics' ? 'text-v-gold font-medium' : 'text-v-text-secondary hover:text-v-text-primary'}`}
              >
                {nav.label}
              </a>
            ))}
          </div>
          <a href="/dashboard" className="text-sm text-v-text-secondary hover:text-v-text-primary">Back to app</a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header + Date Range */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-v-text-primary font-heading">Platform Analytics</h1>
            <p className="text-sm text-v-text-secondary">Aggregated, anonymized data across all accounts</p>
          </div>
          <div className="flex gap-2">
            {DATE_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => handleRangeChange(r.value)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  days === r.value
                    ? 'bg-amber-500 text-white'
                    : 'bg-v-surface border border-v-border text-v-text-secondary hover:border-v-gold/50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="text-center py-20 text-v-text-secondary">Loading analytics...</div>
        ) : data ? (
          <>
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Total Quotes" value={data.summary.totalQuotes.toLocaleString()} sub={`Last ${days} days`} />
              <MetricCard label="Avg Quote Value" value={`$${data.summary.avgValue.toLocaleString()}`} />
              <MetricCard label="Acceptance Rate" value={`${data.summary.acceptanceRate}%`} sub="Sent to accepted/paid" />
              <MetricCard label="Platform Revenue" value={`$${formatPriceWhole(data.summary.totalRevenue)}`} sub="Fees collected" />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* 1. Quote Volume Trends */}
              <ChartCard title="Quote Volume (Weekly)">
                {data.quoteVolume.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.quoteVolume}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#8A9BB0' }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11, fill: '#8A9BB0' }} />
                      <Tooltip labelFormatter={v => `Week of ${v}`} />
                      <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Quotes" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No data</p>}
              </ChartCard>

              {/* 2. Platform Revenue Trend */}
              <ChartCard title="Platform Revenue (Weekly)">
                {data.revenueByWeek.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={data.revenueByWeek}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#8A9BB0' }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11, fill: '#8A9BB0' }} tickFormatter={v => `$${v}`} />
                      <Tooltip formatter={v => [`$${v.toFixed(2)}`, 'Revenue']} labelFormatter={v => `Week of ${v}`} />
                      <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b98133" strokeWidth={2} name="Revenue" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No revenue data</p>}
              </ChartCard>

              {/* 3. Avg Quote Value by Aircraft */}
              <ChartCard title="Avg Quote Value by Aircraft Type">
                {data.avgByAircraft.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(280, data.avgByAircraft.length * 32)}>
                    <BarChart data={data.avgByAircraft} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#8A9BB0' }} tickFormatter={v => `$${v.toLocaleString()}`} />
                      <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: '#8A9BB0' }} width={120} />
                      <Tooltip formatter={v => [`$${v.toLocaleString()}`, 'Avg Value']} />
                      <Bar dataKey="avg" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Avg Value" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No data</p>}
              </ChartCard>

              {/* 4. Most Common Services */}
              <ChartCard title="Most Quoted Services">
                {data.topServices.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(280, data.topServices.slice(0, 10).length * 32)}>
                    <BarChart data={data.topServices.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#8A9BB0' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#8A9BB0' }} width={140} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Quotes" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No service data</p>}
              </ChartCard>

              {/* 5. Aircraft Frequency */}
              <ChartCard title="Aircraft Type Frequency">
                {data.aircraftFrequency.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(280, data.aircraftFrequency.slice(0, 10).length * 32)}>
                    <BarChart data={data.aircraftFrequency.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#8A9BB0' }} />
                      <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: '#8A9BB0' }} width={120} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Quotes" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No data</p>}
              </ChartCard>

              {/* 6. Geographic Distribution */}
              <ChartCard title="Top Airports">
                {data.geoDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(280, data.geoDistribution.slice(0, 10).length * 32)}>
                    <BarChart data={data.geoDistribution.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#8A9BB0' }} />
                      <YAxis type="category" dataKey="airport" tick={{ fontSize: 11, fill: '#8A9BB0' }} width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Quotes" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No airport data</p>}
              </ChartCard>

              {/* 7. Subscription Tier Breakdown */}
              <ChartCard title="Subscription Tier Breakdown">
                {tierPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={tierPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {tierPieData.map((entry) => (
                          <Cell key={entry.name} fill={TIER_COLORS[entry.name.toLowerCase()] || '#9ca3af'} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No data</p>}
              </ChartCard>

              {/* 8. Quote Funnel */}
              <ChartCard title="Quote Funnel (Acceptance Rate)">
                {funnelData.some(d => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={funnelData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                      <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#8A9BB0' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#8A9BB0' }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Quotes" radius={[4, 4, 0, 0]}>
                        {funnelData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-v-text-secondary text-sm py-10 text-center">No data</p>}
              </ChartCard>
            </div>

            {/* Community Hours Intelligence */}
            {data.community && (
              <>
                <div className="border-t border-v-border pt-6 mt-2">
                  <h2 className="text-xl font-bold text-v-text-primary font-heading mb-4">Community Hours Intelligence</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="Total Contributions" value={(data.community.totalContributions || 0).toLocaleString()} sub={`${data.community.thisMonth || 0} this month`} />
                  <MetricCard label="Unique Aircraft" value={(data.community.uniqueAircraft || 0).toLocaleString()} />
                  <MetricCard label="Pending Suggestions" value={(data.community.pendingSuggestions || 0).toLocaleString()} />
                  <MetricCard label="Defaults Updated" value={(data.community.defaultsUpdated || 0).toLocaleString()} sub="Via community data" />
                </div>

                {data.community.topAircraft && data.community.topAircraft.length > 0 && (
                  <ChartCard title="Most Contributed Aircraft">
                    <ResponsiveContainer width="100%" height={Math.max(280, data.community.topAircraft.length * 32)}>
                      <BarChart data={data.community.topAircraft} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#8A9BB0' }} />
                        <YAxis type="category" dataKey="aircraft" tick={{ fontSize: 11, fill: '#8A9BB0' }} width={160} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Contributions" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
