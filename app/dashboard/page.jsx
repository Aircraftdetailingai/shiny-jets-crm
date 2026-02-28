"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NotificationBell from '../../components/NotificationBell.jsx';
import GlobalSearch from '../../components/GlobalSearch.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import { useToast } from '../../components/Toast.jsx';
import AddCustomerModal from '../../components/AddCustomerModal.jsx';
import { formatPriceWhole, currencySymbol } from '../../lib/formatPrice';
import DashboardTour from '../../components/DashboardTour.jsx';
import DashboardLanguageSelector from '../../components/DashboardLanguageSelector.jsx';


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

// Expiring Quotes Widget
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
                    className="px-3 py-2 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 font-medium min-h-[36px]"
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
                    className="px-3 py-2 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 font-medium min-h-[36px]"
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

function DashboardContent() {
  const router = useRouter();
  const { success: toastSuccess } = useToast();
  const [user, setUser] = useState(null);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [availableServices, setAvailableServices] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stripeStatus, setStripeStatus] = useState({ connected: false, status: 'CHECKING' });
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quickStats, setQuickStats] = useState(null);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [upcomingJobs, setUpcomingJobs] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    let parsedUser;
    try { parsedUser = JSON.parse(stored); } catch { localStorage.removeItem('vector_user'); router.push('/login'); return; }
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
      const [stripeRes, servicesRes, statsRes, quotesRes, upcomingRes] = await Promise.allSettled([
        fetch('/api/stripe/status', { headers }),
        fetch('/api/services', { headers }),
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/quotes?limit=5&sort=created_at&order=desc', { headers }),
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

  const handleLogout = () => {
    localStorage.removeItem('vector_token');
    localStorage.removeItem('vector_user');
    router.push('/login');
  };

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <div className="page-transition min-h-screen overflow-y-auto bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 pb-40 text-gray-900">
      <DashboardTour />
      {/* Header */}
      <header className="sticky top-0 z-40 -mx-4 -mt-4 px-4 pt-4 pb-3 mb-1 bg-gradient-to-b from-[#0f172a] via-[#0f172a] to-transparent flex justify-between items-center text-white">
        <div className="flex items-center space-x-2 text-xl sm:text-2xl font-bold">
          <span>&#9992;</span>
          <span>Vector</span>
          {user && <span className="text-sm sm:text-lg font-medium hidden sm:inline">- {user.company}</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <DashboardLanguageSelector />
          <GlobalSearch />
          <NotificationBell />
          {/* Desktop nav links */}
          <div className="hidden md:flex items-center space-x-4">
            <a href="/quotes" className="underline">Quotes</a>
            <a href="/calendar" className="underline" data-tour="nav-calendar">Calendar</a>
            <a href="/customers" className="underline">Customers</a>
            <a href="/team" className="underline">Team</a>
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
                  { href: '/customers', label: 'Customers' },
                  { href: '/team', label: 'Team' },
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
            Add services to get started
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
            <h2 className="text-lg font-bold text-white">Business Overview</h2>
            <a href="/analytics" className="text-sm text-amber-400 hover:underline">View Full Analytics</a>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">{currencySymbol()}{(quickStats?.monthRevenue || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">This Month</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">Conversion Rate</p>
              <p className="text-2xl font-bold text-emerald-600">
                {quickStats?.allTime ? (
                  (quickStats.allTime.quotes || 0) > 0
                    ? `${Math.round(((quickStats.allTime.booked || 0) / quickStats.allTime.quotes) * 100)}%`
                    : '0%'
                ) : '--'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {quickStats?.allTime ? `${quickStats.allTime.booked || 0} Booked / ${quickStats.allTime.quotes || 0} sent` : ''}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">Outstanding</p>
              <p className="text-2xl font-bold text-red-500">{quickStats?.outstandingInvoices || 0}</p>
              <p className="text-xs text-gray-400 mt-1">{currencySymbol()}{(quickStats?.outstandingTotal || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">Avg Job Value</p>
              <p className="text-2xl font-bold text-blue-600">{currencySymbol()}{formatPriceWhole(quickStats?.avgJobValue)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs uppercase tracking-wide">Jobs Completed</p>
              <p className="text-2xl font-bold text-emerald-600">{quickStats?.monthJobs || 0}</p>
              <p className="text-xs text-gray-400 mt-1">This Month</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <a
            href="/quotes/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg text-sm font-semibold hover:opacity-90 shadow min-h-[44px]"
          >
            <span>+</span> New Quote
          </a>
          <button onClick={() => setShowAddCustomerModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128100;</span> Add Customer
          </button>
          <a href="/calendar" className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128197;</span> View Calendar
          </a>
          <a href="/quotes" className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow border border-gray-200 min-h-[44px]">
            <span>&#128196;</span> All Quotes
          </a>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          RECENT QUOTES & UPCOMING JOBS
          ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-4">

        {/* Expiring Quotes alerts */}
        <ExpiringQuotesWidget expiring={quickStats?.expiringQuotes} expired={quickStats?.recentlyExpired} />

        {/* Recent Quotes + Upcoming Jobs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Compact Recent Quotes */}
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-gray-700">Recent Quotes</h3>
              <a href="/quotes" className="text-xs text-amber-600 hover:underline">View All</a>
            </div>
            {recentQuotes.length > 0 ? (
              <div className="space-y-1.5">
                {recentQuotes.slice(0, 5).map((q) => {
                  const sc = { sent: 'text-blue-600', viewed: 'text-purple-600', accepted: 'text-green-600', completed: 'text-emerald-600', paid: 'text-green-600', declined: 'text-red-500', expired: 'text-gray-400' };
                  return (
                    <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between py-1.5 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{q.aircraft_name || q.aircraft_model || 'Unknown Aircraft'}</p>
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
              <p className="text-sm text-gray-400 text-center py-4">No quotes yet. Create your first quote below.</p>
            )}
          </div>

          {/* Upcoming Jobs (Next 7 Days) */}
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm text-gray-700">Upcoming Jobs <span className="text-xs text-gray-400 font-normal">(Next 7 Days)</span></h3>
              <a href="/calendar" className="text-xs text-amber-600 hover:underline">View Calendar</a>
            </div>
            {upcomingJobs.length > 0 ? (
              <div className="space-y-1.5">
                {upcomingJobs.map((job) => {
                  const d = new Date(job.scheduled_date);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <div key={job.id} className="flex items-center justify-between py-1.5 px-1 -mx-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{job.aircraft_name || job.aircraft_model || 'Unknown Aircraft'}</p>
                        <p className="text-xs text-gray-400 truncate">{job.customer_name || job.client_name || ''}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-xs font-medium ${isToday ? 'text-amber-600' : 'text-gray-600'}`}>
                          {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-sm font-bold text-gray-900">{currencySymbol()}{formatPriceWhole(job.total_price)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No upcoming jobs scheduled</p>
            )}
          </div>
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
