"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SendQuoteModal from '../../components/SendQuoteModal.jsx';
import PushNotifications from '../../components/PushNotifications.jsx';
import PointsBadge from '../../components/PointsBadge.jsx';
import NotificationBell from '../../components/NotificationBell.jsx';
import GlobalSearch from '../../components/GlobalSearch.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatPrice, formatPriceWhole, currencySymbol } from '../../lib/formatPrice';
import { calculateProductEstimates } from '../../lib/product-calculator';
import DashboardTour from '../../components/DashboardTour.jsx';
import WeatherWidget from '../../components/WeatherWidget.jsx';
import DashboardLanguageSelector from '../../components/DashboardLanguageSelector.jsx';
import { useTranslation } from '@/lib/i18n';

const categoryOrder = ['piston', 'turboprop', 'light_jet', 'midsize_jet', 'super_midsize_jet', 'large_jet', 'helicopter'];

// Mapping of hours_field values to their aircraft column names and display labels
const HOURS_FIELD_OPTIONS = {
  ext_wash_hours: 'Exterior Wash',
  int_detail_hours: 'Interior Detail',
  leather_hours: 'Leather Treatment',
  carpet_hours: 'Carpet Cleaning',
  wax_hours: 'Wax Application',
  polish_hours: 'Polish',
  ceramic_hours: 'Ceramic Coating',
  brightwork_hours: 'Brightwork',
};

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
        <a
          href="/customers"
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]"
        >
          <span>&#128100;</span> {t('dashboard.addCustomer')}
        </a>
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
  const [user, setUser] = useState(null);
  const [availableServices, setAvailableServices] = useState([]);
  const [availablePackages, setAvailablePackages] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [selectedAircraft, setSelectedAircraft] = useState(null);
  const [selectedServices, setSelectedServices] = useState({});
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [accessDifficulty, setAccessDifficulty] = useState(1.0);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stripeStatus, setStripeStatus] = useState({ connected: false, status: 'CHECKING' });
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minimumFee, setMinimumFee] = useState(0);
  const [minimumFeeLocations, setMinimumFeeLocations] = useState([]);
  const [jobLocation, setJobLocation] = useState('');
  const [dailyTip, setDailyTip] = useState(null);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [quickStats, setQuickStats] = useState(null);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [upcomingRecurring, setUpcomingRecurring] = useState([]);
  const [availableAddons, setAvailableAddons] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState({});
  const [airport, setAirport] = useState('');
  const [customProductRatios, setCustomProductRatios] = useState(null);

  // Service-linked products & equipment
  const [serviceProductLinks, setServiceProductLinks] = useState([]);
  const [serviceEquipmentLinks, setServiceEquipmentLinks] = useState([]);

  // Analytics data for dashboard charts
  const [analyticsData, setAnalyticsData] = useState(null);
  const [upcomingJobs, setUpcomingJobs] = useState([]);

  const categoryLabels = {
    piston: t('categories.piston'),
    turboprop: t('categories.turboprop'),
    light_jet: t('categories.lightJet'),
    midsize_jet: t('categories.midsizeJet'),
    super_midsize_jet: t('categories.superMidsizeJet'),
    large_jet: t('categories.largeJet'),
    helicopter: t('categories.helicopter'),
  };

  // Fetch manufacturers on mount
  useEffect(() => {
    const fetchManufacturers = async () => {
      try {
        const res = await fetch('/api/aircraft/manufacturers');
        if (res.ok) {
          const data = await res.json();
          setManufacturers(data.manufacturers || []);
        }
      } catch (err) {
        console.error('Failed to fetch manufacturers:', err);
      }
    };
    fetchManufacturers();
  }, []);

  // Fetch models when manufacturer changes
  useEffect(() => {
    const fetchModels = async () => {
      const params = new URLSearchParams();
      if (selectedManufacturer) params.set('make', selectedManufacturer);

      try {
        const res = await fetch(`/api/aircraft/models?${params}`);
        if (res.ok) {
          const data = await res.json();
          setModels(data.models || []);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };

    fetchModels();
    setSelectedAircraft(null);
  }, [selectedManufacturer]);

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
      const [stripeRes, servicesRes, packagesRes, minFeeRes, tipRes, statsRes, quotesRes, addonsRes, recurringRes, productRatiosRes, svcProdRes, svcEquipRes, analyticsRes, upcomingRes] = await Promise.allSettled([
        fetch('/api/stripe/status', { headers }),
        fetch('/api/services', { headers }),
        fetch('/api/packages', { headers }),
        fetch('/api/user/minimum-fee', { headers }),
        fetch('/api/tips', { headers }),
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/quotes?limit=5&sort=created_at&order=desc', { headers }),
        fetch('/api/addon-fees', { headers }),
        fetch('/api/recurring?status=active', { headers }),
        fetch('/api/user/product-ratios', { headers }),
        fetch('/api/services/products', { headers }),
        fetch('/api/services/equipment', { headers }),
        fetch('/api/analytics?days=90', { headers }),
        fetch('/api/quotes?status=paid,scheduled,in_progress&has_date=true&limit=10&sort=scheduled_date&order=asc', { headers }),
      ]);

      // Process Stripe status
      if (stripeRes.status === 'fulfilled' && stripeRes.value.ok) {
        const data = await stripeRes.value.json();
        setStripeStatus(data);
      } else {
        // Fetch failed or returned error - assume not connected
        setStripeStatus({ connected: false, status: 'UNKNOWN' });
      }

      // Process services (new flat list)
      if (servicesRes.status === 'fulfilled' && servicesRes.value.ok) {
        const data = await servicesRes.value.json();
        setAvailableServices(data.services || []);
      }

      // Process packages
      if (packagesRes.status === 'fulfilled' && packagesRes.value.ok) {
        const data = await packagesRes.value.json();
        setAvailablePackages(data.packages || []);
      }

      // Process minimum fee
      if (minFeeRes.status === 'fulfilled' && minFeeRes.value.ok) {
        const data = await minFeeRes.value.json();
        setMinimumFee(parseFloat(data.minimum_callout_fee) || 0);
        setMinimumFeeLocations(data.minimum_fee_locations || []);
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

      // Process addon fees
      if (addonsRes.status === 'fulfilled' && addonsRes.value.ok) {
        const data = await addonsRes.value.json();
        setAvailableAddons(data.fees || []);
      }

      // Process recurring services
      if (recurringRes.status === 'fulfilled' && recurringRes.value.ok) {
        const data = await recurringRes.value.json();
        setUpcomingRecurring(data.recurring || []);
      }

      // Process custom product ratios
      if (productRatiosRes.status === 'fulfilled' && productRatiosRes.value.ok) {
        const data = await productRatiosRes.value.json();
        if (data.ratios) setCustomProductRatios(data.ratios);
      }

      // Process service-linked products
      if (svcProdRes.status === 'fulfilled' && svcProdRes.value.ok) {
        const data = await svcProdRes.value.json();
        setServiceProductLinks(data.links || []);
      }

      // Process service-linked equipment
      if (svcEquipRes.status === 'fulfilled' && svcEquipRes.value.ok) {
        const data = await svcEquipRes.value.json();
        setServiceEquipmentLinks(data.links || []);
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

  const handleSelectAircraft = async (aircraft) => {
    try {
      const res = await fetch(`/api/aircraft/${aircraft.id}`);
      if (res.ok) {
        const data = await res.json();
        const fullAircraft = data.aircraft;
        setSelectedAircraft(fullAircraft);
        setSelectedServices({});
        setSelectedPackage(null);
        setSelectedAddons({});
        setAccessDifficulty(1.0);
        setQuoteNotes('');
        setJobLocation('');
        setAirport('');
        // Auto-scroll to services section
        setTimeout(() => {
          document.getElementById('services-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (err) {
      console.error('Failed to fetch aircraft details:', err);
    }
  };

  const toggleService = (serviceId) => {
    // Deselect any package when manually selecting services
    setSelectedPackage(null);
    setSelectedServices((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
  };

  const selectPackage = (pkg) => {
    if (selectedPackage?.id === pkg.id) {
      // Deselect package
      setSelectedPackage(null);
      setSelectedServices({});
    } else {
      // Select package - auto-select its services
      setSelectedPackage(pkg);
      const newSelected = {};
      (pkg.service_ids || []).forEach(id => {
        newSelected[id] = true;
      });
      setSelectedServices(newSelected);
    }
  };

  // Get aircraft hours for a service based on its hours_field mapping
  const getHoursForService = (svc) => {
    if (!selectedAircraft) return 0;

    // Use explicit hours_field if set on the service
    if (svc.hours_field && selectedAircraft[svc.hours_field] !== undefined) {
      return parseFloat(selectedAircraft[svc.hours_field]) || 0;
    }

    // Map service name to aircraft hour column
    const name = (svc.name || '').toLowerCase();
    if (name.includes('leather')) return parseFloat(selectedAircraft.leather_hours) || 0;
    if (name.includes('carpet') || name.includes('upholster') || name.includes('extract')) return parseFloat(selectedAircraft.carpet_hours) || 0;
    if (name.includes('decon')) return parseFloat(selectedAircraft.decon_hours) || parseFloat(selectedAircraft.ext_wash_hours) || 0;
    // "Spray Ceramic" must match before generic "Ceramic"
    if (name.includes('spray ceramic') || name.includes('spray coat') || name.includes('topcoat')) return parseFloat(selectedAircraft.spray_ceramic_hours) || parseFloat(selectedAircraft.ceramic_hours) || 0;
    if (name.includes('ceramic')) return parseFloat(selectedAircraft.ceramic_hours) || 0;
    if (name.includes('wax')) return parseFloat(selectedAircraft.wax_hours) || 0;
    if (name.includes('brightwork') || name.includes('bright') || name.includes('chrome')) return parseFloat(selectedAircraft.brightwork_hours) || 0;
    // "Polish Brightwork" already handled above; this catches "One-Step Polish" etc.
    if (name.includes('polish')) return parseFloat(selectedAircraft.polish_hours) || 0;
    if (name.includes('quick turn') && name.includes('interior')) return parseFloat(selectedAircraft.int_detail_hours) || 0;
    if (name.includes('quick turn') && name.includes('exterior')) return parseFloat(selectedAircraft.ext_wash_hours) || 0;
    if (name.includes('interior') || name.includes('vacuum') || name.includes('wipe') || name.includes('cabin')) return parseFloat(selectedAircraft.int_detail_hours) || 0;

    // Default: exterior wash hours
    return parseFloat(selectedAircraft.ext_wash_hours) || 0;
  };

  // Calculate price for a single service: aircraft hours × hourly rate
  const getServicePrice = (svc) => {
    const hours = getHoursForService(svc);
    return hours * (parseFloat(svc.hourly_rate) || 0);
  };

  // Calculate totals based on selected services or package
  const getSelectedServicesList = () => {
    return availableServices.filter(svc => selectedServices[svc.id]);
  };

  const selectedServicesList = getSelectedServicesList();
  const totalHours = selectedServicesList.reduce((sum, svc) => sum + getHoursForService(svc), 0);

  // Step 1: Sum of service prices (hours × rate)
  const servicesSubtotal = selectedServicesList.reduce((sum, svc) => sum + getServicePrice(svc), 0);

  // Step 2: Package discount
  const discountPercent = selectedPackage ? (parseFloat(selectedPackage.discount_percent) || 0) : 0;
  const discountAmount = servicesSubtotal * (discountPercent / 100);
  const afterDiscount = servicesSubtotal - discountAmount;

  // Step 3: Access difficulty
  const afterDifficulty = afterDiscount * accessDifficulty;

  // Step 4: Add-on fees
  const getSelectedAddonsList = () => availableAddons.filter(a => selectedAddons[a.id]);
  const selectedAddonsList = getSelectedAddonsList();
  const flatAddonsTotal = selectedAddonsList.filter(a => a.fee_type === 'flat').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const percentAddonsTotal = selectedAddonsList.filter(a => a.fee_type === 'percent').reduce((sum, a) => sum + (afterDifficulty * (parseFloat(a.amount) || 0) / 100), 0);
  const addonsTotal = flatAddonsTotal + percentAddonsTotal;

  // Step 5: Total before minimum
  const calculatedPrice = afterDifficulty + addonsTotal;

  // Step 6: Minimum fee check
  const minimumFeeApplies = () => {
    if (minimumFee <= 0) return false;
    if (calculatedPrice >= minimumFee) return false;
    if (minimumFeeLocations.length > 0 && airport) {
      const normalizedJob = airport.toUpperCase().trim();
      return minimumFeeLocations.some(loc => normalizedJob.includes(loc.toUpperCase().trim()));
    }
    // Apply minimum if no location restrictions, or no job location specified yet
    return true;
  };

  const isMinimumApplied = minimumFeeApplies();
  const totalPrice = isMinimumApplied ? minimumFee : calculatedPrice;

  // Build line items for quote
  const lineItems = selectedServicesList.map(svc => ({
    service_id: svc.id,
    description: svc.name,
    service_type: svc.service_type || 'exterior',
    hours_field: svc.hours_field || '',
    hours: getHoursForService(svc),
    rate: parseFloat(svc.hourly_rate) || 0,
    amount: getServicePrice(svc) * accessDifficulty * (1 - discountPercent / 100),
    product_cost_per_hour: parseFloat(svc.product_cost_per_hour) || 0,
  }));

  // Estimated product cost for profit preview
  const estimatedProductCost = selectedServicesList.reduce((sum, svc) => {
    const hours = getHoursForService(svc);
    const costPerHour = parseFloat(svc.product_cost_per_hour) || 0;
    return sum + (hours * costPerHour);
  }, 0);
  const estimatedProfit = totalPrice - estimatedProductCost;

  // Product usage estimates
  const productEstimates = selectedAircraft && selectedServicesList.length > 0
    ? calculateProductEstimates(selectedServicesList, selectedAircraft, customProductRatios)
    : [];

  // Build addon fee items for storage
  const addonFeeItems = selectedAddonsList.map(a => ({
    id: a.id,
    name: a.name,
    fee_type: a.fee_type,
    amount: parseFloat(a.amount) || 0,
    calculated: a.fee_type === 'percent' ? afterDifficulty * (parseFloat(a.amount) || 0) / 100 : (parseFloat(a.amount) || 0),
  }));

  const handleLogout = () => {
    localStorage.removeItem('vector_token');
    localStorage.removeItem('vector_user');
    router.push('/login');
  };

  const toggleAddon = (addonId) => {
    setSelectedAddons(prev => ({ ...prev, [addonId]: !prev[addonId] }));
  };

  const openSendModal = () => {
    setModalOpen(true);
  };

  const closeSendModal = () => {
    setModalOpen(false);
  };

  const resetQuoteForm = () => {
    setSelectedAircraft(null);
    setSelectedServices({});
    setSelectedPackage(null);
    setSelectedManufacturer('');
    setSelectedCategory('');
    setModelSearch('');
    setAccessDifficulty(1.0);
    setQuoteNotes('');
    setJobLocation('');
    setAirport('');
    setSelectedAddons({});
    setCustomProductRatios(null);
    setModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const laborTotal = totalPrice - estimatedProductCost;
  const productsTotal = estimatedProductCost;

  const quoteData = selectedAircraft
    ? {
        aircraft: {
          id: selectedAircraft.id,
          name: `${selectedAircraft.manufacturer} ${selectedAircraft.model}`,
          category: selectedAircraft.category,
          surface_area_sqft: selectedAircraft.surface_area_sqft,
        },
        selectedServices: selectedServicesList,
        selectedPackage,
        totalHours,
        totalPrice,
        calculatedPrice,
        isMinimumApplied,
        minimumFee: isMinimumApplied ? minimumFee : null,
        jobLocation,
        lineItems,
        laborTotal,
        productsTotal,
        accessDifficulty,
        discountPercent,
        discountAmount,
        addonFees: addonFeeItems,
        addonsTotal,
        airport,
        productEstimates,
        linkedProducts: serviceProductLinks.filter(l => selectedServicesList.some(s => s.id === l.service_id)).map(l => {
          const svc = selectedServicesList.find(s => s.id === l.service_id);
          const hours = svc ? getHoursForService(svc) : 0;
          return {
            product_id: l.product_id,
            product_name: l.products?.name,
            unit: l.products?.unit,
            quantity: l.fixed_quantity > 0 ? l.fixed_quantity : (l.quantity_per_hour || 0) * hours,
            cost_per_unit: l.products?.cost_per_unit || 0,
          };
        }),
        linkedEquipment: (() => {
          const eqLinks = serviceEquipmentLinks.filter(l => selectedServicesList.some(s => s.id === l.service_id));
          const unique = [];
          const seen = new Set();
          for (const l of eqLinks) {
            if (!seen.has(l.equipment_id)) {
              seen.add(l.equipment_id);
              unique.push({ equipment_id: l.equipment_id, equipment_name: l.equipment?.name, brand: l.equipment?.brand });
            }
          }
          return unique;
        })(),
      }
    : null;

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

      <div className="max-w-3xl mx-auto" data-tour="quote-builder">
          {/* 1. Select Aircraft */}
          <div className="bg-white rounded-lg p-4 mb-4 shadow">
            <h3 className="font-semibold mb-3 text-lg">{t('dashboard.selectAircraft')}</h3>

            {/* Manufacturer Dropdown */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.manufacturer')}</label>
              <select
                value={selectedManufacturer}
                onChange={(e) => setSelectedManufacturer(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-base"
              >
                <option value="">{t('dashboard.selectManufacturer')}</option>
                {manufacturers.map((mfr) => (
                  <option key={mfr} value={mfr}>{mfr}</option>
                ))}
              </select>
            </div>

            {/* Models list — only shown when manufacturer is selected */}
            {selectedManufacturer ? (
              <>
                {/* Search within models */}
                {models.length > 5 && (
                  <div className="mb-2">
                    <input
                      type="text"
                      placeholder={t('dashboard.searchModels')}
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Models sorted by size (smallest → largest) */}
                {(() => {
                  const filteredModels = models
                    .filter(a => !modelSearch ||
                      `${a.manufacturer} ${a.model}`.toLowerCase().includes(modelSearch.toLowerCase()))
                    .sort((a, b) => (a.surface_area_sqft || a.seats || 0) - (b.surface_area_sqft || b.seats || 0));
                  return (
                    <div className="max-h-80 overflow-y-auto border rounded-lg">
                      {filteredModels.length === 0 ? (
                        <div className="p-4 text-gray-500 text-center text-sm">
                          {models.length === 0 ? t('dashboard.loadingAircraft') : t('dashboard.noMatchesFound')}
                        </div>
                      ) : (
                        <div className="divide-y">
                          {filteredModels.map((aircraft) => {
                            const isSelected = selectedAircraft?.id === aircraft.id;
                            return (
                              <div
                                key={aircraft.id}
                                onClick={() => handleSelectAircraft(aircraft)}
                                className={`p-3 cursor-pointer hover:bg-gray-50 flex items-center gap-3 transition-colors ${
                                  isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''
                                }`}
                              >
                                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                  isSelected ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                                }`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium">{aircraft.model}</p>
                                  <p className="text-xs text-gray-400">
                                    {categoryLabels[aircraft.category]}
                                    {aircraft.seats ? ` \u2022 ${aircraft.seats} seats` : ''}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="border rounded-lg p-6 text-center text-gray-400 text-sm">
                {t('dashboard.chooseManufacturerToSeeModels')}
              </div>
            )}
          </div>

          {/* 2. Select Services (auto-scroll target) */}
          {selectedAircraft && (
            <div id="services-section" className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold text-lg mb-3">{t('common.services')}</h3>

              {availableServices.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 mb-2">{t('dashboard.noServicesConfigured')}</p>
                  <a href="/settings/services" className="text-amber-600 hover:underline text-sm">
                    {t('dashboard.addServicesToStart')}
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableServices.map((svc) => {
                    const hours = getHoursForService(svc);
                    const price = getServicePrice(svc);
                    return (
                      <div
                        key={svc.id}
                        className={`flex items-center py-3 px-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedServices[svc.id]
                            ? 'bg-amber-50 border-amber-300'
                            : 'hover:bg-gray-50 border-gray-200'
                        }`}
                        onClick={() => toggleService(svc.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedServices[svc.id] || false}
                          onChange={() => toggleService(svc.id)}
                          className="w-5 h-5 rounded border-gray-300 text-amber-500 focus:ring-amber-500 mr-3"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1">
                          <span className="font-medium">{svc.name}</span>
                          {svc.description && (
                            <span className="text-xs text-gray-500 block">{svc.description}</span>
                          )}
                          <span className="text-xs text-gray-400">
                            {hours.toFixed(1)}{t('common.hrs')} @ {currencySymbol()}{svc.hourly_rate}{t('common.perHour')}
                          </span>
                        </div>
                        <span className="font-bold text-lg">{currencySymbol()}{formatPriceWhole(price)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Packages section */}
              {availablePackages.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <span>&#127873;</span> {t('dashboard.selectPackage')}
                  </h4>
                  <div className="space-y-2">
                    {availablePackages.map((pkg) => {
                      const pkgServices = availableServices.filter(s => (pkg.service_ids || []).includes(s.id));
                      const servicesValue = pkgServices.reduce((sum, s) => sum + getServicePrice(s), 0);
                      const disc = parseFloat(pkg.discount_percent) || 0;
                      const packagePrice = servicesValue * (1 - disc / 100);

                      return (
                        <div
                          key={pkg.id}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedPackage?.id === pkg.id
                              ? 'bg-green-50 border-green-400'
                              : 'hover:bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => selectPackage(pkg)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{pkg.name}</span>
                                {disc > 0 && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                    {disc}% off
                                  </span>
                                )}
                              </div>
                              {pkg.description && (
                                <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
                              )}
                              <p className="text-xs text-gray-400 mt-2">
                                {t('dashboard.includes')} {pkgServices.map(s => s.name).join(', ') || t('dashboard.noServices')}
                              </p>
                            </div>
                            <div className="text-right">
                              {disc > 0 && (
                                <span className="text-sm text-gray-400 line-through block">
                                  {currencySymbol()}{formatPriceWhole(servicesValue)}
                                </span>
                              )}
                              <span className="font-bold text-xl text-green-600">{currencySymbol()}{formatPriceWhole(packagePrice)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Access Difficulty Multiplier */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">{t('dashboard.accessDifficulty')}</h3>
                <span className="text-lg font-bold text-amber-600">{accessDifficulty.toFixed(2)}x</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Adjust for hangar access, location, or special requirements.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 1.0, label: t('dashboard.standard'), desc: t('dashboard.easyAccess') },
                  { value: 1.15, label: t('dashboard.moderate'), desc: t('dashboard.limitedAccess') },
                  { value: 1.3, label: t('dashboard.difficult'), desc: t('dashboard.remoteOrTight') },
                  { value: 1.5, label: t('dashboard.extreme'), desc: t('dashboard.specialEquipment') },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAccessDifficulty(opt.value)}
                    className={`py-3 px-2 rounded text-sm font-medium transition-colors min-h-[44px] ${
                      accessDifficulty === opt.value
                        ? 'bg-amber-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Add-on Fees */}
          {selectedAircraft && availableAddons.length > 0 && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold mb-3">{t('dashboard.addonFees')}</h3>
              <div className="space-y-2">
                {availableAddons.map((addon) => {
                  const isChecked = selectedAddons[addon.id] || false;
                  const displayAmount = addon.fee_type === 'percent'
                    ? `+${addon.amount}%`
                    : `+${currencySymbol()}${addon.amount}`;
                  return (
                    <div
                      key={addon.id}
                      className={`flex items-center py-2 px-3 border rounded-lg cursor-pointer transition-colors ${
                        isChecked ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-gray-200'
                      }`}
                      onClick={() => toggleAddon(addon.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAddon(addon.id)}
                        className="w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500 mr-3"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <span className="font-medium">{addon.name}</span>
                        {addon.description && (
                          <span className="text-xs text-gray-500 block">{addon.description}</span>
                        )}
                      </div>
                      <span className="font-bold text-orange-600">{displayAmount}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Service Location (Airport Code) - single field */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold mb-2">{t('dashboard.jobLocation')} ({t('common.airport')})</h3>
              <input
                type="text"
                value={airport}
                onChange={(e) => { const v = e.target.value.toUpperCase(); setAirport(v); setJobLocation(v); }}
                placeholder={t('dashboard.airportPlaceholder')}
                maxLength={6}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 uppercase font-mono tracking-wider"
              />
              {airport && airport.length < 3 && (
                <p className="text-xs text-red-500 mt-1">Enter a valid airport code</p>
              )}
              {minimumFee > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {minimumFeeLocations.length > 0
                    ? `${t('dashboard.minimumFeeOf')} ${currencySymbol()}${minimumFee.toFixed(2)} ${t('dashboard.appliesAt')}: ${minimumFeeLocations.join(', ')}`
                    : `${t('dashboard.minimumFee')}: ${currencySymbol()}${minimumFee.toFixed(2)}`
                  }
                </p>
              )}
            </div>
          )}

          {/* 6. Notes */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold mb-2">{t('common.notes')}</h3>
              <textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder={t('dashboard.notesPlaceholder')}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
              />
            </div>
          )}

          {/* Aircraft Details (collapsible accordion) */}
          {selectedAircraft && (
            <details className="mb-4 group">
              <summary className="bg-blue-50 border border-blue-200 rounded-lg p-3 cursor-pointer text-sm font-semibold text-blue-900 hover:bg-blue-100 list-none flex justify-between items-center [&::-webkit-details-marker]:hidden">
                <span>Aircraft Details \u2014 {selectedAircraft.manufacturer} {selectedAircraft.model}</span>
                <span className="text-blue-400 text-xs transition-transform group-open:rotate-180">&#9660;</span>
              </summary>
              <div className="bg-blue-50 border border-blue-200 border-t-0 rounded-b-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm text-blue-700">{categoryLabels[selectedAircraft.category]}</p>
                  <div className="text-right">
                    <p className="text-xs text-blue-600">{t('dashboard.surfaceArea')}</p>
                    <p className="text-lg font-bold text-blue-900">{selectedAircraft.surface_area_sqft?.toLocaleString()} {t('dashboard.sqft')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-blue-700">
                  <div>{t('dashboard.wingspan')}: {selectedAircraft.wingspan_ft} {t('dashboard.ft')}</div>
                  <div>{t('dashboard.length')}: {selectedAircraft.length_ft} {t('dashboard.ft')}</div>
                  <div>{t('serviceTypes.extWash')}: {selectedAircraft.ext_wash_hours || 0}{t('common.hrs')}</div>
                  <div>{t('serviceTypes.intDetail')}: {selectedAircraft.int_detail_hours || 0}{t('common.hrs')}</div>
                </div>
                <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-blue-600">
                  <div>{t('serviceTypes.wax')}: {selectedAircraft.wax_hours || 0}{t('common.hrs')}</div>
                  <div>{t('serviceTypes.polish')}: {selectedAircraft.polish_hours || 0}{t('common.hrs')}</div>
                  <div>{t('serviceTypes.ceramic')}: {selectedAircraft.ceramic_hours || 0}{t('common.hrs')}</div>
                  <div>{t('serviceTypes.leather')}: {selectedAircraft.leather_hours || 0}{t('common.hrs')}</div>
                </div>
              </div>
            </details>
          )}

          {/* 7. Quote Summary (bottom section) */}
          {selectedAircraft && (
            <div className="bg-[#0f172a] text-white rounded-lg p-6 mb-4 shadow-lg">
              <h3 className="text-lg font-semibold mb-3">{t('dashboard.quoteSummary')}</h3>
              <p className="mb-1 font-medium">{selectedAircraft.manufacturer} {selectedAircraft.model}</p>
              <p className="text-sm text-gray-400 mb-1">{categoryLabels[selectedAircraft.category]}</p>
              {airport && <p className="text-sm text-amber-400 mb-3">{airport}</p>}

              {/* Service line items */}
              <ul className="mb-3 space-y-1">
                {selectedServicesList.map((svc) => {
                  const hours = getHoursForService(svc);
                  const price = getServicePrice(svc);
                  return (
                    <li key={svc.id} className="flex justify-between text-sm">
                      <div>
                        <span className="text-gray-300">{svc.name}</span>
                        <span className="text-xs text-gray-500 block">{hours.toFixed(1)}{t('common.hrs')} x {currencySymbol()}{svc.hourly_rate}{t('common.perHour')}</span>
                      </div>
                      <span>{currencySymbol()}{formatPriceWhole(price)}</span>
                    </li>
                  );
                })}
              </ul>

              {/* Package discount */}
              {selectedPackage && discountPercent > 0 && (
                <div className="flex justify-between text-sm text-green-400 mb-1">
                  <span>{selectedPackage.name} ({discountPercent}% off)</span>
                  <span>-{currencySymbol()}{formatPriceWhole(discountAmount)}</span>
                </div>
              )}
              {selectedPackage && discountPercent === 0 && (
                <div className="text-xs text-gray-500 mb-1">
                  Package: {selectedPackage.name}
                </div>
              )}

              <div className="border-t border-gray-600 pt-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{t('dashboard.estHours')}</span>
                  <span>{totalHours.toFixed(1)}{t('common.hrs')}</span>
                </div>
                {accessDifficulty !== 1.0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{t('dashboard.difficultyMultiplier')}</span>
                    <span>{accessDifficulty.toFixed(2)}x</span>
                  </div>
                )}

                {/* Subtotal before addons */}
                {addonsTotal > 0 && (
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>{t('common.subtotal')}</span>
                    <span>{currencySymbol()}{formatPriceWhole(afterDifficulty)}</span>
                  </div>
                )}

                {/* Addon fee lines */}
                {addonFeeItems.map((a) => (
                  <div key={a.id} className="flex justify-between text-sm text-orange-400">
                    <span>{a.name} {a.fee_type === 'percent' ? `(${a.amount}%)` : ''}</span>
                    <span>+{currencySymbol()}{formatPriceWhole(a.calculated)}</span>
                  </div>
                ))}

                {/* Minimum fee adjustment */}
                {isMinimumApplied && (
                  <>
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Subtotal</span>
                      <span>{currencySymbol()}{formatPrice(calculatedPrice)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-amber-400">
                      <span>Minimum adjustment</span>
                      <span>+{currencySymbol()}{formatPrice(minimumFee - calculatedPrice)}</span>
                    </div>
                  </>
                )}

                {/* Minimum check indicator */}
                {minimumFee > 0 && !isMinimumApplied && calculatedPrice >= minimumFee && (
                  <div className="text-xs text-green-400">
                    Minimum ({currencySymbol()}{minimumFee}): &#10003; Met
                  </div>
                )}

                <div className="flex justify-between text-xl font-bold pt-1">
                  <span>{t('common.total')}</span>
                  <span>{currencySymbol()}{formatPrice(totalPrice)}</span>
                </div>

                {/* Profit preview (internal only) */}
                {estimatedProductCost > 0 && totalPrice > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-600/50 space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{t('dashboard.productCost')}</span>
                      <span>-{currencySymbol()}{formatPrice(estimatedProductCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-green-400">
                      <span>{t('dashboard.estProfit')}</span>
                      <span>{currencySymbol()}{formatPrice(estimatedProfit)}
                        <span className="text-xs font-normal ml-1">({totalPrice > 0 ? ((estimatedProfit / totalPrice) * 100).toFixed(0) : 0}%)</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Product usage estimates */}
                {productEstimates.length > 0 ? (
                  <div className="mt-2 pt-2 border-t border-gray-600/50">
                    <p className="text-xs text-gray-400 mb-1">{t('dashboard.estimatedProducts')}</p>
                    <div className="space-y-0.5">
                      {productEstimates.map(e => (
                        <div key={e.product_name} className="flex justify-between text-xs">
                          <span className="text-gray-300">{e.product_name}</span>
                          <span className="text-amber-400">{e.amount}{e.unit}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedAircraft.manufacturer} {selectedAircraft.model}
                      {selectedAircraft.surface_area_sqft ? ` (~${Number(selectedAircraft.surface_area_sqft).toLocaleString()} sqft)` : ''}
                    </p>
                  </div>
                ) : selectedServicesList.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-600/50">
                    <p className="text-xs text-gray-500">{t('dashboard.noProductsAssigned')}</p>
                  </div>
                )}

                {/* Auto-populated Products Needed from service links */}
                {(() => {
                  const selectedIds = selectedServicesList.map(s => s.id);
                  const neededProducts = serviceProductLinks.filter(l => selectedIds.includes(l.service_id));
                  if (neededProducts.length === 0) return null;
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-600/50">
                      <p className="text-xs text-blue-400 font-medium mb-1">Products Needed</p>
                      <div className="space-y-0.5">
                        {neededProducts.map(link => {
                          const svc = selectedServicesList.find(s => s.id === link.service_id);
                          const hours = svc ? getHoursForService(svc) : 0;
                          const qty = link.fixed_quantity > 0 ? link.fixed_quantity : (link.quantity_per_hour || 0) * hours;
                          return (
                            <div key={link.id} className="flex justify-between text-xs">
                              <span className="text-gray-300 truncate">{link.products?.name}</span>
                              <span className="text-blue-300 ml-2">{qty > 0 ? qty.toFixed(1) : '-'} {link.products?.unit}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Auto-populated Equipment Needed from service links */}
                {(() => {
                  const selectedIds = selectedServicesList.map(s => s.id);
                  const neededEquip = serviceEquipmentLinks.filter(l => selectedIds.includes(l.service_id));
                  if (neededEquip.length === 0) return null;
                  const unique = [];
                  const seen = new Set();
                  for (const link of neededEquip) {
                    if (!seen.has(link.equipment_id)) {
                      seen.add(link.equipment_id);
                      unique.push(link);
                    }
                  }
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-600/50">
                      <p className="text-xs text-purple-400 font-medium mb-1">Equipment Needed</p>
                      <div className="space-y-0.5">
                        {unique.map(link => (
                          <div key={link.id} className="text-xs text-gray-300">
                            {link.equipment?.name}{link.equipment?.brand ? ` (${link.equipment.brand})` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <button
                type="button"
                onClick={openSendModal}
                disabled={totalPrice === 0 || !airport || airport.length < 3}
                className="w-full mt-4 px-4 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {!airport || airport.length < 3 ? t('dashboard.enterAirport') : t('dashboard.sendToClient')}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedAircraft(null);
                  setSelectedServices({});
                  setSelectedPackage(null);
                  setSelectedAddons({});
                  setAccessDifficulty(1.0);
                  setQuoteNotes('');
                  setJobLocation('');
                  setAirport('');
                  setModelSearch('');
                }}
                className="w-full mt-2 px-4 py-3 rounded-lg border border-gray-500 text-gray-300 hover:bg-gray-800 text-sm min-h-[44px]"
              >
                {t('dashboard.startNewQuote')}
              </button>
            </div>
          )}
      </div>

      {/* Sticky footer bar - always visible when building a quote */}
      {selectedAircraft && selectedServicesList.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 z-50 shadow-2xl">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-white font-medium text-sm truncate">{selectedAircraft.manufacturer} {selectedAircraft.model}</p>
              <p className="text-gray-400 text-xs">{selectedServicesList.length} service{selectedServicesList.length !== 1 ? 's' : ''} &#183; {totalHours.toFixed(1)}{t('common.hrs')}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-white text-xl sm:text-2xl font-bold">{currencySymbol()}{formatPrice(totalPrice)}</span>
              <button
                type="button"
                onClick={openSendModal}
                disabled={totalPrice === 0 || !airport || airport.length < 3}
                className="px-4 sm:px-6 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base min-h-[44px] whitespace-nowrap"
              >
                {!airport || airport.length < 3 ? t('dashboard.enterAirport') : t('dashboard.sendToClient')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && quoteData && (
        <SendQuoteModal
          isOpen={isModalOpen}
          onClose={closeSendModal}
          onSuccess={resetQuoteForm}
          quote={{
            aircraft: quoteData.aircraft,
            selectedServices: quoteData.selectedServices,
            selectedPackage: quoteData.selectedPackage,
            totalHours: totalHours,
            totalPrice: totalPrice,
            calculatedPrice: calculatedPrice,
            isMinimumApplied: isMinimumApplied,
            minimumFee: isMinimumApplied ? minimumFee : null,
            jobLocation: jobLocation,
            lineItems: lineItems,
            laborTotal: laborTotal,
            productsTotal: productsTotal,
            accessDifficulty: accessDifficulty,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            addonFees: addonFeeItems,
            addonsTotal: addonsTotal,
            notes: quoteNotes,
            airport: airport,
            productEstimates: quoteData.productEstimates,
          }}
          user={user}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          BUSINESS OVERVIEW - Analytics Dashboard
          "How is my business doing?"
          ═══════════════════════════════════════════════════════════ */}
      <div className="mt-6 space-y-4">

        {/* ── TOP: Key Business Metrics ── */}
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
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg text-sm font-semibold hover:opacity-90 shadow min-h-[44px]"
          >
            <span>+</span> {t('quickActions.newQuote')}
          </button>
          <a href="/customers" className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128100;</span> {t('dashboard.addCustomer')}
          </a>
          <a href="/calendar" className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128197;</span> {t('dashboard.viewCalendar')}
          </a>
          <a href="/quotes" className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128196;</span> {t('dashboard.allQuotes')}
          </a>
        </div>

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
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
