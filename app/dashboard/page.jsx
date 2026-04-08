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
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [followUps, setFollowUps] = useState({ needsReview: [], recentCompleted: [], recurring: [] });
  const [pendingQuotes, setPendingQuotes] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [changeOrderRequests, setChangeOrderRequests] = useState([]);
  const [quota, setQuota] = useState(null);

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

      const [servicesRes, statsRes, quotesRes, upcomingRes, requestsRes, followUpsRes, staleRes, quotaRes, teamRes, corRes] = await Promise.allSettled([
        fetch('/api/services', { headers }),
        fetch('/api/dashboard/stats', { headers }),
        fetch('/api/quotes?limit=5&sort=created_at&order=desc', { headers }),
        fetch('/api/quotes?status=paid,scheduled,in_progress&has_date=true&limit=10&sort=scheduled_date&order=asc', { headers }),
        fetch('/api/lead-intake/leads?status=new', { headers }),
        fetch('/api/dashboard/follow-ups', { headers }),
        fetch('/api/quotes?status=sent,viewed&limit=20&sort=created_at&order=desc', { headers }),
        fetch('/api/quotes/quota', { headers }),
        fetch('/api/team', { headers }),
        fetch('/api/change-order-requests?status=pending_review', { headers }),
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
      if (requestsRes.status === 'fulfilled' && requestsRes.value.ok) {
        const data = await requestsRes.value.json();
        setQuoteRequests(data.leads || []);
      }
      if (followUpsRes.status === 'fulfilled' && followUpsRes.value.ok) {
        setFollowUps(await followUpsRes.value.json());
      }
      if (staleRes.status === 'fulfilled' && staleRes.value.ok) {
        setPendingQuotes((await staleRes.value.json()).quotes || []);
      }
      if (teamRes.status === 'fulfilled' && teamRes.value.ok) {
        const td = await teamRes.value.json();
        setTeamMembers((td.members || []).filter(m => m.status === 'active'));
      }
      if (corRes.status === 'fulfilled' && corRes.value.ok) {
        const cd = await corRes.value.json();
        setChangeOrderRequests(cd.requests || []);
      }
      if (quotaRes.status === 'fulfilled' && quotaRes.value.ok) {
        setQuota(await quotaRes.value.json());
      }
    };

    checkOnboarding().then(redirected => {
      if (!redirected) fetchDashboardData().catch(err => console.error('Dashboard fetch error:', err));
    });
  }, [router]);

  if (loading) return <LoadingSpinner message="Loading..." />;

  const STATUS_COLORS = {
    draft: 'text-v-text-secondary',
    sent: 'text-gray-400',
    viewed: 'text-yellow-400',
    accepted: 'text-teal-400',
    paid: 'text-green-400',
    approved: 'text-green-400',
    declined: 'text-red-400',
    completed: 'text-green-400',
    expired: 'text-v-text-secondary',
    scheduled: 'text-blue-400',
    in_progress: 'text-yellow-400',
    cancelled: 'text-red-400',
  };

  // Stale quotes needing follow-up
  const staleViewedQuotes = pendingQuotes.filter(q => {
    if (q.status !== 'viewed') return false;
    const viewedAt = q.last_viewed_at || q.viewed_at;
    if (!viewedAt) return false;
    return Date.now() - new Date(viewedAt).getTime() > 48 * 60 * 60 * 1000;
  });
  const staleUnviewedQuotes = pendingQuotes.filter(q => {
    if (q.status !== 'sent') return false;
    const sentAt = q.sent_at || q.created_at;
    if (!sentAt) return false;
    return Date.now() - new Date(sentAt).getTime() > 24 * 60 * 60 * 1000;
  });

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

        {/* Quote Quota (free plan) */}
        {quota && !quota.unlimited && (
          <div className={`mt-8 p-4 rounded-lg border ${
            quota.used >= quota.limit ? 'bg-red-500/10 border-red-500/30' :
            quota.used >= quota.limit - 1 ? 'bg-yellow-500/10 border-yellow-500/30' :
            'bg-v-surface border-v-border'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium uppercase tracking-wider ${
                quota.used >= quota.limit ? 'text-red-400' :
                quota.used >= quota.limit - 1 ? 'text-yellow-400' :
                'text-v-text-secondary'
              }`}>
                {quota.used}/{quota.limit} quotes used this month
              </span>
              {quota.used >= quota.limit ? (
                <a href="https://shinyjets.com/products/aircraft-detailing-crm-pro" target="_blank" rel="noreferrer"
                  className="text-[10px] uppercase tracking-wider text-v-gold hover:text-v-gold-dim">
                  Upgrade to Pro
                </a>
              ) : (
                <span className="text-[10px] text-v-text-secondary/60">Resets on the 1st</span>
              )}
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  quota.used >= quota.limit ? 'bg-red-400' :
                  quota.used >= quota.limit - 1 ? 'bg-yellow-400' :
                  'bg-v-gold'
                }`}
                style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }}
              />
            </div>
            {quota.used >= quota.limit && (
              <p className="text-red-400/80 text-xs mt-2">
                You&apos;ve used {quota.used}/{quota.limit} free quotes this month. Upgrade to Pro for unlimited quotes.
              </p>
            )}
          </div>
        )}

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

        {/* ━━━ 1. NEEDS ATTENTION ━━━ */}
        {(quoteRequests.length > 0 || changeOrderRequests.length > 0 || (quickStats?.expiringQuotes?.length > 0) || staleViewedQuotes.length > 0 || staleUnviewedQuotes.length > 0 || upcomingJobs.some(j => new Date(j.scheduled_date).toDateString() === new Date().toDateString())) && (
          <div id="attention" className="mt-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-v-gold mb-4 pb-2 border-b border-v-gold/20">Needs Attention</p>

            {/* Incoming Requests */}
            {quoteRequests.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <p className="text-v-text-secondary text-xs">{quoteRequests.length} new request{quoteRequests.length !== 1 ? 's' : ''}</p>
                  </div>
                  <a href="/requests" className="text-[10px] text-v-gold hover:text-v-gold-dim uppercase tracking-wider">View All</a>
                </div>
                {quoteRequests.slice(0, 3).map(req => (
                  <a key={req.id} href={`/requests/${req.id}`}
                    className="flex items-center justify-between py-2.5 border-b border-v-border-subtle/50 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{req.name || 'Customer'}</p>
                      <p className="text-v-text-secondary text-xs truncate">{req.aircraft_model || ''}{req.airport ? ` \u00B7 ${req.airport}` : ''}</p>
                    </div>
                    <span className="text-v-text-secondary text-[10px] ml-3 shrink-0">{req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Expiring Quotes */}
            {/* Change Order Requests from Crew */}
            {changeOrderRequests.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <p className="text-v-text-secondary text-xs">{changeOrderRequests.length} change order request{changeOrderRequests.length !== 1 ? 's' : ''}</p>
                </div>
                {changeOrderRequests.slice(0, 3).map(cor => (
                  <div key={cor.id} className="flex items-center justify-between py-2.5 border-b border-v-border-subtle/50 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{cor.team_member_name || 'Crew'} found an issue</p>
                      <p className="text-v-text-secondary text-xs truncate">{cor.description?.slice(0, 60)}</p>
                    </div>
                    <span className="text-amber-400 text-[10px] uppercase tracking-wider ml-3 shrink-0">Review</span>
                  </div>
                ))}
              </div>
            )}

            {(quickStats?.expiringQuotes?.length > 0 || quickStats?.recentlyExpired?.length > 0) && (
              <div className="mb-4">
                <ExpiringQuotesWidget expiring={quickStats?.expiringQuotes} expired={quickStats?.recentlyExpired} />
              </div>
            )}

            {/* Quotes viewed but not paid (48+ hours) */}
            {staleViewedQuotes.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  <p className="text-v-text-secondary text-xs">{staleViewedQuotes.length} viewed but unpaid (48h+)</p>
                </div>
                {staleViewedQuotes.slice(0, 3).map(q => (
                  <a key={q.id} href={`/quotes`}
                    className="flex items-center justify-between py-2.5 border-b border-v-border-subtle/50 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{q.client_name || q.customer_name || 'Customer'}</p>
                      <p className="text-v-text-secondary text-xs truncate">{q.aircraft_model || ''} — {currencySymbol()}{formatPriceWhole(q.total_price)}</p>
                    </div>
                    <span className="text-yellow-400 text-[10px] uppercase tracking-wider ml-3 shrink-0">Follow Up</span>
                  </a>
                ))}
              </div>
            )}

            {/* Quotes sent but not viewed (24+ hours) */}
            {staleUnviewedQuotes.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <p className="text-v-text-secondary text-xs">{staleUnviewedQuotes.length} sent but unopened (24h+)</p>
                </div>
                {staleUnviewedQuotes.slice(0, 3).map(q => (
                  <a key={q.id} href={`/quotes`}
                    className="flex items-center justify-between py-2.5 border-b border-v-border-subtle/50 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{q.client_name || q.customer_name || 'Customer'}</p>
                      <p className="text-v-text-secondary text-xs truncate">{q.aircraft_model || ''} — {currencySymbol()}{formatPriceWhole(q.total_price)}</p>
                    </div>
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider ml-3 shrink-0">Resend</span>
                  </a>
                ))}
              </div>
            )}

            {/* Today's Jobs */}
            {upcomingJobs.filter(j => new Date(j.scheduled_date).toDateString() === new Date().toDateString()).length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-v-gold animate-pulse" />
                  <p className="text-v-text-secondary text-xs">Today&apos;s jobs</p>
                </div>
                {upcomingJobs.filter(j => new Date(j.scheduled_date).toDateString() === new Date().toDateString()).map(job => (
                  <div key={job.id} className="flex items-center justify-between py-2.5 border-b border-v-border-subtle/50">
                    <a href={job.share_link ? `/q/${job.share_link}` : '/jobs'} className="min-w-0 hover:opacity-80 transition-opacity">
                      <p className="text-white text-sm truncate">{job.aircraft_name || job.aircraft_model || 'Aircraft'}</p>
                      <p className="text-v-text-secondary text-xs truncate">{job.customer_name || job.client_name || ''}</p>
                    </a>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <span className="text-v-gold text-sm font-data">{currencySymbol()}{formatPriceWhole(job.total_price)}</span>
                      <a href={`/jobs/${job.id}/complete`} className="text-[10px] px-2 py-1 bg-green-600/20 text-green-400 border border-green-500/30 rounded hover:bg-green-600/30 transition-colors">Complete</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ━━━ 2. UPCOMING JOBS (next 7 days) ━━━ */}
        {upcomingJobs.length > 0 && (
          <div id="upcoming" className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">Upcoming Jobs</p>
              <a href="/calendar" className="text-[10px] uppercase tracking-[0.15em] text-v-gold hover:text-v-gold-dim transition-colors">Calendar</a>
            </div>
            <div className="space-y-2">
              {upcomingJobs.filter(j => new Date(j.scheduled_date).toDateString() !== new Date().toDateString()).slice(0, 5).map(job => {
                const d = new Date(job.scheduled_date);
                return (
                  <a key={job.id} href={job.share_link ? `/q/${job.share_link}` : '/jobs'}
                    className="block bg-white/[0.02] border border-v-border-subtle rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-white text-sm truncate">{job.aircraft_name || job.aircraft_model || 'Aircraft'}</p>
                        <p className="text-v-text-secondary text-xs truncate">{job.customer_name || job.client_name || ''}{job.airport ? ` \u00B7 ${job.airport}` : ''}</p>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        <p className="text-v-text-secondary text-[10px]">{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <p className="text-v-gold text-sm font-data">{currencySymbol()}{formatPriceWhole(job.total_price)}</p>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* ━━━ 3. RECENT QUOTES ━━━ */}
        <div id="quotes" className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">Recent Quotes</p>
            <a href="/quotes" className="text-[10px] uppercase tracking-[0.15em] text-v-gold hover:text-v-gold-dim transition-colors">View All</a>
          </div>
          {recentQuotes.length > 0 ? (
            <div>
              {recentQuotes.slice(0, 5).map(q => (
                <a key={q.id} href={q.share_link ? `/q/${q.share_link}` : '/quotes'}
                  className="flex items-center justify-between h-14 border-b border-v-border-subtle hover:bg-white/[0.02] transition-colors -mx-2 px-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-v-text-primary truncate">{q.aircraft_name || q.aircraft_model || 'Aircraft'}</p>
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


        {/* ━━━ 5. FOLLOW-UPS DUE ━━━ */}
        {followUps.needsReview.length > 0 && (
          <div id="followups" className="mt-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary mb-4">Follow-ups Due</p>
            <div className="space-y-2">
              {followUps.needsReview.slice(0, 5).map(job => {
                const daysAgo = Math.floor((Date.now() - new Date(job.completed_at).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={job.id} className="flex items-center justify-between py-2.5 border-b border-v-border-subtle/50">
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{job.client_name || 'Customer'}</p>
                      <p className="text-v-text-secondary text-xs truncate">{job.aircraft_model || ''} — completed {daysAgo}d ago</p>
                    </div>
                    <button onClick={async () => {
                      const token = localStorage.getItem('vector_token');
                      await fetch(`/api/quotes/${job.id}/request-review`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
                      setFollowUps(prev => ({ ...prev, needsReview: prev.needsReview.filter(j => j.id !== job.id) }));
                    }}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-v-gold border border-v-gold/30 hover:bg-v-gold/5 rounded shrink-0 ml-3 transition-colors">
                      Send Review
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ━━━ 6. RECURRING SERVICES DUE ━━━ */}
        {followUps.recurring.length > 0 && (
          <div id="recurring" className="mt-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary mb-4">Recurring Services Due</p>
            <div className="space-y-2">
              {followUps.recurring.slice(0, 5).map(rec => {
                const daysUntil = Math.max(0, Math.ceil((new Date(rec.next_due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const customerName = rec.customers?.name || rec.customers?.company_name || '';
                return (
                  <a key={rec.id} href={rec.customer_id ? `/customers/${rec.customer_id}` : '#'}
                    className="block bg-white/[0.02] border border-v-border-subtle rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-white text-sm truncate">{rec.service_name} due in {daysUntil} day{daysUntil !== 1 ? 's' : ''}</p>
                        <p className="text-v-text-secondary text-xs truncate">{rec.tail_number || ''}{customerName ? ` \u00B7 ${customerName}` : ''}</p>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider shrink-0 ml-3 ${daysUntil <= 7 ? 'text-v-gold' : 'text-v-text-secondary'}`}>
                        {daysUntil <= 7 ? 'Soon' : `${daysUntil}d`}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* ━━━ 7. RECENT COMPLETIONS ━━━ */}
        {followUps.recentCompleted.length > 0 && (
          <div id="completions" className="mt-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary mb-4">Recent Completions</p>
            {followUps.recentCompleted.slice(0, 5).map(job => {
              const daysAgo = Math.floor((Date.now() - new Date(job.completed_at).getTime()) / (1000 * 60 * 60 * 24));
              const opened = !!job.customer_opened_at;
              return (
                <div key={job.id} className="flex items-center justify-between h-12 border-b border-v-border-subtle/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-v-text-primary truncate">{job.aircraft_model || 'Aircraft'}</p>
                    <p className="text-xs text-v-text-secondary/60 truncate">{job.client_name || ''} — {daysAgo}d ago</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <div className={`w-1.5 h-1.5 rounded-full ${opened ? 'bg-green-500' : 'bg-gray-500'}`} />
                    <span className="text-[10px] text-v-text-secondary">{opened ? 'Opened' : 'Not opened'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Terms Modal */}
        <TermsConsentModal
          isOpen={showTermsModal}
          onAccept={() => {
            setShowTermsModal(false);
            setUser(prev => ({ ...prev, terms_accepted_version: TERMS_VERSION }));
          }}
        />

        {/* ━━━ 8. TEAM ACTIVITY ━━━ */}
        {teamMembers.length > 0 && (
          <div id="team" className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-v-text-secondary">Team</p>
              <a href="/team/dashboard" className="text-[10px] uppercase tracking-[0.15em] text-v-gold hover:text-v-gold-dim transition-colors">Manage</a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {teamMembers.slice(0, 6).map(m => (
                <div key={m.id} className="bg-white/[0.02] border border-v-border-subtle rounded-lg px-4 py-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{m.name}</p>
                    <p className="text-v-text-secondary text-xs capitalize">{m.role || m.type}</p>
                  </div>
                  <p className="text-v-text-secondary text-xs shrink-0">{(m.total_hours || 0).toFixed(1)}h</p>
                </div>
              ))}
            </div>
          </div>
        )}

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
