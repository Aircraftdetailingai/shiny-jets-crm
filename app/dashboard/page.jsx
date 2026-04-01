"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import { useToast } from '../../components/Toast.jsx';
import AddCustomerModal from '../../components/AddCustomerModal.jsx';
import { formatPriceWhole, currencySymbol } from '../../lib/formatPrice';
import TermsConsentModal from '../../components/TermsConsentModal.jsx';
import OnboardingChecklist from '../../components/OnboardingChecklist.jsx';
import BiometricPrompt from '../../components/BiometricPrompt.jsx';
import { TERMS_VERSION } from '../../lib/terms';



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
      if (res.ok) window.location.reload();
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
    <div className="space-y-0">
      {expiring.length > 0 && expiring.map((q) => (
        <div key={q.id} className="flex items-center justify-between h-14 border-b border-v-border-subtle">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-v-gold flex-shrink-0" />
            <span className="text-sm text-v-text-primary truncate">{q.client_name || 'Customer'}</span>
            <span className="text-xs text-v-text-secondary hidden sm:inline">{q.aircraft_model || ''}</span>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-xs text-v-gold font-data">{formatExpiry(q.valid_until)}</span>
            <span className="text-sm text-v-text-primary font-data">{currencySymbol()}{(q.total_price || 0).toLocaleString()}</span>
            <button
              onClick={() => handleExtend(q.id)}
              disabled={extending === q.id}
              className="text-xs text-v-text-secondary hover:text-v-gold transition-colors uppercase tracking-wider"
            >
              {extending === q.id ? '...' : '+7d'}
            </button>
          </div>
        </div>
      ))}
      {expired.length > 0 && expired.slice(0, 3).map((q) => (
        <div key={q.id} className="flex items-center justify-between h-14 border-b border-v-border-subtle">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-v-danger flex-shrink-0" />
            <span className="text-sm text-v-text-primary truncate">{q.client_name || 'Customer'}</span>
            <span className="text-xs text-v-text-secondary line-through hidden sm:inline">expired</span>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-xs text-v-danger font-data">{formatExpiry(q.valid_until)}</span>
            <button
              onClick={() => handleExtend(q.id)}
              disabled={extending === q.id}
              className="text-xs text-v-text-secondary hover:text-v-gold transition-colors uppercase tracking-wider"
            >
              {extending === q.id ? '...' : 'Reactivate'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { success: toastSuccess } = useToast();
  const [user, setUser] = useState(null);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [availableServices, setAvailableServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quickStats, setQuickStats] = useState(null);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [upcomingJobs, setUpcomingJobs] = useState([]);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) { router.push('/login'); return; }
    let parsedUser;
    try { parsedUser = JSON.parse(stored); } catch { localStorage.removeItem('vector_user'); router.push('/login'); return; }
    setUser(parsedUser);
    setLoading(false);
    const refreshUser = async () => {
      try {
        const res = await fetch('/api/user/me', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('vector_user', JSON.stringify(data.user));
            // Only show terms modal if server explicitly says version doesn't match
            // and user hasn't already accepted in this session
            const serverVersion = data.user.terms_accepted_version;
            const alreadyAccepted = localStorage.getItem('terms_accepted_session');
            if (serverVersion !== TERMS_VERSION && !alreadyAccepted) {
              setShowTermsModal(true);
            }
          }
        }
      } catch (e) {}
    };
    refreshUser();

    const checkOnboarding = async () => {
      try {
        const res = await fetch('/api/onboarding', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.onboarding_complete === false) { router.push('/onboarding'); return true; }
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

      const [servicesRes, statsRes, quotesRes, upcomingRes, forecastRes, requestsRes] = await Promise.allSettled([
        fetch('/api/services', { headers }),
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/quotes?limit=5&sort=created_at&order=desc', { headers }),
        fetch('/api/quotes?status=paid,scheduled,in_progress&has_date=true&limit=10&sort=scheduled_date&order=asc', { headers }),
        fetch('/api/inventory/forecast?days=14', { headers }),
        fetch('/api/lead-intake/leads?status=new', { headers }),
      ]);

      if (servicesRes.status === 'fulfilled' && servicesRes.value.ok) {
        setAvailableServices((await servicesRes.value.json()).services || []);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        setQuickStats(await statsRes.value.json());
      }
      if (quotesRes.status === 'fulfilled' && quotesRes.value.ok) {
        setRecentQuotes((await quotesRes.value.json()).quotes || []);
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
      if (forecastRes.status === 'fulfilled' && forecastRes.value.ok) {
        const data = await forecastRes.value.json();
        setInventoryAlerts(data.alerts || []);
      }
      if (requestsRes.status === 'fulfilled' && requestsRes.value.ok) {
        const data = await requestsRes.value.json();
        setQuoteRequests(data.leads || []);
      }
    };

    checkOnboarding().then(redirected => {
      if (!redirected) fetchDashboardData().catch(err => console.error('Dashboard fetch error:', err));
    });
  }, [router]);

  if (loading) return <LoadingSpinner message="Loading..." />;

  const STATUS_COLORS = {
    sent: 'text-v-gold',
    viewed: 'text-purple-400',
    accepted: 'text-v-success',
    completed: 'text-v-success',
    paid: 'text-v-success',
    declined: 'text-v-danger',
    expired: 'text-v-text-secondary',
  };

  const conversionRate = quickStats?.allTime && (quickStats.allTime.quotes || 0) > 0
    ? `${Math.round(((quickStats.allTime.booked || 0) / quickStats.allTime.quotes) * 100)}%`
    : '--';

  return (
    <AppShell title="Dashboard">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[1200px]">
        {/* Page Title */}
        <h1 className="font-heading text-[2rem] font-light text-v-text-primary mb-10" style={{ letterSpacing: '0.15em' }}>
          DASHBOARD
        </h1>

        {/* Services Setup */}
        {user && availableServices.length === 0 && (
          <div className="flex items-center justify-between py-5 border-b border-v-border-subtle">
            <div>
              <p className="text-sm text-v-text-primary">Set up your service menu</p>
              <p className="text-xs text-v-text-secondary mt-0.5">Add services to start building quotes.</p>
            </div>
            <a
              href="/settings/services"
              className="px-5 py-2 text-xs uppercase tracking-widest text-v-charcoal bg-v-gold hover:bg-v-gold-dim transition-colors"
            >
              Get Started
            </a>
          </div>
        )}

        {/* KPI Section */}
        <div className="mt-10">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-10 gap-y-8">
            {[
              { label: 'Revenue', value: `${currencySymbol()}${(quickStats?.monthRevenue || 0).toLocaleString()}`, sub: 'This Month' },
              { label: 'Conversion', value: conversionRate, sub: quickStats?.allTime ? `${quickStats.allTime.booked || 0} of ${quickStats.allTime.quotes || 0}` : '' },
              { label: 'Outstanding', value: `${quickStats?.outstandingInvoices || 0}`, sub: `${currencySymbol()}${(quickStats?.outstandingTotal || 0).toLocaleString()}`, danger: true },
              { label: 'Avg Job', value: `${currencySymbol()}${formatPriceWhole(quickStats?.avgJobValue)}` },
              { label: 'Completed', value: `${quickStats?.monthJobs || 0}`, sub: 'This Month' },
            ].map((kpi) => (
              <div key={kpi.label} className="min-w-0">
                <p className={`text-2xl sm:text-[2.5rem] leading-none font-extralight font-data tracking-wide ${kpi.danger ? 'text-v-danger' : 'text-v-gold'}`}>
                  {kpi.value}
                </p>
                <div className="w-full h-px bg-v-gold/40 mt-3 mb-2" />
                <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">{kpi.label}</p>
                {kpi.sub && <p className="text-[10px] text-v-text-secondary/60 font-data mt-0.5">{kpi.sub}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mt-10">
          <a
            href="/quotes/new"
            className="px-6 py-2.5 text-xs uppercase tracking-widest text-v-charcoal bg-v-gold hover:bg-v-gold-dim transition-colors"
          >
            New Quote
          </a>
          <button
            onClick={() => setShowAddCustomerModal(true)}
            className="px-6 py-2.5 text-xs uppercase tracking-widest text-v-text-secondary border border-v-border-subtle hover:border-v-gold/40 hover:text-v-text-primary transition-colors"
          >
            Add Customer
          </button>
        </div>

        {/* Section Divider */}
        <div className="mt-12 mb-8 border-t border-v-border-subtle" />

        {/* Expiring Quotes */}
        {(quickStats?.expiringQuotes?.length > 0 || quickStats?.recentlyExpired?.length > 0) && (
          <>
            <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary mb-4">Attention Required</p>
            <ExpiringQuotesWidget expiring={quickStats?.expiringQuotes} expired={quickStats?.recentlyExpired} />
            <div className="mt-8 mb-8 border-t border-v-border-subtle" />
          </>
        )}

        {/* Inventory Reorder Alerts */}
        {inventoryAlerts.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">Inventory Alerts</p>
              <a href="/calendar" className="text-[10px] uppercase tracking-[0.15em] text-v-gold hover:text-v-gold-dim transition-colors">View Forecast</a>
            </div>
            <div className="space-y-0">
              {inventoryAlerts.slice(0, 5).map((alert) => (
                <div key={alert.product_id} className="flex items-center justify-between h-14 border-b border-v-border-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${alert.status === 'out_of_stock' ? 'bg-v-danger' : 'bg-v-gold'}`} />
                    <div className="min-w-0">
                      <span className="text-sm text-v-text-primary truncate block">{alert.product_name}</span>
                      {alert.first_job_client && (
                        <span className="text-[10px] text-v-text-secondary/60">
                          Needed for {alert.first_job_client} {alert.first_job_date ? `on ${new Date(alert.first_job_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className={`text-xs font-data ${alert.status === 'out_of_stock' ? 'text-v-danger' : 'text-v-gold'}`}>
                      {alert.status === 'out_of_stock' ? 'OUT OF STOCK' : `ORDER ${alert.deficit}${alert.unit}`}
                    </span>
                    {alert.product_url && (
                      <a href={alert.product_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-v-gold hover:text-v-gold-dim uppercase tracking-wider">
                        Buy
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 mb-8 border-t border-v-border-subtle" />
          </>
        )}

        {/* New Quote Requests */}
        {quoteRequests.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-3 mb-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">New Quote Requests</p>
              <span className="bg-v-gold text-v-charcoal text-[10px] font-bold px-2 py-0.5 rounded-full">{quoteRequests.length}</span>
            </div>
            <div className="space-y-2">
              {quoteRequests.map((req) => (
                <div key={req.id} className="bg-white/[0.02] border border-v-border-subtle rounded-lg px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{req.name || req.customer_name || 'Customer'}</p>
                    <p className="text-v-text-secondary text-xs truncate">
                      {req.aircraft_model || 'Aircraft'}{req.airport ? ` \u00B7 ${req.airport}` : ''}{req.services_requested ? ` \u00B7 ${req.services_requested}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className="text-v-text-secondary text-[10px]">{req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}</span>
                    <a href={`/quotes/new?lead=${req.id}&name=${encodeURIComponent(req.name || '')}&email=${encodeURIComponent(req.email || '')}&aircraft=${encodeURIComponent(req.aircraft_model || '')}&tail=${encodeURIComponent(req.tail_number || '')}&airport=${encodeURIComponent(req.airport || '')}`}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-v-gold border border-v-gold/30 hover:bg-v-gold/5 transition-colors rounded">
                      Quote
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Quotes & Upcoming Jobs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Recent Quotes */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">Recent Quotes</p>
              <a href="/quotes" className="text-[10px] uppercase tracking-[0.15em] text-v-gold hover:text-v-gold-dim transition-colors">View All</a>
            </div>
            {recentQuotes.length > 0 ? (
              <div>
                {recentQuotes.slice(0, 5).map((q) => (
                  <a
                    key={q.id}
                    href={q.share_link ? `/q/${q.share_link}` : `/quotes`}
                    className="flex items-center justify-between h-14 border-b border-v-border-subtle hover:bg-white/[0.02] transition-colors -mx-2 px-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-v-text-primary truncate">{q.aircraft_name || q.aircraft_model || 'Unknown Aircraft'}</p>
                      <p className="text-xs text-v-text-secondary/60 truncate">{q.customer_name || q.customer_email || ''}</p>
                    </div>
                    <div className="flex items-center gap-4 ml-3 flex-shrink-0">
                      <span className={`text-[10px] uppercase tracking-wider ${STATUS_COLORS[q.status] || 'text-v-text-secondary'}`}>{q.status}</span>
                      <span className="text-sm text-v-text-primary font-data min-w-[60px] text-right">{currencySymbol()}{formatPriceWhole(q.total_price)}</span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-v-text-secondary/60 py-8">No quotes yet</p>
            )}
          </div>

          {/* Upcoming Jobs */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">Upcoming Jobs</p>
              <a href="/calendar" className="text-[10px] uppercase tracking-[0.15em] text-v-gold hover:text-v-gold-dim transition-colors">Calendar</a>
            </div>
            {upcomingJobs.length > 0 ? (
              <div>
                {upcomingJobs.map((job) => {
                  const d = new Date(job.scheduled_date);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={job.id}
                      className="flex items-center justify-between h-14 border-b border-v-border-subtle hover:bg-white/[0.02] transition-colors -mx-2 px-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-v-text-primary truncate">{job.aircraft_name || job.aircraft_model || 'Unknown Aircraft'}</p>
                        <p className="text-xs text-v-text-secondary/60 truncate">{job.customer_name || job.client_name || ''}</p>
                      </div>
                      <div className="flex items-center gap-4 ml-3 flex-shrink-0">
                        <span className={`text-[10px] uppercase tracking-wider ${isToday ? 'text-v-gold' : 'text-v-text-secondary'}`}>
                          {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {['in_progress', 'completed', 'scheduled'].includes(job.status) && (
                          <a href={`/jobs/${job.id}/log-products`} className="text-[10px] text-v-text-secondary hover:text-v-gold uppercase tracking-wider transition-colors">
                            Log
                          </a>
                        )}
                        <span className="text-sm text-v-text-primary font-data min-w-[60px] text-right">{currencySymbol()}{formatPriceWhole(job.total_price)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-v-text-secondary/60 py-8">No upcoming jobs</p>
            )}
          </div>
        </div>

        {/* Terms Modal */}
        <TermsConsentModal
          isOpen={showTermsModal}
          onAccept={() => {
            setShowTermsModal(false);
            setUser(prev => ({ ...prev, terms_accepted_version: TERMS_VERSION }));
          }}
        />

        {/* Onboarding */}
        {user && !showTermsModal && <OnboardingChecklist user={user} />}

        {/* Biometric Login Prompt */}
        {user && !showTermsModal && <BiometricPrompt />}

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
    </AppShell>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
