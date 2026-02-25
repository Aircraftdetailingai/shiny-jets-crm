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

const categoryLabels = {
  piston: 'Pistons',
  turboprop: 'Turboprops',
  light_jet: 'Light Jets',
  midsize_jet: 'Midsize Jets',
  super_midsize_jet: 'Super Midsize',
  large_jet: 'Large Jets',
  helicopter: 'Helicopters',
};

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
  const isDisconnected = status === 'INCOMPLETE' || status === 'PENDING';
  const bgColor = isDisconnected ? 'bg-red-50 border-red-300' : 'bg-amber-100 border-amber-300';
  const iconColor = isDisconnected ? 'text-red-600' : 'text-amber-600';
  const titleColor = isDisconnected ? 'text-red-800' : 'text-amber-800';
  const msgColor = isDisconnected ? 'text-red-700' : 'text-amber-700';
  const title = isDisconnected ? 'Stripe disconnected - payments disabled' : 'Stripe not connected';
  const msg = isDisconnected
    ? 'Online payments are currently disabled. Quotes can still be sent but customers cannot pay online.'
    : 'You cannot receive payments until you connect Stripe.';
  const btnLabel = isDisconnected ? 'Reconnect Stripe' : 'Connect Stripe';

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
          {loading ? 'Connecting...' : btnLabel}
        </button>
      </div>
    </div>
  );
}

// Free Tier Usage Bar Component
function FreeUsageBar({ user }) {
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
        <h3 className="font-semibold text-gray-900 text-sm">Free Plan Usage</h3>
        <span className="text-xs text-gray-500">{used} of {limit} quotes used</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
        <div className={`${barColor} h-3 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 100 ? (
        <div className="flex justify-between items-center">
          <p className="text-red-600 text-xs font-medium">Quote limit reached this month</p>
          <a href="/settings?tab=billing" className="text-xs text-amber-600 font-semibold hover:underline">Upgrade for Unlimited</a>
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <p className="text-gray-500 text-xs">{limit - used} quote{limit - used !== 1 ? 's' : ''} remaining this month</p>
          <a href="/settings?tab=billing" className="text-xs text-amber-600 hover:underline">Upgrade for Unlimited</a>
        </div>
      )}
    </div>
  );
}

// Low Stock Alert Component
function LowStockAlert() {
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
            <p className="text-red-800 text-sm font-semibold">Low Stock ({lowStock.length})</p>
            {productCount > 0 && totalValue > 0 && (
              <p className="text-xs text-gray-500">Inventory: {currencySymbol()}{totalValue.toLocaleString()} across {productCount} products</p>
            )}
          </div>
        </div>
        <a href="/products" className="text-xs text-red-700 font-medium hover:underline whitespace-nowrap">View All</a>
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
                Reorder
              </a>
            ) : (
              <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full flex-shrink-0">Low</span>
            )}
          </div>
        ))}
      </div>
      {lowStock.length > 5 && (
        <div className="px-4 py-2 bg-gray-50 border-t text-center">
          <a href="/products" className="text-xs text-amber-600 font-medium hover:underline">
            +{lowStock.length - 5} more low stock items
          </a>
        </div>
      )}
    </div>
  );
}

// Quick Stats Bar Component (inline, fast loading)
function ExpiringQuotesWidget({ expiring = [], expired = [] }) {
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
      return daysAgo === 0 ? 'Today' : `${daysAgo}d ago`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-3">
      {/* Expiring Soon */}
      {expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-sm text-amber-900 mb-2 flex items-center gap-2">
            <span>&#9200;</span> Expiring Soon ({expiring.length})
          </h3>
          <div className="space-y-2">
            {expiring.map((q) => (
              <div key={q.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{q.client_name || 'Customer'}</p>
                  <p className="text-xs text-gray-500">{q.aircraft_model || q.aircraft_type || 'Aircraft'} &#183; {currencySymbol()}{(q.total_price || 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-600 font-medium">{formatExpiry(q.valid_until)}</span>
                  <button
                    onClick={() => handleExtend(q.id)}
                    disabled={extending === q.id}
                    className="px-2.5 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 font-medium"
                  >
                    {extending === q.id ? '...' : '+7 Days'}
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
            <span>&#128683;</span> Recently Expired ({expired.length})
          </h3>
          <div className="space-y-2">
            {expired.slice(0, 5).map((q) => (
              <div key={q.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{q.client_name || 'Customer'}</p>
                  <p className="text-xs text-gray-500">{q.aircraft_model || q.aircraft_type || 'Aircraft'} &#183; {currencySymbol()}{(q.total_price || 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">{formatExpiry(q.valid_until)}</span>
                  <button
                    onClick={() => handleExtend(q.id)}
                    disabled={extending === q.id}
                    className="px-2.5 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 font-medium"
                  >
                    {extending === q.id ? '...' : 'Reactivate'}
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

function QuickStats({ stats, onNewQuote }) {
  if (!stats) return null;

  const activityLabels = {
    completed: { text: 'Job completed', color: 'text-emerald-600', icon: '\u2713' },
    paid: { text: 'Payment received', color: 'text-green-600', icon: '$' },
    viewed: { text: 'Quote viewed', color: 'text-purple-600', icon: '\u25C9' },
    sent: { text: 'Quote sent', color: 'text-blue-600', icon: '\u2192' },
    created: { text: 'Quote created', color: 'text-gray-600', icon: '+' },
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-3 mb-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">Today&apos;s Jobs</p>
          <p className="text-xl font-bold text-blue-600">{stats.todayScheduledJobs || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">Pending Quotes</p>
          <p className="text-xl font-bold text-amber-600">{stats.pendingQuotes || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">This Week</p>
          <p className="text-xl font-bold text-gray-900">{currencySymbol()}{(stats.weekRevenue || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">This Month</p>
          <p className="text-xl font-bold text-gray-900">{currencySymbol()}{(stats.monthRevenue || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">Outstanding</p>
          <p className="text-xl font-bold text-red-500">{stats.outstandingInvoices || 0}</p>
          {stats.outstandingTotal > 0 && (
            <p className="text-xs text-gray-400">{currencySymbol()}{(stats.outstandingTotal || 0).toLocaleString()}</p>
          )}
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">Avg Job Value</p>
          <p className="text-xl font-bold text-green-600">{currencySymbol()}{formatPriceWhole(stats.avgJobValue)}</p>
        </div>
        {stats.avgRating !== null && stats.avgRating !== undefined && (
          <div className="bg-white rounded-lg p-3 shadow">
            <p className="text-gray-500 text-xs">Avg Rating</p>
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
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg text-sm font-semibold hover:opacity-90 shadow"
        >
          <span>+</span> New Quote
        </button>
        <a
          href="/customers"
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200"
        >
          <span>&#128100;</span> Add Customer
        </a>
        <a
          href="/calendar"
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200"
        >
          <span>&#128197;</span> View Calendar
        </a>
        <a
          href="/quotes"
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200"
        >
          <span>&#128196;</span> All Quotes
        </a>
      </div>

      {/* Recent Activity Feed */}
      {stats.activityFeed && stats.activityFeed.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">Recent Activity</h3>
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

// Recent Quotes Component
function RecentQuotes({ quotes, onViewQuote }) {
  if (!quotes || quotes.length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 mb-4 shadow">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Recent Quotes</h3>
          <a href="/quotes" className="text-sm text-amber-600 hover:underline">View All</a>
        </div>
        <p className="text-gray-500 text-sm">No quotes yet. Create your first quote below.</p>
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
        <h3 className="font-semibold">Recent Quotes</h3>
        <a href="/quotes" className="text-sm text-amber-600 hover:underline">View All</a>
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
                {quote.aircraft_name || 'Unknown Aircraft'}
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
                {quote.status || 'draft'}
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
  if (!recurring || recurring.length === 0) return null;

  const intervalLabels = {
    weekly: 'Weekly',
    biweekly: 'Bi-weekly',
    '4_weeks': '4 weeks',
    monthly: 'Monthly',
    '6_weeks': '6 weeks',
    quarterly: 'Quarterly',
  };

  return (
    <div className="bg-white rounded-lg p-4 mb-4 shadow">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Upcoming Recurring Services</h3>
        <a href="/recurring" className="text-sm text-amber-600 hover:underline">Manage All</a>
      </div>
      <div className="space-y-2">
        {recurring.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {item.customer_name || item.client_name || 'Customer'}
              </p>
              <p className="text-sm text-gray-500">
                {item.aircraft_model || item.aircraft_type || 'Aircraft'}
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

  // Fetch models when manufacturer or category changes
  useEffect(() => {
    const fetchModels = async () => {
      const params = new URLSearchParams();
      if (selectedManufacturer) params.set('make', selectedManufacturer);
      if (selectedCategory) params.set('category', selectedCategory);

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
  }, [selectedManufacturer, selectedCategory]);

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
      const [stripeRes, servicesRes, packagesRes, minFeeRes, tipRes, statsRes, quotesRes, addonsRes, recurringRes, productRatiosRes] = await Promise.allSettled([
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
        setStripeError('Not logged in - please refresh and try again');
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
      setStripeError(`Network error: ${err.message}`);
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
    if (minimumFeeLocations.length > 0) {
      if (!jobLocation) return false;
      const normalizedJob = jobLocation.toUpperCase().trim();
      return minimumFeeLocations.some(loc => normalizedJob.includes(loc.toUpperCase().trim()));
    }
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
      }
    : null;

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 text-gray-900">
      <DashboardTour />
      {/* Header */}
      <header className="flex justify-between items-center mb-4 text-white">
        <div className="flex items-center space-x-2 text-xl sm:text-2xl font-bold">
          <span>&#9992;</span>
          <span>Vector</span>
          {user && <span className="text-sm sm:text-lg font-medium hidden sm:inline">- {user.company}</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <GlobalSearch />
          <NotificationBell />
          <PointsBadge />
          {/* Desktop nav links */}
          <div className="hidden md:flex items-center space-x-4">
            <a href="/quotes" className="underline">Quotes</a>
            <a href="/calendar" className="underline" data-tour="nav-calendar">Calendar</a>
            <a href="/products" className="underline">Inventory</a>
            <a href="/equipment" className="underline">Equipment</a>
            <a href="/team" className="underline">Team</a>
            <a href="/recurring" className="underline">Recurring</a>
            <a href="/analytics" className="underline" data-tour="nav-analytics">Analytics</a>
            <a href="/growth" className="underline">Growth</a>
            <a href="/settings" className="underline" data-tour="nav-settings">Settings</a>
            <button onClick={handleLogout} className="underline">Logout</button>
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
                  { href: '/quotes', label: 'Quotes' },
                  { href: '/calendar', label: 'Calendar' },
                  { href: '/products', label: 'Inventory' },
                  { href: '/equipment', label: 'Equipment' },
                  { href: '/team', label: 'Team' },
                  { href: '/recurring', label: 'Recurring' },
                  { href: '/analytics', label: 'Analytics' },
                  { href: '/growth', label: 'Growth' },
                  { href: '/settings', label: 'Settings' },
                ].map(link => (
                  <a key={link.href} href={link.href} className="block px-4 py-3 hover:bg-white/10 text-sm">{link.label}</a>
                ))}
                <button onClick={handleLogout} className="block w-full text-left px-4 py-3 hover:bg-white/10 text-sm border-t border-white/10">Logout</button>
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
              <p className="text-blue-800 font-medium">Set up your service menu</p>
              <p className="text-blue-700 text-sm">Add services you offer to start building quotes.</p>
            </div>
          </div>
          <a
            href="/settings/services"
            className="px-4 py-3 rounded bg-blue-500 text-white font-medium hover:bg-blue-600 min-h-[44px] whitespace-nowrap"
          >
            Add Services
          </a>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4" data-tour="quote-builder">
        {/* Left column */}
        <div className="flex-1">
          {/* Aircraft Selection */}
          <div className="bg-white rounded-lg p-4 mb-4 shadow">
            <h3 className="font-semibold mb-3 text-lg">Select Aircraft</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Manufacturer Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                <select
                  value={selectedManufacturer}
                  onChange={(e) => setSelectedManufacturer(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="">All Manufacturers</option>
                  {manufacturers.map((mfr) => (
                    <option key={mfr} value={mfr}>{mfr}</option>
                  ))}
                </select>
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="">All Categories</option>
                  {categoryOrder.map((cat) => (
                    <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search Input */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search models..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            {/* Models Grid */}
            {(() => {
              const filteredModels = models.filter(a => !modelSearch ||
                `${a.manufacturer} ${a.model}`.toLowerCase().includes(modelSearch.toLowerCase()));
              return (
                <>
                  {models.length > 0 && (
                    <p className="text-xs text-gray-500 mb-1">
                      {filteredModels.length} of {models.length} aircraft
                    </p>
                  )}
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    {filteredModels.length === 0 ? (
                      <div className="p-4 text-gray-500 text-center">
                        {models.length === 0 ? 'Loading aircraft...' : 'No matches found'}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredModels.map((aircraft) => (
                      <div
                        key={aircraft.id}
                        onClick={() => handleSelectAircraft(aircraft)}
                        className={`p-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center ${
                          selectedAircraft?.id === aircraft.id ? 'bg-amber-50 border-l-4 border-amber-500' : ''
                        }`}
                      >
                        <div>
                          <p className="font-medium">{aircraft.manufacturer} {aircraft.model}</p>
                          <p className="text-sm text-gray-500">{categoryLabels[aircraft.category]} • {aircraft.seats} seats</p>
                        </div>
                        {selectedAircraft?.id === aircraft.id && (
                          <span className="text-amber-500">&#10003;</span>
                        )}
                      </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Aircraft Details & Surface Area */}
          {selectedAircraft && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-blue-900">{selectedAircraft.manufacturer} {selectedAircraft.model}</h4>
                  <p className="text-blue-700 text-sm">{categoryLabels[selectedAircraft.category]}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-blue-600">Surface Area</p>
                  <p className="text-2xl font-bold text-blue-900">{selectedAircraft.surface_area_sqft?.toLocaleString()} sq ft</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-blue-700">
                <div>Wingspan: {selectedAircraft.wingspan_ft} ft</div>
                <div>Length: {selectedAircraft.length_ft} ft</div>
                <div>Ext Wash: {selectedAircraft.ext_wash_hours || 0}h</div>
                <div>Int Detail: {selectedAircraft.int_detail_hours || 0}h</div>
              </div>
              <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-blue-600">
                <div>Wax: {selectedAircraft.wax_hours || 0}h</div>
                <div>Polish: {selectedAircraft.polish_hours || 0}h</div>
                <div>Ceramic: {selectedAircraft.ceramic_hours || 0}h</div>
                <div>Leather: {selectedAircraft.leather_hours || 0}h</div>
              </div>
            </div>
          )}

          {/* Airport */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold mb-2">Airport <span className="text-red-500">*</span></h3>
              <input
                type="text"
                value={airport}
                onChange={(e) => setAirport(e.target.value.toUpperCase())}
                placeholder="ICAO code (e.g., KJFK, KLAX, KSDL)"
                maxLength={6}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 uppercase font-mono tracking-wider"
              />
              {airport && airport.length < 3 && (
                <p className="text-xs text-red-500 mt-1">Enter a valid airport code</p>
              )}
            </div>
          )}

          {/* Access Difficulty Multiplier */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">Access Difficulty</h3>
                <span className="text-lg font-bold text-amber-600">{accessDifficulty.toFixed(2)}x</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Adjust for hangar access, location, or special requirements.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 1.0, label: 'Standard', desc: 'Easy hangar access' },
                  { value: 1.15, label: 'Moderate', desc: 'Limited access' },
                  { value: 1.3, label: 'Difficult', desc: 'Remote or tight space' },
                  { value: 1.5, label: 'Extreme', desc: 'Special equipment needed' },
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

          {/* Services section */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 shadow">
              <h3 className="font-semibold text-lg mb-3">Services</h3>

              {availableServices.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 mb-2">No services configured yet.</p>
                  <a href="/settings/services" className="text-amber-600 hover:underline text-sm">
                    Add services to get started
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
                            {hours.toFixed(1)}h @ {currencySymbol()}{svc.hourly_rate}/hr
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
                    <span>&#127873;</span> Or select a package
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
                                Includes: {pkgServices.map(s => s.name).join(', ') || 'No services'}
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

          {/* Add-on Fees */}
          {selectedAircraft && availableAddons.length > 0 && (
            <div className="bg-white rounded-lg p-4 mt-4 shadow">
              <h3 className="font-semibold mb-3">Add-on Fees</h3>
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

          {/* Job Location */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 mt-4 shadow">
              <h3 className="font-semibold mb-2">Job Location</h3>
              <input
                type="text"
                value={jobLocation}
                onChange={(e) => setJobLocation(e.target.value)}
                placeholder="Enter airport code or location (e.g., KJFK)"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              {minimumFee > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {minimumFeeLocations.length > 0
                    ? `Minimum fee of ${currencySymbol()}${minimumFee.toFixed(2)} applies at: ${minimumFeeLocations.join(', ')}`
                    : `Minimum call out fee: ${currencySymbol()}${minimumFee.toFixed(2)}`
                  }
                </p>
              )}
            </div>
          )}

          {/* Quote Notes */}
          {selectedAircraft && (
            <div className="bg-white rounded-lg p-4 mt-4 shadow">
              <h3 className="font-semibold mb-2">Notes</h3>
              <textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Add notes for this quote (visible to customer)..."
                rows={3}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
              />
            </div>
          )}
        </div>

        {/* Right column - Quote summary */}
        <div className="w-full lg:w-80">
          <div className="sticky top-4 bg-[#0f172a] text-white rounded-lg p-4 shadow-lg">
            <h3 className="text-lg font-semibold mb-3">Quote Summary</h3>
            {selectedAircraft ? (
              <>
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
                          <span className="text-xs text-gray-500 block">{hours.toFixed(1)}h x {currencySymbol()}{svc.hourly_rate}/hr</span>
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
                    <span>Est. Hours</span>
                    <span>{totalHours.toFixed(1)}h</span>
                  </div>
                  {accessDifficulty !== 1.0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Difficulty multiplier</span>
                      <span>{accessDifficulty.toFixed(2)}x</span>
                    </div>
                  )}

                  {/* Subtotal before addons */}
                  {addonsTotal > 0 && (
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Subtotal</span>
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

                  {/* Minimum fee */}
                  {isMinimumApplied && (
                    <>
                      <div className="flex justify-between text-sm text-gray-500 line-through">
                        <span>Calculated</span>
                        <span>{currencySymbol()}{formatPrice(calculatedPrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-amber-400">
                        <span>Minimum Fee Applied</span>
                        <span>{currencySymbol()}{formatPrice(minimumFee)}</span>
                      </div>
                    </>
                  )}

                  {/* Minimum check indicator */}
                  {minimumFee > 0 && !isMinimumApplied && calculatedPrice > 0 && (
                    <div className="text-xs text-green-400">
                      Minimum ({currencySymbol()}{minimumFee}): &#10003; Met
                    </div>
                  )}

                  <div className="flex justify-between text-xl font-bold pt-1">
                    <span>Total</span>
                    <span>{currencySymbol()}{formatPrice(totalPrice)}</span>
                  </div>

                  {/* Profit preview (internal only) */}
                  {estimatedProductCost > 0 && totalPrice > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-600/50 space-y-1">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Product Cost</span>
                        <span>-{currencySymbol()}{formatPrice(estimatedProductCost)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-green-400">
                        <span>Est. Profit</span>
                        <span>{currencySymbol()}{formatPrice(estimatedProfit)}
                          <span className="text-xs font-normal ml-1">({totalPrice > 0 ? ((estimatedProfit / totalPrice) * 100).toFixed(0) : 0}%)</span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Product usage estimates */}
                  {productEstimates.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-600/50">
                      <p className="text-xs text-gray-400 mb-1">Estimated Products</p>
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
                  )}
                </div>

                <button
                  type="button"
                  onClick={openSendModal}
                  disabled={totalPrice === 0 || !airport || airport.length < 3}
                  className="w-full mt-4 px-4 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!airport || airport.length < 3 ? 'Enter Airport to Send' : 'Send to Client'}
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
                  Start New Quote
                </button>
              </>
            ) : (
              <div className="text-gray-400 text-center py-8">
                <p>Select an aircraft to build a quote</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && quoteData && (
        <SendQuoteModal
          isOpen={isModalOpen}
          onClose={closeSendModal}
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

      {/* Dashboard info sections - below quote builder */}
      <div className="mt-6 space-y-4">
        <div data-tour="quick-stats">
          <QuickStats stats={quickStats} onNewQuote={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        </div>
        <FreeUsageBar user={user} />
        <LowStockAlert />
        <RecentQuotes quotes={recentQuotes} />
        <UpcomingRecurring recurring={upcomingRecurring} />

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

        {/* Push Notifications Banner */}
        <PushNotifications />

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <a href="/products" className="flex flex-col items-center p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white">
            <span className="text-2xl mb-1">&#128230;</span>
            <span className="text-sm font-medium">Inventory</span>
          </a>
          <a href="/equipment" className="flex flex-col items-center p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white">
            <span className="text-2xl mb-1">&#128295;</span>
            <span className="text-sm font-medium">Equipment</span>
          </a>
          <a href="/growth" className="flex flex-col items-center p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white">
            <span className="text-2xl mb-1">&#128200;</span>
            <span className="text-sm font-medium">Growth</span>
          </a>
          <a href="/settings/services" className="flex flex-col items-center p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white">
            <span className="text-2xl mb-1">&#9881;</span>
            <span className="text-sm font-medium">Services</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
