"use client";

import { useState, useEffect } from 'react';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Redemptions', href: '/admin/redemptions' },
  { label: 'Aircraft', href: '/admin/aircraft' },
  { label: 'Vendors', href: '/admin/vendors' },
];

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
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
                className={`text-sm ${nav.href === '/admin/redemptions' ? 'text-amber-600 font-medium' : 'text-gray-500 hover:text-gray-900'}`}
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
            <h1 className="text-2xl font-bold text-gray-900">Redemptions</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex bg-white border rounded-lg overflow-hidden">
            {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`px-3 py-2 text-sm capitalize ${
                  statusFilter === s ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
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
            className="border rounded-lg px-3 py-2 text-sm w-64"
          />
        </div>

        {/* Tracking Modal */}
        {trackingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Add Tracking Number</h3>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                placeholder="Tracking number (optional)"
                className="w-full border rounded-lg px-3 py-2 mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={confirmShip}
                  className="flex-1 py-2 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600"
                >
                  Mark Shipped
                </button>
                <button
                  onClick={() => setTrackingModal(null)}
                  className="flex-1 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Redemptions Table */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading redemptions...</div>
        ) : (
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
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
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.detailers?.name || r.detailers?.email || r.detailer_id?.slice(0, 8)}</div>
                      <div className="text-xs text-gray-500">{r.detailers?.company || r.detailers?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{r.reward_name}</td>
                    <td className="px-4 py-3 font-medium text-amber-600">{r.points_spent?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>
                        {r.status}
                      </span>
                      {r.metadata?.tracking_number && (
                        <div className="text-xs text-gray-400 mt-1">#{r.metadata.tracking_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateStatus(r.id, 'processing')}
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Process
                            </button>
                            <button
                              onClick={() => handleShip(r)}
                              className="text-indigo-600 hover:underline text-xs"
                            >
                              Ship
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Cancel this redemption and refund points?')) {
                                  updateStatus(r.id, 'cancelled');
                                }
                              }}
                              className="text-red-500 hover:underline text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {r.status === 'processing' && (
                          <>
                            <button
                              onClick={() => handleShip(r)}
                              className="text-indigo-600 hover:underline text-xs"
                            >
                              Ship
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Cancel this redemption and refund points?')) {
                                  updateStatus(r.id, 'cancelled');
                                }
                              }}
                              className="text-red-500 hover:underline text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {r.status === 'shipped' && (
                          <button
                            onClick={() => updateStatus(r.id, 'delivered')}
                            className="text-green-600 hover:underline text-xs"
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
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-400">
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
