"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function AdminReferralsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('vector_token');
      if (!token) { router.push('/login'); return; }

      const user = JSON.parse(localStorage.getItem('vector_user') || '{}');
      if (!user.is_admin) { router.push('/dashboard'); return; }

      const res = await fetch('/api/admin/referrals', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { router.push('/login'); return; }
      if (res.status === 403) { router.push('/dashboard'); return; }
      if (!res.ok) throw new Error('Failed to load referral data');

      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = data?.stats || {};
  const topReferrers = data?.top_referrers || [];
  const recentReferrals = data?.recent_referrals || [];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'rewarded':
      case 'completed':
        return <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30 rounded-sm">Rewarded</span>;
      case 'pending':
        return <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-v-gold/15 text-v-gold border border-v-gold/30 rounded-sm">Pending</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-v-text-secondary/15 text-v-text-secondary border border-v-border rounded-sm">{status}</span>;
    }
  };

  return (
    <>
      <Sidebar />
      <main className="md:ml-[260px] min-h-screen bg-v-charcoal">
        <div className="h-14 md:hidden" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => router.push('/admin')} className="text-v-text-secondary hover:text-v-text-primary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div>
              <h1 className="text-2xl font-heading text-v-text-primary tracking-wide">Referral Analytics</h1>
              <p className="text-sm text-v-text-secondary mt-0.5">Admin overview of the referral program</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-sm p-6 text-center">
              <p className="text-red-400">{error}</p>
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-[10px] text-v-text-secondary uppercase tracking-widest">All Time</p>
                  <p className="text-2xl font-heading text-v-text-primary mt-1">{stats.total || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-[10px] text-v-text-secondary uppercase tracking-widest">Rewarded</p>
                  <p className="text-2xl font-heading text-green-400 mt-1">{stats.rewarded || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-[10px] text-v-text-secondary uppercase tracking-widest">Pending</p>
                  <p className="text-2xl font-heading text-v-gold mt-1">{stats.pending || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-[10px] text-v-text-secondary uppercase tracking-widest">Conversion</p>
                  <p className="text-2xl font-heading text-v-text-primary mt-1">{stats.conversion_rate || 0}%</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-[10px] text-v-text-secondary uppercase tracking-widest">This Month</p>
                  <p className="text-2xl font-heading text-v-text-primary mt-1">{stats.this_month || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-[10px] text-v-text-secondary uppercase tracking-widest">Month Conv.</p>
                  <p className="text-2xl font-heading text-v-text-primary mt-1">{stats.this_month_rewarded || 0}</p>
                </div>
              </div>

              {/* Top Referrers */}
              <div className="bg-v-surface border border-v-border rounded-sm mb-8">
                <div className="px-6 py-4 border-b border-v-border">
                  <h2 className="text-sm text-v-text-secondary uppercase tracking-widest">Top Referrers</h2>
                </div>
                {topReferrers.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-v-text-secondary">No referrals yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-v-border text-left">
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal">#</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal">Detailer</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal">Plan</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal text-right">Referrals</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal text-right">Rewarded</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal text-right">Conv. Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-v-border">
                        {topReferrers.map((ref, i) => (
                          <tr key={ref.id} className="hover:bg-white/[0.02]">
                            <td className="px-6 py-3 text-v-text-secondary font-mono">{i + 1}</td>
                            <td className="px-6 py-3">
                              <p className="text-v-text-primary">{ref.name}</p>
                              {ref.company && <p className="text-[11px] text-v-text-secondary">{ref.company}</p>}
                            </td>
                            <td className="px-6 py-3">
                              <span className="text-xs text-v-gold capitalize">{ref.plan}</span>
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-v-text-primary">{ref.total}</td>
                            <td className="px-6 py-3 text-right font-mono text-green-400">{ref.rewarded}</td>
                            <td className="px-6 py-3 text-right font-mono text-v-text-primary">{ref.conversion_rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent Referrals */}
              <div className="bg-v-surface border border-v-border rounded-sm">
                <div className="px-6 py-4 border-b border-v-border">
                  <h2 className="text-sm text-v-text-secondary uppercase tracking-widest">Recent Referrals</h2>
                </div>
                {recentReferrals.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-v-text-secondary">No referrals yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-v-border text-left">
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal">Referrer</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal">Referred</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal">Status</th>
                          <th className="px-6 py-3 text-[10px] text-v-text-secondary uppercase tracking-widest font-normal">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-v-border">
                        {recentReferrals.map((ref) => (
                          <tr key={ref.id} className="hover:bg-white/[0.02]">
                            <td className="px-6 py-3">
                              <p className="text-v-text-primary">{ref.referrer?.name || 'Unknown'}</p>
                              {ref.referrer?.company && <p className="text-[11px] text-v-text-secondary">{ref.referrer.company}</p>}
                            </td>
                            <td className="px-6 py-3">
                              <p className="text-v-text-primary">{ref.referred?.name || 'Unknown'}</p>
                              {ref.referred?.company && <p className="text-[11px] text-v-text-secondary">{ref.referred.company}</p>}
                            </td>
                            <td className="px-6 py-3">{getStatusBadge(ref.status)}</td>
                            <td className="px-6 py-3 text-v-text-secondary text-xs">
                              {new Date(ref.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
