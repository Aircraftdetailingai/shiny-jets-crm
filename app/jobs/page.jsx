"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';
import AppShell from '@/components/AppShell';

const statusColors = {
  paid: 'border border-green-500/40 text-green-400',
  approved: 'border border-green-500/40 text-green-400',
  accepted: 'border border-green-500/40 text-green-400',
  scheduled: 'border border-indigo-400/40 text-indigo-300',
  in_progress: 'border border-cyan-400/40 text-cyan-300',
  completed: 'border border-purple-400/40 text-purple-300',
};

const statusLabels = {
  paid: 'Paid',
  approved: 'Approved',
  accepted: 'Accepted',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

export default function JobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchJobs(token);
  }, [router]);

  const fetchJobs = async (token) => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setStats(data.stats || null);
      } else {
        setError('Failed to load jobs');
      }
    } catch (err) {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = useMemo(() => {
    if (filter === 'all') return jobs;
    return jobs.filter(j => j.status === filter);
  }, [jobs, filter]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getServicesLabel = (job) => {
    if (job.line_items && Array.isArray(job.line_items) && job.line_items.length > 0) {
      return job.line_items.map(i => i.description || i.service).filter(Boolean).join(', ');
    }
    if (job.services && Array.isArray(job.services)) {
      return job.services.map(s => typeof s === 'string' ? s : s.name || s.service).filter(Boolean).join(', ');
    }
    return '—';
  };

  const getAircraftLabel = (job) => {
    return job.aircraft_model || job.aircraft_type || '—';
  };

  return (
    <AppShell title="Jobs">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>
              JOBS
            </h1>
            <p className="text-v-text-secondary text-xs mt-1">Scheduled and completed work</p>
          </div>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total Jobs', value: stats.total || 0, color: 'text-v-gold' },
              { label: 'Scheduled', value: stats.scheduled || 0, color: 'text-indigo-300' },
              { label: 'In Progress', value: stats.inProgress || 0, color: 'text-cyan-300' },
              { label: 'Completed', value: stats.completed || 0, color: 'text-purple-300' },
              { label: 'Revenue', value: `${currencySymbol()}${formatPrice(stats.totalRevenue || 0)}`, color: 'text-v-gold', isText: true },
            ].map(s => (
              <div key={s.label} className="bg-v-surface border border-v-border-subtle rounded-sm p-4 text-center">
                <p className={`text-xl font-bold font-data ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-v-text-secondary uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-1.5 mb-6">
          {FILTER_TABS.map(f => {
            const count = f.key === 'all' ? jobs.length
              : jobs.filter(j => j.status === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.key
                    ? 'bg-v-gold text-v-charcoal'
                    : 'bg-v-surface text-v-text-secondary border border-v-border hover:text-v-text-primary hover:border-v-gold/50'
                }`}
              >
                {f.label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Loading / Error / Empty */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-v-text-secondary text-xs tracking-widest uppercase">Loading jobs</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-red-400 text-center py-12 text-sm">{error}</div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-v-surface border border-v-border rounded-sm p-12 text-center">
            <p className="text-v-text-secondary text-sm mb-2">
              {filter === 'all'
                ? 'No jobs yet. Jobs appear when quotes are accepted and scheduled.'
                : `No ${FILTER_TABS.find(f => f.key === filter)?.label?.toLowerCase()} jobs.`}
            </p>
            <a href="/quotes" className="text-v-gold hover:text-v-gold-dim text-sm">Go to Quotes</a>
          </div>
        ) : (
          /* Jobs Table */
          <>
          {/* Mobile Card Layout */}
          <div className="sm:hidden space-y-2">
            {filteredJobs.map((job) => (
              <div key={job.id} onClick={() => { if (job.share_link) window.open(`/q/${job.share_link}`, '_blank'); }}
                className="bg-v-surface border border-v-border p-4 cursor-pointer active:bg-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium truncate mr-2">{job.customer_company || job.client_name || '—'}</span>
                  <span className={`shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusColors[job.status] || 'border border-gray-500/30 text-gray-400'}`}>
                    {statusLabels[job.status] || job.status}
                  </span>
                </div>
                <p className="text-v-text-secondary text-xs truncate">{getAircraftLabel(job)}{job.tail_number ? ` · ${job.tail_number}` : ''}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-v-gold text-sm font-data">{currencySymbol()}{formatPrice(job.total_price)}</span>
                  <span className="text-v-text-secondary text-xs">{formatDate(job.scheduled_date)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block bg-v-surface border border-v-border rounded-sm overflow-x-auto">
            {/* Table Header */}
            <div className="sticky top-0 z-10 bg-v-surface border-b border-[#1A2236]">
              <div className="grid grid-cols-[1fr_1fr_1.2fr_120px_100px_120px] min-w-[800px] px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
                <div>Customer</div>
                <div>Aircraft</div>
                <div>Services</div>
                <div>Scheduled</div>
                <div className="text-center">Status</div>
                <div className="text-right">Value</div>
              </div>
            </div>

            {/* Table Rows */}
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => { if (job.share_link) window.open(`/q/${job.share_link}`, '_blank'); }}
                className="group grid grid-cols-[1fr_1fr_1.2fr_120px_100px_120px] min-w-[800px] px-6 items-center border-b border-[#1A2236] transition-colors cursor-pointer hover:bg-white/[0.02]"
                style={{ height: '56px' }}
              >
                <div className="truncate pr-4">
                  <span className="text-white text-sm">{job.customer_company || job.client_name || '—'}</span>
                  {job.customer_company && job.client_name && job.customer_company !== job.client_name && (
                    <span className="text-[#8A9BB0] text-xs ml-2">{job.client_name}</span>
                  )}
                </div>
                <div className="truncate pr-4">
                  <span className="text-[#8A9BB0] text-sm">{getAircraftLabel(job)}</span>
                  {job.tail_number && <span className="text-[#8A9BB0]/60 text-xs ml-2">{job.tail_number}</span>}
                </div>
                <div className="truncate pr-4">
                  <span className="text-[#8A9BB0] text-sm" title={getServicesLabel(job)}>{getServicesLabel(job)}</span>
                </div>
                <div>
                  <span className="text-[#8A9BB0] text-xs">{formatDate(job.scheduled_date)}</span>
                </div>
                <div className="flex justify-center">
                  <span className={`px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${statusColors[job.status] || 'border border-gray-500/30 text-gray-400'}`}>
                    {statusLabels[job.status] || job.status}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-v-gold text-sm font-data">{currencySymbol()}{formatPrice(job.total_price)}</span>
                </div>
              </div>
            ))}

            <div className="px-6 py-3 border-t border-[#1A2236] text-[#8A9BB0] text-xs">
              {filteredJobs.length} of {jobs.length} jobs{filter !== 'all' && ' (filtered)'}
            </div>
          </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
