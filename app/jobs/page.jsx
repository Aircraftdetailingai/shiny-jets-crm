"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ExportGate from '@/components/ExportGate';

export default function JobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState(30);
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
    fetchJobs(token);
  }, [router, period]);

  const fetchJobs = async (token) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs?period=${period}`, {
        headers: { Authorization: `Bearer ${token || localStorage.getItem('vector_token')}` },
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setStats(data.stats);
      } else {
        setError('Failed to load jobs');
      }
    } catch (err) {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const exportCSV = () => {
    if (jobs.length === 0) return;

    const headers = ['date', 'customer_name', 'aircraft', 'services', 'amount', 'status'];
    const rows = jobs.map(job => {
      // Parse services from line_items if available
      const services = job.quotes?.line_items
        ? job.quotes.line_items.map(item => item.description || item.service).join('; ')
        : '';

      return [
        job.completed_at ? new Date(job.completed_at).toISOString().split('T')[0] : '',
        job.quotes?.client_name || '',
        job.quotes?.aircraft_model || '',
        services,
        job.revenue?.toFixed(2) || '0.00',
        'completed'
      ];
    });

    // Escape CSV values
    const escapeCSV = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    const today = new Date().toISOString().split('T')[0];
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jobs-export-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 text-gray-900">
      <header className="text-white flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <a href="/profitability" className="text-2xl">&#8592;</a>
          <h1 className="text-2xl font-bold">Job History</h1>
        </div>
        <div className="flex items-center space-x-3">
          <ExportGate plan={userPlan}>
            <button
              onClick={exportCSV}
              disabled={jobs.length === 0}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Export CSV
            </button>
          </ExportGate>
          <select
            value={period}
            onChange={(e) => setPeriod(parseInt(e.target.value))}
            className="bg-white/10 text-white border border-white/20 rounded px-3 py-1"
          >
            <option value={30} className="text-gray-900">Last 30 days</option>
            <option value={90} className="text-gray-900">Last 90 days</option>
            <option value={180} className="text-gray-900">Last 6 months</option>
            <option value={365} className="text-gray-900">Last year</option>
          </select>
        </div>
      </header>

      {/* Quick Stats */}
      {stats && (
        <div className="bg-white rounded-lg p-4 shadow mb-4">
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-amber-600">{stats.totalJobs}</p>
              <p className="text-xs text-gray-500">Jobs</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-600">{formatCurrency(stats.totalRevenue)}</p>
              <p className="text-xs text-gray-500">Revenue</p>
            </div>
            <div>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(stats.totalProfit)}</p>
              <p className="text-xs text-gray-500">Profit</p>
            </div>
            <div>
              <p className="text-xl font-bold">{stats.totalHours.toFixed(1)}h</p>
              <p className="text-xs text-gray-500">Hours</p>
            </div>
            <div>
              <p className="text-xl font-bold text-purple-600">{stats.avgMargin.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">Margin</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-white text-center py-12">Loading jobs...</div>
      ) : error ? (
        <div className="text-red-400 text-center py-12">{error}</div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-xl font-semibold mb-2">No completed jobs</p>
          <p className="text-gray-500 mb-4">Jobs will appear here after you complete quotes and log hours.</p>
          <a href="/dashboard" className="text-amber-600 underline">Go to Dashboard</a>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="bg-white rounded-lg p-4 shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold">
                    {job.quotes?.client_name || 'Unknown Client'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {job.quotes?.aircraft_model || 'Unknown Aircraft'}
                  </p>
                </div>
                <span className="text-sm text-gray-400">{formatDate(job.completed_at)}</span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center mt-3 pt-3 border-t">
                <div>
                  <p className="font-semibold">{formatCurrency(job.revenue)}</p>
                  <p className="text-xs text-gray-500">Revenue</p>
                </div>
                <div>
                  <p className="font-semibold">{job.actual_hours}h</p>
                  <p className="text-xs text-gray-500">Hours</p>
                </div>
                <div>
                  <p className="font-semibold text-green-600">{formatCurrency(job.profit)}</p>
                  <p className="text-xs text-gray-500">Profit</p>
                </div>
                <div>
                  <p className="font-semibold text-purple-600">{job.margin_percent?.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500">Margin</p>
                </div>
              </div>

              {job.notes && (
                <p className="text-sm text-gray-500 mt-2 italic">"{job.notes}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
