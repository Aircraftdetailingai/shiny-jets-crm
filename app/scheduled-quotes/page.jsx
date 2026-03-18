"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function timeUntil(d) {
  if (!d) return '';
  const diff = new Date(d) - new Date();
  if (diff <= 0) return 'Sending soon...';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

const STATUS_COLORS = {
  pending: 'bg-blue-900/30 text-blue-400',
  sent: 'bg-green-900/30 text-green-400',
  failed: 'bg-red-900/30 text-red-400',
  cancelled: 'bg-v-charcoal text-v-text-secondary',
};

export default function ScheduledQuotesPage() {
  const router = useRouter();
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchScheduled();

    // Refresh every 30 seconds to update countdowns
    const interval = setInterval(fetchScheduled, 30000);
    return () => clearInterval(interval);
  }, [router]);

  const getToken = () => localStorage.getItem('vector_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

  async function fetchScheduled() {
    try {
      const res = await fetch('/api/scheduled-quotes', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setScheduled(data.scheduled || []);
    } catch (err) {
      setError('Failed to load scheduled quotes');
    } finally {
      setLoading(false);
    }
  }

  async function cancelScheduled(sq) {
    if (!confirm(`Cancel scheduled send for ${sq.client_name || 'Customer'}?`)) return;
    try {
      const res = await fetch(`/api/scheduled-quotes?id=${sq.id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Failed to cancel');
      setSuccess('Scheduled send cancelled');
      fetchScheduled();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  function openEditModal(sq) {
    setEditDate(sq.send_at ? new Date(sq.send_at).toISOString().slice(0, 16) : '');
    setEditName(sq.client_name || '');
    setEditEmail(sq.client_email || '');
    setEditPhone(sq.client_phone || '');
    setError('');
    setEditModal(sq);
  }

  async function saveEdit() {
    if (!editModal) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/scheduled-quotes', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          id: editModal.id,
          send_at: editDate ? new Date(editDate).toISOString() : undefined,
          client_name: editName,
          client_email: editEmail,
          client_phone: editPhone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setEditModal(null);
      setSuccess('Schedule updated');
      fetchScheduled();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const pending = scheduled.filter(sq => sq.status === 'pending');
  const sent = scheduled.filter(sq => sq.status === 'sent');
  const other = scheduled.filter(sq => sq.status !== 'pending' && sq.status !== 'sent');

  if (loading) {
    return (
      <div className="page-transition min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-v-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-white text-2xl hover:opacity-70">&larr;</a>
          <h1 className="text-2xl font-bold text-white">{'Scheduled Quotes'}</h1>
        </div>
        <a
          href="/dashboard"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-v-gold to-v-gold-dim text-white hover:opacity-90 shadow"
        >
          {'New Quote'}
        </a>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-900/20 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/20 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">{success}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-v-surface rounded-lg p-3 shadow">
          <p className="text-v-text-secondary text-xs">{'Pending'}</p>
          <p className="text-xl font-bold text-blue-600">{pending.length}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-3 shadow">
          <p className="text-v-text-secondary text-xs">{'Sent'}</p>
          <p className="text-xl font-bold text-green-600">{sent.length}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-3 shadow">
          <p className="text-v-text-secondary text-xs">{'Total Scheduled'}</p>
          <p className="text-xl font-bold text-v-text-primary">{scheduled.length}</p>
        </div>
      </div>

      {/* Pending Queue */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wide mb-2">{'Upcoming'}</h2>
          <div className="space-y-2">
            {pending.map(sq => (
              <div key={sq.id} className="bg-v-surface rounded-lg p-4 shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-v-text-primary">{sq.client_name || 'Customer'}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 font-medium">
                        {timeUntil(sq.send_at)}
                      </span>
                    </div>
                    <p className="text-sm text-v-text-secondary mt-0.5">
                      {sq.aircraft || 'Aircraft'} &middot; {formatCurrency(sq.total_price)}
                    </p>
                    <p className="text-xs text-v-text-secondary mt-0.5">
                      {'Scheduled'}: {formatDateTime(sq.send_at)}
                    </p>
                    <p className="text-xs text-v-text-secondary">
                      {'To'}: {sq.client_email || '\u2014'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditModal(sq)}
                      title={'Edit'}
                      className="p-2 text-v-text-secondary hover:text-blue-600 hover:bg-blue-900/20 rounded-lg transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => cancelScheduled(sq)}
                      title={'Cancel'}
                      className="p-2 text-v-text-secondary hover:text-red-600 hover:bg-red-900/20 rounded-lg transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent */}
      {sent.length > 0 && (
        <div className="mb-6">
          <h2 className="text-white/70 font-semibold text-sm uppercase tracking-wide mb-2">{'Sent'}</h2>
          <div className="space-y-2">
            {sent.map(sq => (
              <div key={sq.id} className="bg-white/90 rounded-lg p-4 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-v-text-primary">{sq.client_name || 'Customer'}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400">{'Sent'}</span>
                    </div>
                    <p className="text-sm text-v-text-secondary">
                      {sq.aircraft || 'Aircraft'} &middot; {formatCurrency(sq.total_price)}
                    </p>
                    <p className="text-xs text-v-text-secondary">
                      {'Sent'}: {formatDateTime(sq.sent_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {scheduled.length === 0 && (
        <div className="bg-v-surface rounded-lg p-8 text-center shadow">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-v-text-secondary mb-2">{'No scheduled quotes'}</p>
          <p className="text-sm text-v-text-secondary">
            {'Use the “Schedule for later” option when sending a quote to add it to the queue.'}
          </p>
        </div>
      )}

      {/* Failed/Other */}
      {other.length > 0 && (
        <div>
          <h2 className="text-white/50 font-semibold text-sm uppercase tracking-wide mb-2">{'Other'}</h2>
          <div className="space-y-2">
            {other.map(sq => (
              <div key={sq.id} className="bg-white/70 rounded-lg p-3 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-v-text-secondary">{sq.client_name || 'Customer'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[sq.status] || STATUS_COLORS.cancelled}`}>
                        {sq.status}
                      </span>
                    </div>
                    <p className="text-xs text-v-text-secondary">{sq.aircraft} &middot; {formatCurrency(sq.total_price)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
          <div className="bg-v-surface rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-v-text-primary">{'Edit Scheduled Send'}</h2>
              <button onClick={() => setEditModal(null)} className="text-v-text-secondary hover:text-v-text-secondary text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Send Date & Time'}</label>
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Customer Name'}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Email'}</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Phone (optional)'}</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full border border-v-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-v-text-secondary hover:bg-white/5 text-sm">
                {'Cancel'}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-v-gold to-v-gold-dim text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-sm"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
