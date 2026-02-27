"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PushNotifications from '../../components/PushNotifications.jsx';
import PointsBadge from '../../components/PointsBadge.jsx';
import NotificationBell from '../../components/NotificationBell.jsx';
import GlobalSearch from '../../components/GlobalSearch.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import { useToast } from '../../components/Toast.jsx';
import AddCustomerModal from '../../components/AddCustomerModal.jsx';
import { formatPriceWhole, currencySymbol } from '../../lib/formatPrice';
import DashboardTour from '../../components/DashboardTour.jsx';
import WeatherWidget from '../../components/WeatherWidget.jsx';
import DashboardLanguageSelector from '../../components/DashboardLanguageSelector.jsx';
import { useTranslation } from '@/lib/i18n';

// Stripe Connect Warning Banner Component
function StripeWarningBanner({ onConnect, loading, error, onClearError, status }) {
  const { t } = useTranslation();
  const isDisconnected = status === 'INCOMPLETE' || status === 'PENDING';
  const bgColor = isDisconnected ? 'bg-red-50 border-red-300' : 'bg-amber-100 border-amber-300';
  const iconColor = isDisconnected ? 'text-red-600' : 'text-amber-600';
  const titleColor = isDisconnected ? 'text-red-800' : 'text-amber-800';
  const msgColor = isDisconnected ? 'text-red-700' : 'text-amber-700';
  const title = isDisconnected ? t('stripe.disconnected') : t('stripe.notConnected');
  const msg = isDisconnected
    ? t('stripe.disabledMsg')
    : t('stripe.connectMsg');
  const btnLabel = isDisconnected ? t('stripe.reconnect') : t('stripe.connect');

  return (
    <div className={`${bgColor} border rounded-lg p-4 mb-4`}>
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm flex justify-between items-start">
          <span>{error}</span>
          <button onClick={onClearError} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className={`${iconColor} text-xl mr-3`}>&#9888;</span>
          <div>
            <p className={`${titleColor} font-medium`}>{title}</p>
            <p className={`${msgColor} text-sm`}>{msg}</p>
          </div>
        </div>
        <button
          onClick={onConnect}
          disabled={loading}
          className="px-4 py-2 rounded bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
        >
          {loading ? t('common.connecting') : btnLabel}
        </button>
      </div>
    </div>
  );
}

// Free Tier Usage Bar Component
function FreeUsageBar({ user }) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) return;
    fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUsage(data); })
      .catch(() => {});
  }, []);

  if (!usage || usage.tier !== 'free') return null;

  const used = usage.quotesThisMonth || 0;
  const limit = usage.quotesLimit || 3;
  const pct = Math.min(100, (used / limit) * 100);
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 67 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="bg-white rounded-lg p-4 mb-4 shadow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-gray-900 text-sm">{t('usage.freePlanUsage')}</h3>
        <span className="text-xs text-gray-500">{t('usage.quotesUsed', { used, limit })}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
        <div className={`${barColor} h-3 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 100 ? (
        <div className="flex justify-between items-center">
          <p className="text-red-600 text-xs font-medium">{t('usage.limitReached')}</p>
          <a href="/settings?tab=billing" className="text-xs text-amber-600 font-semibold hover:underline">{t('usage.upgradeUnlimited')}</a>
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <p className="text-gray-500 text-xs">{t('usage.remaining', { count: limit - used, s: limit - used !== 1 ? 's' : '' })}</p>
          <a href="/settings?tab=billing" className="text-xs text-amber-600 hover:underline">{t('usage.upgradeUnlimited')}</a>
        </div>
      )}
    </div>
  );
}

// Low Stock Alert Component
function LowStockAlert() {
  const { t } = useTranslation();
  const [lowStock, setLowStock] = useState(null);
  const [totalValue, setTotalValue] = useState(0);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) return;
    fetch('/api/products', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          if (data.lowStock?.length) setLowStock(data.lowStock);
          setTotalValue(data.totalValue || 0);
          setProductCount((data.products || []).length);
        }
      })
      .catch(() => {});
  }, []);

  if (!lowStock || lowStock.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
      <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-red-500 text-lg">&#9888;</span>
          <div>
            <p className="text-red-800 text-sm font-semibold">{t('lowStock.title', { count: lowStock.length })}</p>
            {productCount > 0 && totalValue > 0 && (
              <p className="text-xs text-gray-500">{t('lowStock.inventory', { value: `${currencySymbol()}${totalValue.toLocaleString()}`, count: productCount })}</p>
            )}
          </div>
        </div>
        <a href="/products" className="text-xs text-red-700 font-medium hover:underline whitespace-nowrap">{t('common.viewAll')}</a>
      </div>
      <div className="divide-y">
        {lowStock.slice(0, 5).map(p => (
          <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {p.image_url && (
                <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 bg-gray-100" onError={(e) => { e.target.style.display = 'none'; }} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500">
                  <span className="text-red-600 font-semibold">{p.current_quantity || 0}</span>
                  <span className="text-gray-400"> / {p.reorder_threshold} {p.unit || ''}</span>
                  {p.brand && <span className="text-gray-400 ml-1">&#183; {p.brand}</span>}
                </p>
              </div>
            </div>
            {p.product_url ? (
              <a
                href={p.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 text-xs bg-amber-500 text-white font-medium rounded hover:bg-amber-600 whitespace-nowrap flex-shrink-0"
              >
                {t('lowStock.reorder')}
              </a>
            ) : (
              <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full flex-shrink-0">{t('lowStock.low')}</span>
            )}
          </div>
        ))}
      </div>
      {lowStock.length > 5 && (
        <div className="px-4 py-2 bg-gray-50 border-t text-center">
          <a href="/products" className="text-xs text-amber-600 font-medium hover:underline">
            {t('lowStock.moreItems', { count: lowStock.length - 5 })}
          </a>
        </div>
      )}
    </div>
  );
}

// Quick Stats Bar Component (inline, fast loading)
function ExpiringQuotesWidget({ expiring = [], expired = [] }) {
  const { t } = useTranslation();
  const [extending, setExtending] = useState(null);

  if (expiring.length === 0 && expired.length === 0) return null;

  const handleExtend = async (quoteId, days = 7) => {
    setExtending(quoteId);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/quotes/${quoteId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ days }),
      });
      if (res.ok) {
        // Remove from the list by reloading
        window.location.reload();
      }
    } catch (err) {
      console.error('Extend failed:', err);
    } finally {
      setExtending(null);
    }
  };

  const formatExpiry = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60));
    if (diff > 0 && diff < 24) return `${diff}h left`;
    if (diff <= 0) {
      const daysAgo = Math.abs(Math.floor(diff / 24));
      return daysAgo === 0 ? t('common.today') : `${daysAgo}d ago`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-3">
      {/* Expiring Soon */}
      {expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-sm text-amber-900 mb-2 flex items-center gap-2">
            <span>&#9200;</span> {t('dashboard.expiringSoon')} ({expiring.length})
          </h3>
          <div className="space-y-2">
            {expiring.map((q) => (
              <div key={q.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{q.client_name || t('common.customer')}</p>
                  <p className="text-xs text-gray-500">{q.aircraft_model || q.aircraft_type || t('common.aircraft')} &#183; {currencySymbol()}{(q.total_price || 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-600 font-medium">{formatExpiry(q.valid_until)}</span>
                  <button
                    onClick={() => handleExtend(q.id)}
                    disabled={extending === q.id}
                    className="px-3 py-2 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 font-medium min-h-[36px]"
                  >
                    {extending === q.id ? '...' : t('dashboard.extendDays')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Expired */}
      {expired.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-sm text-red-900 mb-2 flex items-center gap-2">
            <span>&#128683;</span> {t('dashboard.recentlyExpired')} ({expired.length})
          </h3>
          <div className="space-y-2">
            {expired.slice(0, 5).map((q) => (
              <div key={q.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{q.client_name || t('common.customer')}</p>
                  <p className="text-xs text-gray-500">{q.aircraft_model || q.aircraft_type || t('common.aircraft')} &#183; {currencySymbol()}{(q.total_price || 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">{formatExpiry(q.valid_until)}</span>
                  <button
                    onClick={() => handleExtend(q.id)}
                    disabled={extending === q.id}
                    className="px-3 py-2 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 font-medium min-h-[36px]"
                  >
                    {extending === q.id ? '...' : t('dashboard.reactivate')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// QuickStats and RecentQuotes replaced by inline analytics dashboard below
function _UnusedQuickStats({ stats, onNewQuote }) {
  const { t } = useTranslation();
  if (!stats) return null;

  const activityLabels = {
    completed: { text: t('dashboard.jobCompleted'), color: 'text-emerald-600', icon: '\u2713' },
    paid: { text: t('dashboard.paymentReceived'), color: 'text-green-600', icon: '$' },
    viewed: { text: t('dashboard.quoteViewed'), color: 'text-purple-600', icon: '\u25C9' },
    sent: { text: t('dashboard.quoteSent'), color: 'text-blue-600', icon: '\u2192' },
    created: { text: t('dashboard.quoteCreated'), color: 'text-gray-600', icon: '+' },
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('notifications.justNow');
    if (mins < 60) return t('notifications.minutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('notifications.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    return t('notifications.daysAgo', { n: days });
  };

  return (
    <div className="space-y-3 mb-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{t('dashboard.todaysJobs')}</p>
          <p className="text-xl font-bold text-blue-600">{stats.todayScheduledJobs || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{t('dashboard.pendingQuotes')}</p>
          <p className="text-xl font-bold text-amber-600">{stats.pendingQuotes || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{t('dashboard.thisWeek')}</p>
          <p className="text-xl font-bold text-gray-900">{currencySymbol()}{(stats.weekRevenue || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{t('dashboard.thisMonth')}</p>
          <p className="text-xl font-bold text-gray-900">{currencySymbol()}{(stats.monthRevenue || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{t('dashboard.outstanding')}</p>
          <p className="text-xl font-bold text-red-500">{stats.outstandingInvoices || 0}</p>
          {stats.outstandingTotal > 0 && (
            <p className="text-xs text-gray-400">{currencySymbol()}{(stats.outstandingTotal || 0).toLocaleString()}</p>
          )}
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{t('dashboard.avgJobValue')}</p>
          <p className="text-xl font-bold text-green-600">{currencySymbol()}{formatPriceWhole(stats.avgJobValue)}</p>
        </div>
        {stats.avgRating !== null && stats.avgRating !== undefined && (
          <div className="bg-white rounded-lg p-3 shadow">
            <p className="text-gray-500 text-xs">{t('dashboard.avgRating')}</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xl font-bold text-amber-500">{stats.avgRating}</p>
              <span className="text-amber-400 text-sm">&#9733;</span>
            </div>
            {stats.totalReviews > 0 && (
              <p className="text-xs text-gray-400">{stats.totalReviews} review{stats.totalReviews !== 1 ? 's' : ''}</p>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={onNewQuote}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-base font-bold hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/30 min-h-[48px] transition-all"
        >
          <span className="text-xl">+</span> {t('quickActions.newQuote')}
        </button>
        <button
          onClick={() => setShowAddCustomerModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]"
        >
          <span>&#128100;</span> {t('dashboard.addCustomer')}
        </button>
        <a
          href="/calendar"
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]"
        >
          <span>&#128197;</span> {t('dashboard.viewCalendar')}
        </a>
        <a
          href="/quotes"
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]"
        >
          <span>&#128196;</span> {t('dashboard.allQuotes')}
        </a>
      </div>

      {/* Recent Activity Feed */}
      {stats.activityFeed && stats.activityFeed.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">{t('dashboard.recentActivity')}</h3>
          <div className="space-y-2">
            {stats.activityFeed.map((item, i) => {
              const label = activityLabels[item.type] || activityLabels.created;
              return (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${label.color} bg-gray-100`}>
                      {label.icon}
                    </span>
                    <div>
                      <span className="text-gray-800">{label.text}</span>
                      <span className="text-gray-400 mx-1">&#183;</span>
                      <span className="text-gray-600">{item.name}</span>
                      <span className="text-gray-400 ml-1 text-xs">({item.aircraft})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{currencySymbol()}{(item.price || 0).toLocaleString()}</span>
                    <span className="text-xs text-gray-400 w-14 text-right">{timeAgo(item.date)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expiring & Expired Quotes Widget */}
      <ExpiringQuotesWidget expiring={stats.expiringQuotes} expired={stats.recentlyExpired} />
    </div>
  );
}

function _UnusedRecentQuotes({ quotes, onViewQuote }) {
  const { t } = useTranslation();
  if (!quotes || quotes.length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 mb-4 shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">{t('dashboard.recentQuotes')}</h3>
          <a href="/quotes" className="text-sm text-amber-600 hover:underline">{t('common.viewAll')}</a>
        </div>
        <p className="text-gray-500 text-sm">{t('dashboard.noQuotesYet')}</p>
      </div>
    );
  }

  const statusColors = {
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-purple-100 text-purple-700',
    accepted: 'bg-green-100 text-green-700',
    completed: 'bg-emerald-100 text-emerald-700',
    declined: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="bg-white rounded-lg p-4 mb-4 shadow">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">{t('dashboard.recentQuotes')}</h3>
        <a href="/quotes" className="text-sm text-amber-600 hover:underline">{t('common.viewAll')}</a>
      </div>
      <div className="space-y-2">
        {quotes.map((quote) => (
          <a
            key={quote.id}
            href={`/quotes/${quote.id}`}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {quote.aircraft_name || t('jobs.unknownAircraft')}
              </p>
              <p className="text-sm text-gray-500">
                {quote.customer_name || quote.customer_email || 'No customer'}
                {quote.created_at && (
                  <span className="ml-2">
                    {new Date(quote.created_at).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full ${statusColors[quote.status] || 'bg-gray-100 text-gray-600'}`}>
                {quote.status || t('status.draft').toLowerCase()}
              </span>
              <span className="font-bold text-gray-900">{currencySymbol()}{formatPriceWhole(quote.total_price)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}


// Upcoming Recurring Services Component
function UpcomingRecurring({ recurring }) {
  const { t } = useTranslation();
  if (!recurring || recurring.length === 0) return null;

  const intervalLabels = {
    weekly: t('recurring.weekly'),
    biweekly: t('recurring.biweekly'),
    '4_weeks': t('recurring.fourWeeks'),
    monthly: t('recurring.monthly'),
    '6_weeks': t('recurring.sixWeeks'),
    quarterly: t('recurring.quarterly'),
  };

  return (
    <div className="bg-white rounded-lg p-4 mb-4 shadow">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">{t('dashboard.upcomingRecurring')}</h3>
        <a href="/recurring" className="text-sm text-amber-600 hover:underline">{t('dashboard.manageAll')}</a>
      </div>
      <div className="space-y-2">
        {recurring.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {item.customer_name || item.client_name || t('common.customer')}
              </p>
              <p className="text-sm text-gray-500">
                {item.aircraft_model || item.aircraft_type || t('common.aircraft')}
                <span className="ml-2 text-xs text-gray-400">{intervalLabels[item.recurring_interval] || item.recurring_interval}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900">{currencySymbol()}{formatPriceWhole(item.total_price)}</p>
              <p className="text-xs text-amber-600">
                {item.next_service_date ? new Date(item.next_service_date).toLocaleDateString() : 'No date'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const { success: toastSuccess } = useToast();
  const [user, setUser] = useState(null);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [availableServices, setAvailableServices] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stripeStatus, setStripeStatus] = useState({ connected: false, status: 'CHECKING' });
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dailyTip, setDailyTip] = useState(null);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [quickStats, setQuickStats] = useState(null);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [upcomingRecurring, setUpcomingRecurring] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [upcomingJobs, setUpcomingJobs] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    const parsedUser = JSON.parse(stored);
    setUser(parsedUser);
    setLoading(false);

    // Refresh user data from server to get latest plan/permissions
    const refreshUser = async () => {
      try {
        const res = await fetch('/api/user/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('vector_user', JSON.stringify(data.user));
          }
        }
      } catch (e) {}
    };
    refreshUser();

    // Check onboarding status
    const checkOnboarding = async () => {
      try {
        const res = await fetch('/api/onboarding', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.onboarding_complete === false) {
            router.push('/onboarding');
            return true;
          }
        }
      } catch (e) {}
      return false;
    };

    // Fetch all dashboard data in parallel
    const fetchDashboardData = async () => {
      const headers = { Authorization: `Bearer ${token}` };

      // All fetches in parallel for speed
      const [stripeRes, servicesRes, tipRes, statsRes, quotesRes, recurringRes, analyticsRes, upcomingRes] = await Promise.allSettled([
        fetch('/api/stripe/status', { headers }),
        fetch('/api/services', { headers }),
        fetch('/api/tips', { headers }),
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/quotes?limit=5&sort=created_at&order=desc', { headers }),
        fetch('/api/recurring?status=active', { headers }),
        fetch('/api/analytics?days=90', { headers }),
        fetch('/api/quotes?status=paid,scheduled,in_progress&has_date=true&limit=10&sort=scheduled_date&order=asc', { headers }),
      ]);

      // Process Stripe status
      if (stripeRes.status === 'fulfilled' && stripeRes.value.ok) {
        const data = await stripeRes.value.json();
        setStripeStatus(data);
      } else {
        setStripeStatus({ connected: false, status: 'UNKNOWN' });
      }

      // Process services (for setup prompt)
      if (servicesRes.status === 'fulfilled' && servicesRes.value.ok) {
        const data = await servicesRes.value.json();
        setAvailableServices(data.services || []);
      }

      // Process daily tip
      if (tipRes.status === 'fulfilled' && tipRes.value.ok) {
        const data = await tipRes.value.json();
        setDailyTip(data.todaysTip);
      }

      // Process quick stats
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const data = await statsRes.value.json();
        setQuickStats(data);
      }

      // Process recent quotes
      if (quotesRes.status === 'fulfilled' && quotesRes.value.ok) {
        const data = await quotesRes.value.json();
        setRecentQuotes(data.quotes || []);
      }

      // Process recurring services
      if (recurringRes.status === 'fulfilled' && recurringRes.value.ok) {
        const data = await recurringRes.value.json();
        setUpcomingRecurring(data.recurring || []);
      }

      // Process analytics data
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
        const data = await analyticsRes.value.json();
        setAnalyticsData(data);
      }

      // Process upcoming jobs
      if (upcomingRes.status === 'fulfilled' && upcomingRes.value.ok) {
        const data = await upcomingRes.value.json();
        const now = new Date();
        const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcoming = (data.quotes || []).filter(q => {
          if (!q.scheduled_date) return false;
          const d = new Date(q.scheduled_date);
          return d >= now && d <= in7days;
        });
        setUpcomingJobs(upcoming.slice(0, 5));
      }
    };

    checkOnboarding().then(redirected => {
      if (!redirected) {
        fetchDashboardData().catch(err => console.error('Dashboard fetch error:', err));
      }
    });
  }, [router]);

  const handleConnectStripe = async () => {
    setStripeLoading(true);
    setStripeError(null);
    try {
      const token = localStorage.getItem('vector_token');
      if (!token) {
        setStripeError(t('errors.notLoggedIn'));
        return;
      }
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
        console.error('Stripe error:', errorMsg);
        setStripeError(errorMsg);
      } else {
        setStripeError('No redirect URL received - please try again');
      }
    } catch (err) {
      console.error('Failed to connect Stripe:', err);
      setStripeError(t('errors.networkError', { error: err.message }));
    } finally {
      setStripeLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vector_token');
    localStorage.removeItem('vector_user');
    router.push('/login');
  };

  if (loading) {
    return <LoadingSpinner message={t('dashboard.loadingDashboard')} />;
  }

  return (
    <div className="page-transition min-h-screen overflow-y-auto bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 pb-40 text-gray-900">
      <DashboardTour />
      {/* Header */}
      <header className="sticky top-0 z-40 -mx-4 -mt-4 px-4 pt-4 pb-3 mb-1 bg-gradient-to-b from-[#0f172a] via-[#0f172a] to-transparent flex justify-between items-center text-white">
        <div className="flex items-center space-x-2 text-xl sm:text-2xl font-bold">
          <span>&#9992;</span>
          <span>{t('dashboard.title')}</span>
          {user && <span className="text-sm sm:text-lg font-medium hidden sm:inline">- {user.company}</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <DashboardLanguageSelector />
          <GlobalSearch />
          <NotificationBell />
          <PointsBadge />
          {/* Desktop nav links */}
          <div className="hidden md:flex items-center space-x-4">
            <a href="/quotes" className="underline">{t('nav.quotes')}</a>
            <a href="/calendar" className="underline" data-tour="nav-calendar">{t('nav.calendar')}</a>
            <a href="/customers" className="underline">{t('nav.customers')}</a>
            <a href="/team" className="underline">{t('nav.team')}</a>
            <a href="/settings" className="underline" data-tour="nav-settings">{t('nav.settings')}</a>
            <button onClick={handleLogout} className="underline">{t('common.logout')}</button>
          </div>
          {/* Mobile hamburger menu */}
          <div className="md:hidden relative">
            <button
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="p-2 rounded-lg hover:bg-white/10"
              aria-label="Menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            {mobileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#1e3a5f] rounded-lg shadow-xl border border-white/10 py-2 z-50">
                {[
                  { href: '/quotes', label: t('nav.quotes') },
                  { href: '/calendar', label: t('nav.calendar') },
                  { href: '/customers', label: t('nav.customers') },
                  { href: '/team', label: t('nav.team') },
                  { href: '/settings', label: t('nav.settings') },
                ].map(link => (
                  <a key={link.href} href={link.href} className="block px-4 py-3 hover:bg-white/10 text-sm">{link.label}</a>
                ))}
                <button onClick={handleLogout} className="block w-full text-left px-4 py-3 hover:bg-white/10 text-sm border-t border-white/10">{t('common.logout')}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Stripe Warning Banner */}
      {!stripeStatus.connected && stripeStatus.status !== 'CHECKING' && (
        <StripeWarningBanner
          onConnect={handleConnectStripe}
          loading={stripeLoading}
          error={stripeError}
          onClearError={() => setStripeError(null)}
          status={stripeStatus.status}
        />
      )}

      {/* Services Configuration Prompt */}
      {user && availableServices.length === 0 && (
        <div data-tour="services-prompt" className="bg-blue-100 border border-blue-300 rounded-lg p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center">
            <span className="text-blue-600 text-xl mr-3">&#9432;</span>
            <div>
              <p className="text-blue-800 font-medium">{t('dashboard.setupServiceMenu')}</p>
              <p className="text-blue-700 text-sm">{t('dashboard.addServicesDesc')}</p>
            </div>
          </div>
          <a
            href="/settings/services"
            className="px-4 py-3 rounded bg-blue-500 text-white font-medium hover:bg-blue-600 min-h-[44px] whitespace-nowrap"
          >
            {t('dashboard.addServicesToStart')}
          </a>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          BUSINESS OVERVIEW - Key Stats at Top
          ═══════════════════════════════════════════════════════════ */}
      <div className="mb-4 space-y-4">

        {/* ── Key Business Metrics ── */}
        <div data-tour="quick-stats">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">{t('dashboard.businessOverview')}</h2>
            <a href="/analytics" className="text-sm text-amber-400 hover:underline">{t('dashboard.viewAnalytics')}</a>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">{t('dashboard.totalRevenue')}</p>
              <p className="text-2xl font-bold text-gray-900">{currencySymbol()}{(quickStats?.monthRevenue || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard.thisMonth')}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">{t('dashboard.conversionRate')}</p>
              <p className="text-2xl font-bold text-emerald-600">
                {quickStats && analyticsData?.funnel ? (
                  analyticsData.funnel.totalSent > 0
                    ? `${Math.round((analyticsData.funnel.totalPaid / analyticsData.funnel.totalSent) * 100)}%`
                    : '0%'
                ) : '--'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {analyticsData?.funnel ? `${analyticsData.funnel.totalPaid} ${t('dashboard.booked')} / ${analyticsData.funnel.totalSent} ${t('dashboard.sent').toLowerCase()}` : ''}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">{t('dashboard.outstanding')}</p>
              <p className="text-2xl font-bold text-red-500">{quickStats?.outstandingInvoices || 0}</p>
              <p className="text-xs text-gray-400 mt-1">{currencySymbol()}{(quickStats?.outstandingTotal || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">{t('dashboard.avgJobValue')}</p>
              <p className="text-2xl font-bold text-blue-600">{currencySymbol()}{formatPriceWhole(quickStats?.avgJobValue)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">{t('dashboard.jobsCompleted')}</p>
              <p className="text-2xl font-bold text-emerald-600">{quickStats?.monthJobs || 0}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dashboard.thisMonth')}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <a
            href="/quotes/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg text-sm font-semibold hover:opacity-90 shadow min-h-[44px]"
          >
            <span>+</span> {t('quickActions.newQuote')}
          </a>
          <button onClick={() => setShowAddCustomerModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128100;</span> {t('dashboard.addCustomer')}
          </button>
          <a href="/calendar" className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128197;</span> {t('dashboard.viewCalendar')}
          </a>
          <a href="/quotes" className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128196;</span> {t('dashboard.allQuotes')}
          </a>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ANALYTICS & ACTIVITY
          ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-4">

        {/* Expiring Quotes alerts */}
        <ExpiringQuotesWidget expiring={quickStats?.expiringQuotes} expired={quickStats?.recentlyExpired} />

        {/* ── MIDDLE: Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Revenue by Month - Bar Chart */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">{t('dashboard.revenueByMonth')}</h3>
            {analyticsData?.revenueTrend && analyticsData.revenueTrend.length > 0 ? (() => {
              const data = analyticsData.revenueTrend.slice(-6);
              const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
              return (
                <div className="space-y-2">
                  <div className="flex items-end gap-2 h-40">
                    {data.map((d) => {
                      const height = Math.max((d.revenue / maxRevenue) * 100, 4);
                      const monthLabel = new Date(d.month + '-01').toLocaleDateString('en-US', { month: 'short' });
                      return (
                        <div key={d.month} className="flex-1 flex flex-col items-center justify-end h-full">
                          <span className="text-xs text-gray-500 mb-1">{currencySymbol()}{d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue}</span>
                          <div
                            className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-md transition-all duration-500"
                            style={{ height: `${height}%`, minHeight: '4px' }}
                          />
                          <span className="text-xs text-gray-400 mt-1">{monthLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs text-gray-400 text-center">{data.reduce((s, d) => s + d.jobs, 0)} jobs over {data.length} months</div>
                </div>
              );
            })() : (
              <p className="text-sm text-gray-400 text-center py-8">{t('dashboard.noRevenueData')}</p>
            )}
          </div>

          {/* Quote Conversion Funnel */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">{t('dashboard.conversionFunnel')}</h3>
            {analyticsData?.funnel && analyticsData.funnel.totalCreated > 0 ? (() => {
              const f = analyticsData.funnel;
              const steps = [
                { label: t('dashboard.created'), value: f.totalCreated, color: 'bg-gray-400' },
                { label: t('dashboard.sent'), value: f.totalSent, color: 'bg-blue-400' },
                { label: t('dashboard.viewed'), value: f.totalViewed, color: 'bg-purple-400' },
                { label: t('dashboard.paid'), value: f.totalPaid, color: 'bg-green-400' },
                { label: t('dashboard.completed'), value: f.totalCompleted, color: 'bg-emerald-500' },
              ];
              const maxVal = f.totalCreated || 1;
              return (
                <div className="space-y-2">
                  {steps.map((step) => {
                    const pct = Math.round((step.value / maxVal) * 100);
                    return (
                      <div key={step.label}>
                        <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                          <span>{step.label}</span>
                          <span className="font-medium">{step.value} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-5">
                          <div
                            className={`${step.color} h-5 rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <p className="text-sm text-gray-400 text-center py-8">{t('dashboard.noRevenueData')}</p>
            )}
          </div>

          {/* Top Services by Revenue */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">{t('dashboard.topServicesByRevenue')}</h3>
            {analyticsData?.topServices && analyticsData.topServices.length > 0 ? (() => {
              const maxRev = analyticsData.topServices[0]?.revenue || 1;
              return (
                <div className="space-y-2">
                  {analyticsData.topServices.slice(0, 5).map((svc) => {
                    const pct = Math.round((svc.revenue / maxRev) * 100);
                    return (
                      <div key={svc.name}>
                        <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                          <span className="truncate mr-2">{svc.name}</span>
                          <span className="font-medium whitespace-nowrap">{currencySymbol()}{svc.revenue.toLocaleString()} ({svc.count})</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-blue-400 to-blue-500 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <p className="text-sm text-gray-400 text-center py-8">{t('dashboard.noServiceData')}</p>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">{t('dashboard.recentActivity')}</h3>
            {quickStats?.activityFeed && quickStats.activityFeed.length > 0 ? (
              <div className="space-y-2">
                {quickStats.activityFeed.map((item, i) => {
                  const labels = {
                    completed: { text: t('dashboard.jobCompleted'), color: 'text-emerald-600 bg-emerald-50', icon: '\u2713' },
                    paid: { text: t('dashboard.paymentReceived'), color: 'text-green-600 bg-green-50', icon: '$' },
                    viewed: { text: t('dashboard.quoteViewed'), color: 'text-purple-600 bg-purple-50', icon: '\u25C9' },
                    sent: { text: t('dashboard.quoteSent'), color: 'text-blue-600 bg-blue-50', icon: '\u2192' },
                    created: { text: t('dashboard.quoteCreated'), color: 'text-gray-600 bg-gray-50', icon: '+' },
                  };
                  const label = labels[item.type] || labels.created;
                  const diff = Date.now() - new Date(item.date).getTime();
                  const mins = Math.floor(diff / 60000);
                  const timeStr = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${label.color} shrink-0`}>
                          {label.icon}
                        </span>
                        <div className="min-w-0">
                          <span className="text-gray-800 text-xs">{label.text}</span>
                          <span className="text-gray-400 mx-1">&#183;</span>
                          <span className="text-gray-600 text-xs truncate">{item.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="font-medium text-gray-900 text-sm">{currencySymbol()}{(item.price || 0).toLocaleString()}</span>
                        <span className="text-xs text-gray-400 w-8 text-right">{timeStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">{t('dashboard.noQuotesYet')}</p>
            )}
          </div>
        </div>

        {/* ── BOTTOM: Recent Quotes (compact) + Upcoming Jobs ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Compact Recent Quotes */}
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-gray-700">{t('dashboard.recentQuotes')}</h3>
              <a href="/quotes" className="text-xs text-amber-600 hover:underline">{t('common.viewAll')}</a>
            </div>
            {recentQuotes.length > 0 ? (
              <div className="space-y-1.5">
                {recentQuotes.slice(0, 5).map((q) => {
                  const sc = { sent: 'text-blue-600', viewed: 'text-purple-600', accepted: 'text-green-600', completed: 'text-emerald-600', paid: 'text-green-600', declined: 'text-red-500', expired: 'text-gray-400' };
                  return (
                    <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{q.aircraft_name || q.aircraft_model || t('jobs.unknownAircraft')}</p>
                        <p className="text-xs text-gray-400 truncate">{q.customer_name || q.customer_email || ''}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className={`text-xs font-medium ${sc[q.status] || 'text-gray-500'}`}>{q.status}</span>
                        <span className="text-sm font-bold text-gray-900">{currencySymbol()}{formatPriceWhole(q.total_price)}</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">{t('dashboard.noQuotesYet')}</p>
            )}
          </div>

          {/* Upcoming Jobs (Next 7 Days) */}
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-gray-700">{t('dashboard.upcomingJobs')} <span className="text-xs text-gray-400 font-normal">({t('dashboard.next7Days')})</span></h3>
              <a href="/calendar" className="text-xs text-amber-600 hover:underline">{t('dashboard.viewCalendar')}</a>
            </div>
            {upcomingJobs.length > 0 ? (
              <div className="space-y-1.5">
                {upcomingJobs.map((job) => {
                  const d = new Date(job.scheduled_date);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <div key={job.id} className="flex items-center justify-between py-1.5 px-1 -mx-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{job.aircraft_name || job.aircraft_model || t('jobs.unknownAircraft')}</p>
                        <p className="text-xs text-gray-400 truncate">{job.customer_name || job.client_name || ''}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-xs font-medium ${isToday ? 'text-amber-600' : 'text-gray-600'}`}>
                          {isToday ? t('common.today') : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-sm font-bold text-gray-900">{currencySymbol()}{formatPriceWhole(job.total_price)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">{t('dashboard.noUpcomingJobs')}</p>
            )}
          </div>
        </div>

        {/* Recurring Services */}
        <UpcomingRecurring recurring={upcomingRecurring} />

        {/* Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WeatherWidget />
          <div>
            <LowStockAlert />
            <FreeUsageBar user={user} />
          </div>
        </div>

        {/* Daily Tip */}
        {dailyTip && !tipDismissed && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>&#128161;</span>
              <span className="text-sm text-amber-800">
                <strong>{dailyTip.title}:</strong> {dailyTip.content}
              </span>
              {dailyTip.actionLink && (
                <a href={dailyTip.actionLink} className="text-sm text-amber-600 font-medium hover:underline ml-2">
                  {dailyTip.action || 'Learn more'} &#8594;
                </a>
              )}
            </div>
            <button
              onClick={() => setTipDismissed(true)}
              className="text-amber-400 hover:text-amber-600 text-lg leading-none ml-2"
              title="Dismiss"
            >
              &#10005;
            </button>
          </div>
        )}

        <PushNotifications />

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <a href="/products" className="flex flex-col items-center p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white min-h-[60px]">
            <span className="text-2xl mb-1">&#128230;</span>
            <span className="text-sm font-medium">{t('nav.inventory')}</span>
          </a>
          <a href="/equipment" className="flex flex-col items-center p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white min-h-[60px]">
            <span className="text-2xl mb-1">&#128295;</span>
            <span className="text-sm font-medium">{t('nav.equipment')}</span>
          </a>
          <a href="/growth" className="flex flex-col items-center p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white min-h-[60px]">
            <span className="text-2xl mb-1">&#128200;</span>
            <span className="text-sm font-medium">{t('nav.growth')}</span>
          </a>
          <a href="/settings/services" className="flex flex-col items-center p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white min-h-[60px]">
            <span className="text-2xl mb-1">&#9881;</span>
            <span className="text-sm font-medium">{t('nav.services')}</span>
          </a>
        </div>
      </div>

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={showAddCustomerModal}
        onClose={() => setShowAddCustomerModal(false)}
        onSuccess={(data) => {
          toastSuccess(data?.created ? 'Customer added!' : 'Customer saved!');
          // Refresh quick stats to update any customer counts
          const token = localStorage.getItem('vector_token');
          if (token) {
            fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : null)
              .then(d => { if (d) setQuickStats(d); })
              .catch(() => {});
          }
        }}
      />
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
