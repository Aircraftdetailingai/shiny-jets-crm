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
import PointsBadge from '../../components/PointsBadge.jsx';
import TermsConsentModal from '../../components/TermsConsentModal.jsx';
import { TERMS_VERSION } from '../../lib/terms';


// Stripe Connect Warning Banner Component
function StripeWarningBanner({ onConnect, loading, error, onClearError, status }) {
  const isDisconnected = status === 'INCOMPLETE' || status === 'PENDING';

  return (
    <div className={`bg-v-surface border ${isDisconnected ? 'border-v-danger/40' : 'border-v-gold/40'} rounded p-4 mb-4`}>
      {error && (
        <div className="mb-3 p-3 bg-v-danger/10 border border-v-danger/30 rounded text-v-danger text-sm flex justify-between items-start">
          <span>{error}</span>
          <button onClick={onClearError} className="ml-2 text-v-danger hover:text-red-400">&times;</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className={`${isDisconnected ? 'text-v-danger' : 'text-v-gold'} text-xl mr-3`}>&#9888;</span>
          <div>
            <p className="text-v-text-primary font-medium">
              {isDisconnected ? 'Stripe disconnected - payments disabled' : 'Stripe not connected'}
            </p>
            <p className="text-v-text-secondary text-sm">
              {isDisconnected
                ? 'Online payments are currently disabled. Quotes can still be sent but customers cannot pay online.'
                : 'You cannot receive payments until you connect Stripe.'}
            </p>
          </div>
        </div>
        <button
          onClick={onConnect}
          disabled={loading}
          className="px-4 py-2 rounded bg-v-gold text-v-charcoal font-medium hover:bg-v-gold-dim disabled:opacity-50"
        >
          {loading ? 'Connecting...' : isDisconnected ? 'Reconnect Stripe' : 'Connect Stripe'}
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
      {expiring.length > 0 && (
        <div className="bg-v-surface border border-v-gold/30 rounded p-4">
          <h3 className="font-medium text-sm text-v-gold mb-2 flex items-center gap-2 tracking-wide">
            <span>&#9200;</span> Expiring Soon ({expiring.length})
          </h3>
          <div className="space-y-2">
            {expiring.map((q) => (
              <div key={q.id} className="flex items-center justify-between bg-v-surface-light rounded px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-v-text-primary">{q.client_name || 'Customer'}</p>
                  <p className="text-xs text-v-text-secondary">{q.aircraft_model || q.aircraft_type || 'Aircraft'} &#183; <span className="font-data">{currencySymbol()}{(q.total_price || 0).toLocaleString()}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-v-gold font-medium font-data">{formatExpiry(q.valid_until)}</span>
                  <button
                    onClick={() => handleExtend(q.id)}
                    disabled={extending === q.id}
                    className="px-3 py-2 text-xs bg-v-gold text-v-charcoal rounded hover:bg-v-gold-dim disabled:opacity-50 font-medium min-h-[36px]"
                  >
                    {extending === q.id ? '...' : '+7 Days'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div className="bg-v-surface border border-v-danger/30 rounded p-4">
          <h3 className="font-medium text-sm text-v-danger mb-2 flex items-center gap-2 tracking-wide">
            <span>&#128683;</span> Recently Expired ({expired.length})
          </h3>
          <div className="space-y-2">
            {expired.slice(0, 5).map((q) => (
              <div key={q.id} className="flex items-center justify-between bg-v-surface-light rounded px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-v-text-primary">{q.client_name || 'Customer'}</p>
                  <p className="text-xs text-v-text-secondary">{q.aircraft_model || q.aircraft_type || 'Aircraft'} &#183; <span className="font-data">{currencySymbol()}{(q.total_price || 0).toLocaleString()}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-v-danger font-data">{formatExpiry(q.valid_until)}</span>
                  <button
                    onClick={() => handleExtend(q.id)}
                    disabled={extending === q.id}
                    className="px-3 py-2 text-xs border border-v-border text-v-text-secondary rounded hover:text-v-text-primary hover:border-v-gold disabled:opacity-50 font-medium min-h-[36px]"
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
  const [showTermsModal, setShowTermsModal] = useState(false);

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
            if (data.user.terms_accepted_version !== TERMS_VERSION) {
              setShowTermsModal(true);
            }
          }
        }
      } catch (e) {}
    };
    refreshUser();

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

    const fetchDashboardData = async () => {
      const headers = { Authorization: `Bearer ${token}` };

      fetch('/api/points/earn', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DAILY_LOGIN' }),
      }).catch(() => {});

      const [stripeRes, servicesRes, statsRes, quotesRes, upcomingRes] = await Promise.allSettled([
        fetch('/api/stripe/status', { headers }),
        fetch('/api/services', { headers }),
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/quotes?limit=5&sort=created_at&order=desc', { headers }),
        fetch('/api/quotes?status=paid,scheduled,in_progress&has_date=true&limit=10&sort=scheduled_date&order=asc', { headers }),
      ]);

      if (stripeRes.status === 'fulfilled' && stripeRes.value.ok) {
        const data = await stripeRes.value.json();
        setStripeStatus(data);
      } else {
        setStripeStatus({ connected: false, status: 'UNKNOWN' });
      }

      if (servicesRes.status === 'fulfilled' && servicesRes.value.ok) {
        const data = await servicesRes.value.json();
        setAvailableServices(data.services || []);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const data = await statsRes.value.json();
        setQuickStats(data);
      }

      if (quotesRes.status === 'fulfilled' && quotesRes.value.ok) {
        const data = await quotesRes.value.json();
        setRecentQuotes(data.quotes || []);
      }

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
        setStripeError(errorMsg);
      } else {
        setStripeError('No redirect URL received - please try again');
      }
    } catch (err) {
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

  const STATUS_COLORS = {
    sent: 'text-blue-400',
    viewed: 'text-purple-400',
    accepted: 'text-v-success',
    completed: 'text-v-success',
    paid: 'text-v-success',
    declined: 'text-v-danger',
    expired: 'text-v-text-secondary',
  };

  return (
    <div className="page-transition min-h-screen overflow-y-auto bg-v-charcoal p-4 pb-40">
      <DashboardTour />

      {/* Header */}
      <header className="sticky top-0 z-40 -mx-4 -mt-4 px-4 pt-4 pb-3 mb-1 bg-v-charcoal/95 backdrop-blur-sm border-b border-v-border/50 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <span className="text-v-gold text-xl">&#9992;</span>
          <span className="text-v-text-primary text-xl font-light tracking-wide">Vector</span>
          {user && <span className="text-v-text-secondary text-sm font-light hidden sm:inline tracking-wide">{user.company}</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <DashboardLanguageSelector />
          <GlobalSearch />
          <PointsBadge />
          <NotificationBell />
          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-4">
            {[
              { href: '/quotes', label: 'Quotes' },
              { href: '/calendar', label: 'Calendar' },
              { href: '/customers', label: 'Customers' },
              { href: '/team', label: 'Team' },
              { href: '/settings', label: 'Settings' },
            ].map(link => (
              <a key={link.href} href={link.href} className="text-v-text-secondary hover:text-v-gold transition-colors tracking-wide text-sm">{link.label}</a>
            ))}
            <button onClick={handleLogout} className="text-v-text-secondary hover:text-v-gold transition-colors tracking-wide text-sm">Logout</button>
          </div>
          {/* Mobile menu */}
          <div className="md:hidden relative">
            <button
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="p-2 rounded hover:bg-v-surface-light"
              aria-label="Menu"
            >
              <svg className="w-6 h-6 text-v-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            {mobileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-v-surface rounded border border-v-border shadow-xl py-2 z-50">
                {[
                  { href: '/quotes', label: 'Quotes' },
                  { href: '/calendar', label: 'Calendar' },
                  { href: '/customers', label: 'Customers' },
                  { href: '/team', label: 'Team' },
                  { href: '/rewards', label: 'Rewards' },
                  { href: '/settings', label: 'Settings' },
                ].map(link => (
                  <a key={link.href} href={link.href} className="block px-4 py-3 text-sm text-v-text-secondary hover:text-v-gold hover:bg-v-surface-light transition-colors">{link.label}</a>
                ))}
                <button onClick={handleLogout} className="block w-full text-left px-4 py-3 text-sm text-v-text-secondary hover:text-v-gold hover:bg-v-surface-light border-t border-v-border transition-colors">Logout</button>
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

      {/* Services Setup Prompt */}
      {user && availableServices.length === 0 && (
        <div data-tour="services-prompt" className="bg-v-surface border border-v-border rounded p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center">
            <span className="text-v-gold text-xl mr-3">&#9432;</span>
            <div>
              <p className="text-v-text-primary font-medium">Set up your service menu</p>
              <p className="text-v-text-secondary text-sm">Add services you offer to start building quotes.</p>
            </div>
          </div>
          <a
            href="/settings/services"
            className="px-4 py-3 rounded bg-v-gold text-v-charcoal font-medium hover:bg-v-gold-dim min-h-[44px] whitespace-nowrap"
          >
            Add services to get started
          </a>
        </div>
      )}

      {/* Business Overview */}
      <div className="mb-4 space-y-4">
        <div data-tour="quick-stats">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-light text-v-text-primary tracking-wide">Business Overview</h2>
            <a href="/analytics" className="text-sm text-v-gold hover:text-v-gold-dim transition-colors">View Full Analytics</a>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-v-surface border border-v-border rounded border-l-2 border-l-v-gold p-4">
              <p className="text-v-text-secondary text-xs uppercase tracking-wider">Total Revenue</p>
              <p className="text-2xl font-light text-v-gold font-data mt-1">{currencySymbol()}{(quickStats?.monthRevenue || 0).toLocaleString()}</p>
              <p className="text-xs text-v-text-secondary mt-1">This Month</p>
            </div>
            <div className="bg-v-surface border border-v-border rounded border-l-2 border-l-v-gold p-4">
              <p className="text-v-text-secondary text-xs uppercase tracking-wider">Conversion Rate</p>
              <p className="text-2xl font-light text-v-gold font-data mt-1">
                {quickStats?.allTime ? (
                  (quickStats.allTime.quotes || 0) > 0
                    ? `${Math.round(((quickStats.allTime.booked || 0) / quickStats.allTime.quotes) * 100)}%`
                    : '0%'
                ) : '--'}
              </p>
              <p className="text-xs text-v-text-secondary mt-1">
                {quickStats?.allTime ? `${quickStats.allTime.booked || 0} / ${quickStats.allTime.quotes || 0} sent` : ''}
              </p>
            </div>
            <div className="bg-v-surface border border-v-border rounded border-l-2 border-l-v-danger p-4">
              <p className="text-v-text-secondary text-xs uppercase tracking-wider">Outstanding</p>
              <p className="text-2xl font-light text-v-danger font-data mt-1">{quickStats?.outstandingInvoices || 0}</p>
              <p className="text-xs text-v-text-secondary mt-1 font-data">{currencySymbol()}{(quickStats?.outstandingTotal || 0).toLocaleString()}</p>
            </div>
            <div className="bg-v-surface border border-v-border rounded border-l-2 border-l-v-gold p-4">
              <p className="text-v-text-secondary text-xs uppercase tracking-wider">Avg Job Value</p>
              <p className="text-2xl font-light text-v-gold font-data mt-1">{currencySymbol()}{formatPriceWhole(quickStats?.avgJobValue)}</p>
            </div>
            <div className="bg-v-surface border border-v-border rounded border-l-2 border-l-v-success p-4">
              <p className="text-v-text-secondary text-xs uppercase tracking-wider">Jobs Completed</p>
              <p className="text-2xl font-light text-v-success font-data mt-1">{quickStats?.monthJobs || 0}</p>
              <p className="text-xs text-v-text-secondary mt-1">This Month</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <a
            href="/quotes/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-v-gold text-v-charcoal rounded text-sm font-medium hover:bg-v-gold-dim min-h-[44px]"
          >
            <span>+</span> New Quote
          </a>
          <button onClick={() => setShowAddCustomerModal(true)} className="flex items-center gap-1.5 px-4 py-2 border border-v-border text-v-text-secondary rounded text-sm hover:text-v-text-primary hover:border-v-gold/50 min-h-[44px] transition-colors">
            Add Customer
          </button>
          <a href="/calendar" className="flex items-center gap-1.5 px-4 py-2 border border-v-border text-v-text-secondary rounded text-sm hover:text-v-text-primary hover:border-v-gold/50 min-h-[44px] transition-colors">
            Calendar
          </a>
          <a href="/quotes" className="flex items-center gap-1.5 px-4 py-2 border border-v-border text-v-text-secondary rounded text-sm hover:text-v-text-primary hover:border-v-gold/50 min-h-[44px] transition-colors">
            All Quotes
          </a>
        </div>
      </div>

      {/* Recent Quotes & Upcoming Jobs */}
      <div className="space-y-4">
        <ExpiringQuotesWidget expiring={quickStats?.expiringQuotes} expired={quickStats?.recentlyExpired} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Quotes */}
          <div className="bg-v-surface border border-v-border rounded p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-light text-sm text-v-text-secondary tracking-wide uppercase">Recent Quotes</h3>
              <a href="/quotes" className="text-xs text-v-gold hover:text-v-gold-dim transition-colors">View All</a>
            </div>
            {recentQuotes.length > 0 ? (
              <div className="space-y-1">
                {recentQuotes.slice(0, 5).map((q) => (
                  <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between py-2 hover:bg-v-surface-light rounded px-2 -mx-2 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-v-text-primary truncate">{q.aircraft_name || q.aircraft_model || 'Unknown Aircraft'}</p>
                      <p className="text-xs text-v-text-secondary truncate">{q.customer_name || q.customer_email || ''}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-2 shrink-0">
                      <span className={`text-xs font-medium ${STATUS_COLORS[q.status] || 'text-v-text-secondary'}`}>{q.status}</span>
                      <span className="text-sm text-v-text-primary font-data">{currencySymbol()}{formatPriceWhole(q.total_price)}</span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-v-text-secondary text-center py-4">No quotes yet. Create your first quote.</p>
            )}
          </div>

          {/* Upcoming Jobs */}
          <div className="bg-v-surface border border-v-border rounded p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-light text-sm text-v-text-secondary tracking-wide uppercase">Upcoming Jobs <span className="text-xs text-v-text-secondary font-normal normal-case">(Next 7 Days)</span></h3>
              <a href="/calendar" className="text-xs text-v-gold hover:text-v-gold-dim transition-colors">View Calendar</a>
            </div>
            {upcomingJobs.length > 0 ? (
              <div className="space-y-1">
                {upcomingJobs.map((job) => {
                  const d = new Date(job.scheduled_date);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <div key={job.id} className="flex items-center justify-between py-2 px-2 -mx-2 hover:bg-v-surface-light rounded transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-v-text-primary truncate">{job.aircraft_name || job.aircraft_model || 'Unknown Aircraft'}</p>
                        <p className="text-xs text-v-text-secondary truncate">{job.customer_name || job.client_name || ''}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-xs font-medium ${isToday ? 'text-v-gold' : 'text-v-text-secondary'}`}>
                          {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-sm text-v-text-primary font-data">{currencySymbol()}{formatPriceWhole(job.total_price)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-v-text-secondary text-center py-4">No upcoming jobs scheduled</p>
            )}
          </div>
        </div>
      </div>

      {/* Terms Consent Modal */}
      <TermsConsentModal
        isOpen={showTermsModal}
        onAccept={() => {
          setShowTermsModal(false);
          setUser(prev => ({ ...prev, terms_accepted_version: TERMS_VERSION }));
        }}
      />

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={showAddCustomerModal}
        onClose={() => setShowAddCustomerModal(false)}
        onSuccess={(data) => {
          toastSuccess(data?.created ? 'Customer added!' : 'Customer saved!');
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
