"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';

const STATUS_STYLES = {
  pending_review: { label: 'Needs Review', cls: 'border border-amber-500/30 text-amber-400' },
  pending_customer: { label: 'Awaiting Customer', cls: 'border border-blue-500/30 text-blue-400' },
  approved: { label: 'Approved', cls: 'border border-emerald-500/30 text-emerald-400' },
  rejected: { label: 'Rejected', cls: 'border border-red-500/30 text-red-400' },
  declined: { label: 'Declined', cls: 'border border-red-500/30 text-red-400' },
  paid: { label: 'Paid', cls: 'border border-emerald-500/30 text-emerald-400' },
};

const FILTERS = [
  { key: 'pending_review', label: 'Needs Review' },
  { key: 'all', label: 'All' },
  { key: 'pending_customer', label: 'Awaiting Customer' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function ChangeOrdersPage() {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending_review');
  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    setLoading(true);
    fetch(`/api/change-order-requests?status=${encodeURIComponent(filter)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { requests: [] })
      .then(d => setRequests(d.requests || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [router, token, filter]);

  const counts = useMemo(() => ({
    pending: requests.filter(r => r.status === 'pending_review').length,
  }), [requests]);

  return (
    <AppShell title="Change Orders">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-light tracking-wide text-v-text-primary">Change Orders</h1>
            <p className="text-v-text-secondary text-sm mt-1">
              Review crew-reported extra work, price it, and send to the customer.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-full border transition-colors ${
                filter === f.key
                  ? 'border-v-gold text-v-gold bg-v-gold/10'
                  : 'border-v-border text-v-text-secondary hover:text-v-text-primary'
              }`}
            >
              {f.label}
              {f.key === 'pending_review' && filter === 'pending_review' && counts.pending > 0 ? ` (${counts.pending})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : requests.length === 0 ? (
          <div className="border border-v-border rounded-xl p-10 text-center">
            <p className="text-v-text-primary font-medium mb-1">No change orders here</p>
            <p className="text-v-text-secondary text-sm">
              When crew reports an issue from the job, it will show up for review.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map(cor => {
              const st = STATUS_STYLES[cor.status] || { label: cor.status, cls: 'border border-v-border text-v-text-secondary' };
              return (
                <a
                  key={cor.id}
                  href={`/change-orders/${cor.id}`}
                  className="block border border-v-border rounded-xl p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-v-text-primary text-sm font-medium truncate">
                        {cor.team_member_name || 'Crew'} · issue report
                      </p>
                      <p className="text-v-text-secondary text-sm mt-1 line-clamp-2">
                        {cor.description || 'No description'}
                      </p>
                      <p className="text-v-text-secondary/70 text-[11px] mt-2">
                        {cor.created_at ? new Date(cor.created_at).toLocaleString() : ''}
                        {cor.amount != null ? ` · $${Number(cor.amount).toFixed(2)}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-0.5 text-[10px] uppercase tracking-wider rounded ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
