"use client";

import { useState, useEffect } from 'react';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Redemptions', href: '/admin/redemptions' },
  { label: 'Aircraft', href: '/admin/aircraft' },
  { label: 'Vendors', href: '/admin/vendors' },
];

const STATUS_STYLES = {
  pending: 'bg-yellow-900/30 text-yellow-400',
  processing: 'bg-v-gold/10 text-v-gold',
  shipped: 'bg-v-gold/10 text-v-gold',
  delivered: 'bg-green-900/30 text-green-400',
  completed: 'bg-green-900/30 text-green-400',
  cancelled: 'bg-red-900/30 text-red-400',
};

export default function RedemptionsPage() {
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [trackingModal, setTrackingModal] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('vector_token');
    if (!t) { window.location.href = '/login'; return; }
    setToken(t);
    fetchRedemptions(t);
  }, []);

  const fetchRedemptions = async (t, status) => {
    try {
      const statusParam = status || statusFilter;
      const res = await fetch(`/api/admin/redemptions?status=${statusParam}`, {
        headers: { Authorization: `Bearer ${t || token}` },
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setRedemptions(data.redemptions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status, extra = {}) => {
    try {
      const res = await fetch(`/api/admin/redemptions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, ...extra }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      setRedemptions(prev => prev.map(r =>
        r.id === id ? { ...r, status, ...(extra.tracking_number ? { metadata: { ...r.metadata, tracking_number: extra.tracking_number } } : {}) } : r
      ));
      setSuccess(`Redemption ${status === 'cancelled' ? 'cancelled (points refunded)' : `marked as ${status}`}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleShip = (redemption) => {
    setTrackingModal(redemption.id);
    setTrackingNumber('');
  };

  const confirmShip = () => {
    updateStatus(trackingModal, 'shipped', { tracking_number: trackingNumber });
    setTrackingModal(null);
  };

  const handleFilterChange = (status) => {
    setStatusFilter(status);
    setLoading(true);
    fetchRedemptions(null, status);
  };

  // Client-side search
  let filtered = redemptions;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r =>
      (r.reward_name || '').toLowerCase().includes(q) ||
      (r.detailers?.email || '').toLowerCase().includes(q) ||
      (r.detailers?.company || '').toLowerCase().includes(q) ||
      (r.detailers?.name || '').toLowerCase().includes(q)
    );
  }

  const pendingCount = redemptions.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-v-charcoal">
      {/* Admin Nav */}
      <nav className="bg-v-surface border-b border-v-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="text-v-text-secondary hover:text-v-text-primary text-sm">&larr; App</a>
            <span className="text-v-text-primary font-bold">Admin</span>
            {ADMIN_NAV.map(nav => (
              <a
                key={nav.href}
                href={nav.href}
                className={`text-sm ${nav.href === '/admin/redemptions' ? 'text-v-gold font-medium' : 'text-v-text-secondary hover:text-v-text-primary'}`}
              >
                {nav.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl text-v-text-primary font-heading">Redemptions</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 bg-yellow-900/30 text-yellow-400 rounded-full text-sm font-medium">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>

        {error && <div className="p-3 bg-red-900/30 border border-red-600/30 rounded-sm text-red-400 text-sm">{error}</div>}
        {success && <div className="p-3 bg-green-900/30 border border-green-600/30 rounded-sm text-green-400 text-sm">{success}</div>}

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex bg-v-surface border border-v-border rounded-sm overflow-hidden">
            {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`px-3 py-2 text-sm capitalize ${
                  statusFilter === s ? 'bg-v-gold/10 text-v-gold font-medium' : 'text-v-text-secondary hover:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by user or reward..."
            className="bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm w-64 placeholder:text-v-text-secondary"
          />
        </div>

        {/* Tracking Modal */}
        {trackingModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-v-surface border border-v-border rounded-sm p-6 w-full max-w-sm">
              <h3 className="font-semibold text-v-text-primary mb-3">Add Tracking Number</h3>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                placeholder="Tracking number (optional)"
                className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2 mb-4 placeholder:text-v-text-secondary"
              />
              <div className="flex gap-3">
                <button
                  onClick={confirmShip}
                  className="flex-1 py-2 bg-v-gold text-v-charcoal text-xs uppercase tracking-widest font-semibold hover:bg-v-gold-dim transition-colors"
                >
                  Mark Shipped
                </button>
                <button
                  onClick={() => setTrackingModal(null)}
                  className="flex-1 py-2 border border-v-border rounded-sm text-v-text-secondary hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Redemptions Table */}
        {loading ? (
          <div className="text-center py-8 text-v-text-secondary">Loading redemptions...</div>
        ) : (
          <div className="bg-v-surface border border-v-border rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-v-charcoal text-v-text-secondary border-b border-v-border">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Reward</th>
                  <th className="px-4 py-3 font-medium">Points</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-v-border last:border-0 hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="font-medium text-v-text-primary">{r.detailers?.name || r.detailers?.email || r.detailer_id?.slice(0, 8)}</div>
                      <div className="text-xs text-v-text-secondary">{r.detailers?.company || r.detailers?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-v-text-primary">{r.reward_name}</td>
                    <td className="px-4 py-3 font-medium text-v-gold">{r.points_spent?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-v-text-secondary">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>
                        {r.status}
                      </span>
                      {r.metadata?.tracking_number && (
                        <div className="text-xs text-v-text-secondary mt-1">#{r.metadata.tracking_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateStatus(r.id, 'processing')}
                              className="text-blue-400 hover:underline text-xs"
                            >
                              Process
                            </button>
                            <button
                              onClick={() => handleShip(r)}
                              className="text-v-gold hover:underline text-xs"
                            >
                              Ship
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Cancel this redemption and refund points?')) {
                                  updateStatus(r.id, 'cancelled');
                                }
                              }}
                              className="text-red-400 hover:underline text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {r.status === 'processing' && (
                          <>
                            <button
                              onClick={() => handleShip(r)}
                              className="text-v-gold hover:underline text-xs"
                            >
                              Ship
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Cancel this redemption and refund points?')) {
                                  updateStatus(r.id, 'cancelled');
                                }
                              }}
                              className="text-red-400 hover:underline text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {r.status === 'shipped' && (
                          <button
                            onClick={() => updateStatus(r.id, 'delivered')}
                            className="text-green-400 hover:underline text-xs"
                          >
                            Mark Delivered
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-v-text-secondary">
                      No redemptions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
