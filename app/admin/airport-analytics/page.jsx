"use client";

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

const fmt = (n) =>
  n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-v-surface border border-v-border rounded-xl p-4">
      <div className="text-v-text-secondary text-xs uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-v-text-secondary text-xs mt-1">{sub}</div>}
    </div>
  );
}

function StatTable({ title, rows, cols }) {
  return (
    <div className="bg-v-surface border border-v-border rounded-xl p-5">
      <h3 className="text-white font-semibold mb-3">{title}</h3>
      {(!rows || rows.length === 0) ? (
        <p className="text-v-text-secondary text-sm">No data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-v-text-secondary text-left border-b border-v-border">
                {cols.map((c) => (
                  <th key={c.key} className={`py-2 pr-4 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-v-border/50">
                  {cols.map((c) => (
                    <td key={c.key} className={`py-2 pr-4 ${c.align === 'right' ? 'text-right tabular-nums' : ''} text-v-text`}>
                      {c.render ? c.render(r[c.key], r) : r[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AirportAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { window.location.href = '/login'; return; }
    fetch('/api/admin/airport-analytics', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-v-text-secondary">Loading airport analytics…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-red-400">{error || 'Failed to load data'}</div>
      </div>
    );
  }

  const chartData = (data.byClass || []).filter((r) => r.dimension).map((r) => ({
    name: r.dimension, value: Number(r.avg_value) || 0,
  }));

  return (
    <div className="min-h-screen bg-v-charcoal">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <a href="/admin" className="text-v-gold hover:text-v-gold text-sm">&larr; Admin</a>
          <h1 className="text-2xl font-bold text-white mt-2">Airport Analytics</h1>
          <p className="text-v-text-secondary text-sm mt-1">
            Anonymous, network-wide averages. No individual business is identifiable; the per-airport
            table is hidden until an airport has at least 3 quotes.
          </p>
        </div>

        {/* Coverage */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Airports loaded" value={num(data.meta?.airportsLoaded)} />
          <StatCard label="Quotes resolved to airport" value={num(data.meta?.quotesResolved)} />
          <StatCard label="Airports with MRO data" value={num(data.meta?.mroEnriched)}
            sub={data.meta?.mroEnriched ? null : 'pending FAA Part 145 load'} />
          <StatCard label="Airport classes tracked" value={num((data.byClass || []).length)} />
        </div>

        {/* Chart: avg quote value by airport class */}
        <div className="bg-v-surface border border-v-border rounded-xl p-5 mb-8">
          <h3 className="text-white font-semibold mb-4">Average quote value by airport class</h3>
          {chartData.length === 0 ? (
            <p className="text-v-text-secondary text-sm">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff14" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => '$' + (v / 1000) + 'k'} />
                <Tooltip
                  formatter={(v) => fmt(v)}
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#fff' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill="#C9A84C" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <StatTable
            title="By airport class"
            rows={data.byClass}
            cols={[
              { key: 'dimension', label: 'Class' },
              { key: 'n', label: 'n', align: 'right' },
              { key: 'avg_value', label: 'Avg', align: 'right', render: fmt },
              { key: 'median_value', label: 'Median', align: 'right', render: fmt },
              { key: 'stddev_value', label: 'Std dev', align: 'right', render: fmt },
              { key: 'avg_hours', label: 'Avg hrs', align: 'right', render: num },
            ]}
          />
          <StatTable
            title="By airport size (OurAirports type)"
            rows={data.byType}
            cols={[
              { key: 'dimension', label: 'Type' },
              { key: 'n', label: 'n', align: 'right' },
              { key: 'avg_value', label: 'Avg', align: 'right', render: fmt },
              { key: 'median_value', label: 'Median', align: 'right', render: fmt },
              { key: 'avg_runway_ft', label: 'Avg runway', align: 'right', render: (v) => v == null ? '—' : num(v) + ' ft' },
            ]}
          />
          <StatTable
            title="By runway length"
            rows={data.byRunway}
            cols={[
              { key: 'dimension', label: 'Runway', render: (v) => String(v).replace(/^\d+\.\s*/, '') },
              { key: 'n', label: 'n', align: 'right' },
              { key: 'avg_value', label: 'Avg', align: 'right', render: fmt },
              { key: 'stddev_value', label: 'Std dev', align: 'right', render: fmt },
              { key: 'avg_hours', label: 'Avg hrs', align: 'right', render: num },
            ]}
          />
          <StatTable
            title="By nearby MRO count"
            rows={data.byMro}
            cols={[
              { key: 'dimension', label: 'MRO shops' },
              { key: 'n', label: 'n', align: 'right' },
              { key: 'avg_value', label: 'Avg', align: 'right', render: fmt },
              { key: 'avg_hours', label: 'Avg hrs', align: 'right', render: num },
            ]}
          />
        </div>

        <StatTable
          title="Top airports by average quote value (min 3 quotes)"
          rows={data.leaderboard}
          cols={[
            { key: 'icao', label: 'Airport' },
            { key: 'city', label: 'City' },
            { key: 'airport_class', label: 'Class' },
            { key: 'runway_length_ft', label: 'Runway', align: 'right', render: (v) => v == null ? '—' : num(v) + ' ft' },
            { key: 'n', label: 'Quotes', align: 'right' },
            { key: 'avg_value', label: 'Avg', align: 'right', render: fmt },
            { key: 'total_value', label: 'Total', align: 'right', render: fmt },
          ]}
        />

        <p className="text-v-text-secondary text-xs mt-6">
          Generated {data.meta?.generatedAt}. Figures are network-wide aggregates for your reference only.
        </p>
      </div>
    </div>
  );
}
