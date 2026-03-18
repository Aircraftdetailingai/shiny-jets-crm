"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';

const statusColors = {
  draft: 'bg-v-charcoal text-v-text-secondary',
  sent: 'bg-blue-900/30 text-blue-400',
  viewed: 'bg-v-gold-muted/30 text-v-gold',
  paid: 'bg-green-900/30 text-green-400',
  approved: 'bg-green-900/30 text-green-400',
  completed: 'bg-purple-900/30 text-purple-400',
  expired: 'bg-red-900/30 text-red-400',
  scheduled: 'bg-indigo-900/30 text-indigo-400',
};

export default function RecurringPage() {
  const router = useRouter();
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'paused'
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchRecurring(token);
  }, [router, filter]);

  const fetchRecurring = async (token) => {
    const tk = token || localStorage.getItem('vector_token');
    try {
      const url = filter !== 'all' ? `/api/recurring?status=${filter}` : '/api/recurring';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setRecurring(data.recurring || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async (quoteId, currentEnabled) => {
    setUpdating(quoteId);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/recurring', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quote_id: quoteId,
          recurring_enabled: !currentEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setRecurring(prev => prev.map(r => r.id === quoteId ? { ...r, recurring_enabled: !currentEnabled } : r));
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const updateInterval = async (quoteId, interval) => {
    setUpdating(quoteId);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/recurring', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quote_id: quoteId,
          recurring_interval: interval,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setRecurring(prev => prev.map(r => r.id === quoteId ? { ...r, recurring_interval: interval } : r));
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const updateNextDate = async (quoteId, date) => {
    setUpdating(quoteId);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/recurring', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quote_id: quoteId,
          next_service_date: date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setRecurring(prev => prev.map(r => r.id === quoteId ? { ...r, next_service_date: date } : r));
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const activeCount = recurring.filter(r => r.recurring_enabled).length;
  const pausedCount = recurring.filter(r => !r.recurring_enabled).length;
  const monthlyRevenue = recurring
    .filter(r => r.recurring_enabled)
    .reduce((sum, r) => {
      const price = parseFloat(r.total_price || 0);
      switch (r.recurring_interval) {
        case 'weekly': return sum + price * 4.33;
        case 'biweekly': return sum + price * 2.17;
        case '4_weeks': return sum + price * (13 / 12);
        case 'monthly': return sum + price;
        case '6_weeks': return sum + price * (365 / 42 / 12);
        case 'quarterly': return sum + price / 3;
        default: return sum + price;
      }
    }, 0);

  const upcomingThisWeek = recurring.filter(r => {
    if (!r.next_service_date || !r.recurring_enabled) return false;
    const next = new Date(r.next_service_date);
    const now = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(now.getDate() + 7);
    return next >= now && next <= weekFromNow;
  });

  const filterLabels = {
    all: 'All',
    active: 'Active',
    paused: 'Paused',
  };

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <a href="/dashboard" className="text-white text-2xl">&#8592;</a>
          <h1 className="text-2xl font-bold text-white">{'Recurring Services'}</h1>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Active'}</p>
          <p className="text-white text-xl font-bold">{activeCount}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Paused'}</p>
          <p className="text-white text-xl font-bold">{pausedCount}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Est. Monthly Revenue'}</p>
          <p className="text-white text-xl font-bold">{currencySymbol()}{formatPriceWhole(monthlyRevenue)}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Due This Week'}</p>
          <p className="text-white text-xl font-bold">{upcomingThisWeek.length}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 mb-4">
        {['all', 'active', 'paused'].map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setLoading(true); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-v-gold-muted/20 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {/* Upcoming This Week */}
      {upcomingThisWeek.length > 0 && (
        <div className="bg-v-gold-muted/20 border border-v-gold/30 rounded-lg p-4 mb-4">
          <h3 className="text-v-gold font-medium text-sm mb-2">{'Upcoming This Week'}</h3>
          <div className="space-y-2">
            {upcomingThisWeek.map(r => (
              <div key={r.id} className="flex items-center justify-between text-white text-sm">
                <span>
                  {r.customer_name || r.client_name || 'Customer'} - {r.aircraft_model || r.aircraft_type || 'Aircraft'}
                </span>
                <span className="text-white/60">
                  {new Date(r.next_service_date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-white text-center py-12">{'Loading recurring services...'}</div>
      ) : error ? (
        <div className="bg-red-900/200/20 border border-red-500/50 rounded-lg p-4 text-red-200">{error}</div>
      ) : recurring.length === 0 ? (
        <div className="bg-white/10 rounded-lg p-8 text-center">
          <p className="text-white/60 text-lg mb-2">{'No recurring services yet'}</p>
          <p className="text-white/40 text-sm mb-4">
            {'When sending a quote, check "Set up as recurring service" to create recurring schedules.'}
          </p>
          <a
            href="/dashboard"
            className="px-6 py-3 bg-v-gold-muted/20 text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium inline-block"
          >
            {'Create a Quote'}
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {recurring.map((item) => (
            <div key={item.id} className="bg-v-surface rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-v-text-primary">
                    {item.customer_name || item.client_name || 'Customer'}
                  </h3>
                  <p className="text-sm text-v-text-secondary">
                    {item.aircraft_model || item.aircraft_type || 'Aircraft'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status] || 'bg-v-charcoal text-v-text-secondary'}`}>
                    {item.status}
                  </span>
                  <span className="text-lg font-bold text-v-text-primary">
                    ${formatPrice(item.total_price)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                {/* Interval */}
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">{'Frequency'}</label>
                  <select
                    value={item.recurring_interval || 'monthly'}
                    onChange={(e) => updateInterval(item.id, e.target.value)}
                    disabled={updating === item.id}
                    className="w-full px-2 py-1.5 border border-v-border rounded text-sm focus:ring-2 focus:ring-v-gold outline-none"
                  >
                    <option value="weekly">{'Weekly'}</option>
                    <option value="biweekly">{'Every 2 weeks'}</option>
                    <option value="4_weeks">{'Every 4 weeks'}</option>
                    <option value="monthly">{'Monthly'}</option>
                    <option value="6_weeks">{'Every 6 weeks'}</option>
                    <option value="quarterly">{'Quarterly'}</option>
                  </select>
                </div>

                {/* Next Date */}
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">{'Next Service'}</label>
                  <input
                    type="date"
                    value={item.next_service_date || ''}
                    onChange={(e) => updateNextDate(item.id, e.target.value)}
                    disabled={updating === item.id}
                    className="w-full px-2 py-1.5 border border-v-border rounded text-sm focus:ring-2 focus:ring-v-gold outline-none"
                  />
                </div>

                {/* Toggle */}
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">{'Status'}</label>
                  <button
                    onClick={() => toggleEnabled(item.id, item.recurring_enabled)}
                    disabled={updating === item.id}
                    className={`w-full px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      item.recurring_enabled
                        ? 'bg-green-900/30 text-green-400 hover:bg-green-200'
                        : 'bg-v-charcoal text-v-text-secondary hover:bg-v-charcoal'
                    }`}
                  >
                    {item.recurring_enabled ? 'Active' : 'Paused'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-v-text-secondary">
                <span>
                  {item.customer_email || item.client_email || 'No email'}
                  {item.customer_phone || item.client_phone ? ` | ${item.customer_phone || item.client_phone}` : ''}
                </span>
                <a
                  href={`/quotes/${item.id}`}
                  className="text-v-gold-dim hover:underline"
                >
                  {'View Quote'}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
