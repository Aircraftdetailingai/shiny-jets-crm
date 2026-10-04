"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import NotificationBell from './NotificationBell.jsx';
import PointsBadge from './PointsBadge.jsx';
import { applyFullTheme } from '@/lib/theme';
import { normalizePlan, hasFeature, requiredPlanFor } from '@/lib/plans';
import { hasDetailingAiAccess } from '@/lib/detailing-ai-access';

const NAV_GROUPS = [
  {
    // No heading for the single Dashboard link — saves a row of height.
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
    ],
  },
  {
    label: 'Work',
    items: [
      { href: '/requests', label: 'Requests', icon: RequestsIcon, badge: true },
      // Website AI chat handoffs ("Have someone text you"); separate from Requests.
      { href: '/ai-leads', label: 'AI Leads', icon: AiLeadsIcon, feature: 'aiChatWidget' },
      // Request-a-quote link, QR code, embed code, Sticky Request a Quote
      // button (Settings → Share & Embed, route /settings/developer).
      { href: '/settings/developer', label: 'Share & Embed', icon: ShareEmbedIcon },
      { href: '/quotes', label: 'Quotes', icon: QuotesIcon },
      { href: '/customers', label: 'Customers', icon: CustomersIcon },
      { href: '/aircraft', label: 'Aircraft', icon: AircraftIcon },
      { href: '/jobs', label: 'Jobs', icon: JobsIcon, feature: 'jobs' },
      { href: '/change-orders', label: 'Change Orders', icon: ChangeOrdersIcon, feature: 'changeOrders' },
      { href: '/dispatch', label: 'Dispatch', icon: DispatchIcon, feature: 'dispatch' },
      { href: '/calendar', label: 'Schedule', icon: CalendarIcon, feature: 'calendar' },
      { href: '/invoices', label: 'Invoices', icon: InvoicesIcon, feature: 'invoices' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/equipment', label: 'Equipment', icon: EquipmentIcon, feature: 'equipment' },
      { href: '/products', label: 'Products', icon: ProductsIcon, feature: 'products' },
      // /services top-level doesn't exist yet; point at the existing
      // Settings → Services & Pricing page until a dedicated browse page
      // is built. Route works today.
      { href: '/settings/services', label: 'Services', icon: ServicesIcon },
    ],
  },
  {
    label: 'Relationships',
    items: [
      { href: '/reviews', label: 'Reviews', icon: ReviewsIcon, feature: 'reviewRequests' },
      { href: '/team', label: 'Team', icon: TeamIcon, feature: 'team' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: AnalyticsIcon, feature: 'reports' },
      { href: '/reports', label: 'Reports', icon: ReportsIcon, feature: 'reports' },
      { href: '/detailing-ai', label: 'Detailing AI', icon: DetailingAiIcon, feature: 'detailingAi' },
    ],
  },
];

// Row height shrinks on short viewports so every item fits at ~740px tall
// (e.g. a 1366×768 laptop) without scrolling; the mobile drawer keeps
// comfortable 44px tap targets.
const NAV_ROW = 'h-11 [@media(min-width:768px)_and_(min-height:861px)]:h-9 [@media(min-width:768px)_and_(max-height:860px)]:h-7';
const COLLAPSE_KEY = 'sidebar_collapsed_groups';

// Scroll container that shows a fade + "More" hint whenever items are
// hidden below the fold, so nothing looks missing.
function ScrollableNav({ children }) {
  const ref = useRef(null);
  const [more, setMore] = useState(false);
  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);
  useEffect(() => {
    check();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(check);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      ro?.disconnect();
    };
  }, [check]);
  return (
    <div className="relative flex-1 min-h-0">
      <nav ref={ref} className="h-full overflow-y-auto overscroll-contain pb-1 [scrollbar-width:thin]" aria-label="Main">
        <div>{children}</div>
      </nav>
      {more && (
        <button
          type="button"
          onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.6, behavior: 'smooth' })}
          className="absolute bottom-0 left-0 right-0 h-10 flex items-end justify-center pb-1 bg-gradient-to-t from-v-sidebar via-v-sidebar/90 to-transparent text-[9px] uppercase tracking-[0.2em] text-v-text-secondary hover:text-v-gold"
          aria-label="Scroll for more menu items"
        >
          More <span aria-hidden="true" className="ml-1">&#8595;</span>
        </button>
      )}
    </div>
  );
}

function DashboardIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path d="M9 22V12h6v10" /></svg>;
}
function QuotesIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
}
function CalendarIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
function CustomersIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75" /></svg>;
}
function AircraftIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L11 19v-5.5l8 2.5z" /></svg>;
}
function InvoicesIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" /></svg>;
}
function JobsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6M8 6H6a2 2 0 00-2 2v6" /></svg>;
}
function ChangeOrdersIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /><path d="M12 8v4m0 0v4m0-4h4m-4 0H8" /></svg>;
}
function DispatchIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
}
function ReviewsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>;
}
function AnalyticsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
}
function ReportsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
}
function ProductsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
}
function TeamIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m6 5.197V20" /></svg>;
}
function RequestsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" /></svg>;
}
function EquipmentIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M11.42 15.17l-5.6 5.6a2.12 2.12 0 01-3-3l5.6-5.6m2.83 2.83l3.18-3.18a2.12 2.12 0 000-3L14.3 5.7a2.12 2.12 0 00-3 0L8.12 8.88m3.3 6.29l-3.3-3.3" /><path d="M19.07 4.93a2 2 0 010 2.83l-1.42 1.42" /></svg>;
}
function AiLeadsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeLinecap="round" strokeWidth={2.2} /></svg>;
}
function ShareEmbedIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3" /></svg>;
}
function ServicesIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" /></svg>;
}
function DetailingAiIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>;
}
function SettingsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') || {}); } catch {}
  }, []);
  const toggleGroup = (label) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        const u = JSON.parse(stored);
        setUser(u);
        // Apply full theme from stored user data
        applyFullTheme(u.portal_theme || 'dark', u.theme_primary || '#007CB1');
      }
    } catch {}

    // Fetch latest branding from server and apply
    const token = localStorage.getItem('vector_token');
    if (token) {
      fetch('/api/user/branding', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const mode = data.portal_theme || 'dark';
          const primary = data.theme_primary || '#007CB1';
          applyFullTheme(mode, primary);
          // Persist to localStorage for instant load next time
          try {
            const u = JSON.parse(localStorage.getItem('vector_user') || '{}');
            u.theme_primary = primary;
            u.portal_theme = mode;
            u.theme_logo_url = data.theme_logo_url || data.logo_url || null;
            localStorage.setItem('vector_user', JSON.stringify(u));
            setUser(prev => ({ ...prev, theme_primary: primary, portal_theme: mode, theme_logo_url: u.theme_logo_url }));
          } catch {}
        })
        .catch(() => {});

      // Fetch new request count
      fetch('/api/lead-intake/leads?status=new', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.leads) setRequestCount(data.leads.length); })
        .catch(() => {});
    }
  }, []);

  // Listen for plan changes pushed by usePlanGuard and re-hydrate the
  // local user state so the plan badge updates without a page reload.
  useEffect(() => {
    const onUserUpdated = () => {
      try {
        const raw = localStorage.getItem('vector_user');
        if (!raw) return;
        const u = JSON.parse(raw);
        setUser(prev => ({
          ...prev,
          plan: u.plan,
          subscription_status: u.subscription_status,
          subscription_source: u.subscription_source,
          plan_updated_at: u.plan_updated_at,
        }));
      } catch {}
    };
    window.addEventListener('vector-user-updated', onUserUpdated);
    return () => window.removeEventListener('vector-user-updated', onUserUpdated);
  }, []);

  const handleLogout = async () => {
    // Clear the httpOnly auth_token cookie server-side — document.cookie
    // cannot remove httpOnly cookies, so skipping this leaves a stale session.
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    // Clear all app data from localStorage
    localStorage.removeItem('vector_token');
    localStorage.removeItem('vector_user');
    localStorage.removeItem('stripe_banner_dismissed');
    localStorage.removeItem('terms_accepted_session');
    // Clear any Supabase auth keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') || key.startsWith('supabase.auth')) {
        localStorage.removeItem(key);
      }
    });
    // Clear cookies
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
    // Sign out from Supabase if available
    try {
      const { getSupabaseBrowser } = await import('@/lib/supabase-browser');
      const supabase = getSupabaseBrowser();
      if (supabase) await supabase.auth.signOut({ scope: 'global' });
    } catch {}
    // Hard redirect to prevent auto-login
    window.location.href = '/login?logged_out=true';
  };

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/');
    if (href === '/team') return pathname === '/team' || pathname.startsWith('/team/');
    return pathname.startsWith(href);
  };

  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'V';

  const navContent = (
    <>
      {/* Logo */}
      <div className="h-14 [@media(min-width:768px)_and_(max-height:860px)]:h-12 shrink-0 flex items-center px-7">
        {user?.theme_logo_url ? (
          <img src={user.theme_logo_url} alt={user.company || 'Logo'} className="h-8 max-w-[160px] object-contain" />
        ) : (
          <img src="/logos/shiny-jets-dark.png" alt="Shiny Jets CRM" className="h-9 max-w-[180px] object-contain" />
        )}
      </div>

      {/* Nav Groups — collapsible headings, remembered per browser */}
      <ScrollableNav>
        {NAV_GROUPS.map((group, gi) => {
          const hasActive = group.items.some((it) => isActive(it.href));
          const isCollapsed = !!(group.label && collapsed[group.label] && !hasActive);
          const groupId = `nav-group-${gi}`;
          return (
            <div key={gi}>
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!isCollapsed}
                  aria-controls={groupId}
                  className="w-full flex items-center justify-between px-7 pt-3 pb-1 md:pt-2.5 md:pb-0.5 [@media(min-width:768px)_and_(max-height:860px)]:pt-1.5 text-[9px] leading-3 uppercase text-v-text-secondary/60 hover:text-v-text-secondary font-medium"
                  style={{ letterSpacing: '0.2em' }}
                >
                  <span>{group.label}{isCollapsed ? ` · ${group.items.length}` : ''}</span>
                  <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              )}
              <div id={groupId} hidden={isCollapsed}>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`sidebar-nav-item flex items-center gap-3 ${NAV_ROW} px-7 text-xs uppercase transition-colors relative ${
                        active
                          ? 'text-v-gold bg-v-surface-light/30'
                          : 'text-v-text-secondary hover:text-v-text-primary'
                      }`}
                      style={{ letterSpacing: '0.15em' }}
                      aria-current={active ? 'page' : undefined}
                    >
                      {active && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-v-gold" />}
                      <Icon />
                      <span className="truncate">{item.label}</span>
                      {item.feature && user && !user.is_admin && !(item.feature === 'detailingAi' ? hasDetailingAiAccess(user) : hasFeature(user.plan, item.feature)) && (
                        <span className="ml-auto text-[8px] font-semibold tracking-wider px-1.5 py-0.5 rounded border border-v-gold/40 text-v-gold/80" title="Upgrade to unlock">
                          {requiredPlanFor(item.feature) === 'business' ? 'BUSINESS' : 'LITE'}
                        </span>
                      )}
                      {item.badge && requestCount > 0 && (
                        <span className="ml-auto bg-v-gold text-v-charcoal text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">{requestCount}</span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </ScrollableNav>

      {/* Settings (bottom-anchored, above user area) */}
      <div className="border-t border-v-border-subtle shrink-0">
        <a
          href="/settings"
          onClick={() => setMobileOpen(false)}
          className={`sidebar-nav-item flex items-center gap-3 ${NAV_ROW} px-7 text-xs uppercase transition-colors relative ${
            isActive('/settings')
              ? 'text-v-gold bg-v-surface-light/30'
              : 'text-v-text-secondary hover:text-v-text-primary'
          }`}
          style={{ letterSpacing: '0.15em' }}
          aria-current={isActive('/settings') ? 'page' : undefined}
        >
          {isActive('/settings') && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-v-gold" />}
          <SettingsIcon />
          <span>Settings</span>
        </a>
      </div>

      {/* Bottom user area */}
      <div className="border-t border-v-border-subtle px-5 py-3 md:py-2.5 [@media(min-width:768px)_and_(max-height:860px)]:py-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-v-gold/50 flex items-center justify-center text-v-gold text-xs font-light" style={{ letterSpacing: '0.05em' }}>
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-v-text-primary truncate" style={{ fontVariant: 'small-caps', letterSpacing: '0.05em' }}>
              {user?.name || user?.email || ''}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {(() => {
                const cur = user?.is_admin ? 'business' : normalizePlan(user?.plan);
                if (cur === 'business') return <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-700/50">Business</span>;
                if (cur === 'lite') return <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-900/30 text-cyan-300 border border-cyan-700/50">&#9889; Lite</span>;
                return (
                  <>
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-300 border border-gray-600/50">Free</span>
                    <a href="/upgrade" className="text-[9px] text-cyan-400 hover:underline">Upgrade &rarr;</a>
                  </>
                );
              })()}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-v-text-secondary hover:text-v-gold transition-colors p-2 min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="Logout"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[260px] bg-v-sidebar border-r border-v-border-subtle z-40">
        {navContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-v-sidebar z-40 flex items-center justify-between px-4 border-b border-v-border-subtle">
        {user?.theme_logo_url ? (
          <img src={user.theme_logo_url} alt={user.company || 'Logo'} className="h-6 max-w-[120px] object-contain" />
        ) : (
          <img src="/logos/shiny-jets-dark.png" alt="Shiny Jets CRM" className="h-8 max-w-[140px] object-contain" />
        )}
        <div className="flex items-center gap-2">
          <PointsBadge />
          <NotificationBell />
          <button
            onClick={() => setMobileOpen(prev => !prev)}
            className="w-11 h-11 -mr-2 flex items-center justify-center text-v-text-secondary hover:text-v-text-primary"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              {mobileOpen
                ? <path d="M6 18L18 6M6 6l12 12" />
                : <path d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[260px] max-w-[85vw] overflow-y-auto overscroll-contain bg-v-sidebar border-r border-v-border-subtle z-50 flex flex-col slide-in-left">
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
