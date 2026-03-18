"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ManagerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(new Set());

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchDashboard(token);
  }, [router]);

  const fetchDashboard = async (token) => {
    try {
      const res = await fetch('/api/team/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (entryId, action) => {
    setApproving(prev => new Set(prev).add(entryId));
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/time-entries/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: [entryId], action }),
      });
      if (res.ok) {
        fetchDashboard(token);
      }
    } catch {}
    setApproving(prev => { const s = new Set(prev); s.delete(entryId); return s; });
  };

  const handleApproveAll = async () => {
    if (!data?.pendingApprovals?.length) return;
    const ids = data.pendingApprovals.map(e => e.id);
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/time-entries/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: ids, action: 'approve' }),
      });
      fetchDashboard(token);
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  const { team, pendingApprovals, unstaffedJobs, todaySummary } = data;

  return (
    <div className="min-h-screen bg-v-charcoal">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/team')} className="text-v-text-secondary hover:text-v-text-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <div>
            <h1 className="text-2xl font-heading text-v-text-primary tracking-wide">Manager Dashboard</h1>
            <p className="text-sm text-v-text-secondary mt-0.5">Team overview and time management</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-xs text-v-text-secondary uppercase tracking-wide">Team Members</p>
            <p className="text-2xl font-bold text-v-text-primary mt-1">{todaySummary.total_members}</p>
          </div>
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-xs text-v-text-secondary uppercase tracking-wide">Clocked In</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{todaySummary.clocked_in}</p>
          </div>
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-xs text-v-text-secondary uppercase tracking-wide">Today&apos;s Hours</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{todaySummary.today_hours}</p>
          </div>
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-xs text-v-text-secondary uppercase tracking-wide">Pending Approvals</p>
            <p className="text-2xl font-bold text-v-gold mt-1">{pendingApprovals.length}</p>
          </div>
        </div>

        {/* Today's Team Status */}
        <div className="bg-v-surface border border-v-border rounded-sm p-5">
          <h2 className="text-sm font-semibold text-v-text-primary mb-4">Today&apos;s Team Status</h2>
          {team.length === 0 ? (
            <p className="text-v-text-secondary text-sm">No active team members</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {team.map(m => (
                <div key={m.id} className="border border-v-border rounded-sm p-3 flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${m.clocked_in ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-v-text-primary truncate">{m.name}</p>
                    <p className="text-xs text-v-text-secondary capitalize">{m.role}</p>
                  </div>
                  <div className="text-right">
                    {m.clocked_in ? (
                      <p className="text-xs text-green-400">Clocked In</p>
                    ) : (
                      <p className="text-xs text-v-text-secondary">Off</p>
                    )}
                    <p className="text-xs text-v-text-secondary">{m.today_hours.toFixed(1)}h today</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Approvals */}
        <div className="bg-v-surface border border-v-border rounded-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-v-text-primary">Pending Time Approvals ({pendingApprovals.length})</h2>
            {pendingApprovals.length > 0 && (
              <button onClick={handleApproveAll} className="px-3 py-1.5 bg-green-500 text-white rounded-sm text-xs font-medium hover:bg-green-600">
                Approve All
              </button>
            )}
          </div>
          {pendingApprovals.length === 0 ? (
            <p className="text-v-text-secondary text-sm">No pending approvals</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-v-text-secondary border-b border-v-border">
                    <th className="pb-2 font-medium">Team Member</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Hours</th>
                    <th className="pb-2 font-medium">Clock In/Out</th>
                    <th className="pb-2 font-medium">Notes</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map(entry => (
                    <tr key={entry.id} className="border-b border-v-border last:border-0">
                      <td className="py-2 text-v-text-primary">{entry.member_name}</td>
                      <td className="py-2 text-v-text-secondary">{new Date(entry.date).toLocaleDateString()}</td>
                      <td className="py-2 text-v-text-primary font-medium">{parseFloat(entry.hours_worked || 0).toFixed(2)}</td>
                      <td className="py-2 text-v-text-secondary text-xs">
                        {entry.clock_in ? new Date(entry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        {' — '}
                        {entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                      </td>
                      <td className="py-2 text-v-text-secondary text-xs">{entry.notes || '-'}</td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleApprove(entry.id, 'approve')}
                            disabled={approving.has(entry.id)}
                            className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs hover:bg-green-900/50 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApprove(entry.id, 'reject')}
                            disabled={approving.has(entry.id)}
                            className="px-2 py-1 bg-red-900/30 text-red-400 rounded text-xs hover:bg-red-900/50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Unstaffed Jobs */}
        <div className="bg-v-surface border border-v-border rounded-sm p-5">
          <h2 className="text-sm font-semibold text-v-text-primary mb-4">Unstaffed Jobs (Next 14 Days)</h2>
          {unstaffedJobs.length === 0 ? (
            <p className="text-v-text-secondary text-sm">All upcoming jobs are staffed</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-v-text-secondary border-b border-v-border">
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Aircraft</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unstaffedJobs.map(job => (
                    <tr key={job.id} className="border-b border-v-border last:border-0 hover:bg-white/5">
                      <td className="py-2 text-v-text-primary">{job.client_name || '-'}</td>
                      <td className="py-2 text-v-text-secondary">{job.aircraft_model || job.aircraft_type}</td>
                      <td className="py-2 text-v-text-secondary">{new Date(job.scheduled_date).toLocaleDateString()}</td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-v-gold-muted/30 text-v-gold">
                          Needs Staff
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
