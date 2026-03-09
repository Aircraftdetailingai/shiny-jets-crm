"use client";

import { useState, useEffect } from 'react';
import { formatPriceWhole } from '@/lib/formatPrice';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Redemptions', href: '/admin/redemptions' },
  { label: 'Aircraft', href: '/admin/aircraft' },
  { label: 'Vendors', href: '/admin/vendors' },
];

const STATUS_COLORS = {
  free: 'bg-gray-100 text-gray-700',
  pro: 'bg-amber-100 text-amber-800',
  business: 'bg-blue-100 text-blue-800',
  enterprise: 'bg-purple-100 text-purple-800',
};

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('signups');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { window.location.href = '/login'; return; }

    fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading admin dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  const { metrics, planCounts, points, recentSignups, recentQuotes, recentRedemptions, signupsByDay, revenueByDay } = data;

  // Simple bar chart renderer
  const renderBarChart = (dataObj, color, prefix = '') => {
    const entries = Object.entries(dataObj);
    const maxVal = Math.max(...entries.map(([, v]) => v), 1);
    return (
      <div className="flex items-end gap-[2px] h-32">
        {entries.map(([date, val]) => (
          <div key={date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div
              className={`w-full ${color} rounded-t-sm min-h-[2px] transition-all`}
              style={{ height: `${(val / maxVal) * 100}%` }}
            />
            <div className="hidden group-hover:block absolute -top-8 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
              {date.slice(5)}: {prefix}{typeof val === 'number' && val % 1 !== 0 ? val.toFixed(0) : val}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Pie chart (simple CSS)
  const total = Object.values(planCounts).reduce((s, v) => s + v, 0) || 1;
  const pieColors = { free: '#9ca3af', pro: '#f59e0b', business: '#3b82f6', enterprise: '#8b5cf6' };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Nav */}
      <nav className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">&larr; App</a>
            <span className="font-bold text-gray-900">Admin</span>
            {ADMIN_NAV.map(nav => (
              <a
                key={nav.href}
                href={nav.href}
                className={`text-sm ${nav.href === '/admin' ? 'text-amber-600 font-medium' : 'text-gray-500 hover:text-gray-900'}`}
              >
                {nav.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Detailers', value: metrics.totalDetailers, color: 'text-gray-900' },
            { label: 'Active (30d)', value: metrics.activeDetailers, color: 'text-green-600' },
            { label: 'MRR', value: `$${formatPriceWhole(metrics.mrr)}`, color: 'text-blue-600' },
            { label: 'Platform Fees (month)', value: `$${formatPriceWhole(metrics.platformFeesMonth)}`, color: 'text-amber-600' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{m.label}</p>
              <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Subscription + Points Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Subscription Breakdown */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Subscription Breakdown</h3>
            <div className="flex items-center gap-6">
              {/* Pie visual */}
              <div className="w-24 h-24 rounded-full relative" style={{
                background: `conic-gradient(
                  ${pieColors.free} 0deg ${(planCounts.free / total) * 360}deg,
                  ${pieColors.pro} ${(planCounts.free / total) * 360}deg ${((planCounts.free + planCounts.pro) / total) * 360}deg,
                  ${pieColors.business} ${((planCounts.free + planCounts.pro) / total) * 360}deg ${((planCounts.free + planCounts.pro + planCounts.business) / total) * 360}deg,
                  ${pieColors.enterprise} ${((planCounts.free + planCounts.pro + planCounts.business) / total) * 360}deg 360deg
                )`
              }}>
                <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-700">{total}</span>
                </div>
              </div>
              <div className="space-y-2 flex-1">
                {Object.entries(planCounts).map(([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pieColors[plan] }} />
                      <span className="text-sm capitalize text-gray-700">{plan}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Points Stats */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Points Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Issued', value: points.issued.toLocaleString(), color: 'text-blue-600' },
                { label: 'Redeemed', value: points.redeemed.toLocaleString(), color: 'text-green-600' },
                { label: 'Outstanding', value: points.outstanding.toLocaleString(), color: 'text-amber-600' },
                { label: 'Avg Per User', value: points.avgPerUser.toLocaleString(), color: 'text-gray-600' },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Signups (30 days)</h3>
            {renderBarChart(signupsByDay, 'bg-blue-500')}
            <p className="text-xs text-gray-400 mt-2 text-center">
              Total: {Object.values(signupsByDay).reduce((s, v) => s + v, 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Revenue (30 days)</h3>
            {renderBarChart(revenueByDay, 'bg-green-500', '$')}
            <p className="text-xs text-gray-400 mt-2 text-center">
              Total: ${formatPriceWhole(Object.values(revenueByDay).reduce((s, v) => s + v, 0))}
            </p>
          </div>
        </div>

        {/* Recent Activity Tabs */}
        <div className="bg-white rounded-xl border">
          <div className="border-b px-5 pt-4">
            <div className="flex gap-4">
              {[
                { key: 'signups', label: 'Recent Signups' },
                { key: 'quotes', label: 'Recent Quotes' },
                { key: 'redemptions', label: 'Recent Redemptions' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-amber-500 text-amber-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 overflow-x-auto">
            {activeTab === 'signups' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Company</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Signed Up</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSignups.map(d => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 text-gray-900">{d.email}</td>
                      <td className="py-2 text-gray-600">{d.company || '-'}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[(d.plan || 'free').toLowerCase()] || STATUS_COLORS.free}`}>
                          {d.plan || 'free'}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{new Date(d.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {recentSignups.length === 0 && (
                    <tr><td colSpan="4" className="py-4 text-center text-gray-400">No recent signups</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'quotes' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Aircraft</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQuotes.map(q => (
                    <tr key={q.id} className="border-b last:border-0">
                      <td className="py-2 text-gray-900">{q.client_name || '-'}</td>
                      <td className="py-2 text-gray-600">{q.aircraft_model || '-'}</td>
                      <td className="py-2 font-medium">${formatPriceWhole(q.total_price || 0)}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          q.status === 'paid' ? 'bg-green-100 text-green-700'
                          : q.status === 'sent' ? 'bg-blue-100 text-blue-700'
                          : q.status === 'accepted' ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {q.status || 'draft'}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{new Date(q.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {recentQuotes.length === 0 && (
                    <tr><td colSpan="5" className="py-4 text-center text-gray-400">No recent quotes</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'redemptions' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Reward</th>
                    <th className="pb-2 font-medium">Points</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRedemptions.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 text-gray-900">{r.reward_name}</td>
                      <td className="py-2 text-gray-600">{r.points_spent}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'completed' ? 'bg-green-100 text-green-700'
                          : r.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                          : r.status === 'cancelled' ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {recentRedemptions.length === 0 && (
                    <tr><td colSpan="4" className="py-4 text-center text-gray-400">No redemptions yet</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
