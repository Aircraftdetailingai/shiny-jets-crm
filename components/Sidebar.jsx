"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import NotificationBell from './NotificationBell.jsx';
import PointsBadge from './PointsBadge.jsx';
import { applyFullTheme } from '@/lib/theme';

const NAV_GROUPS = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
      { href: '/quotes', label: 'Quotes', icon: QuotesIcon },
      { href: '/calendar', label: 'Calendar', icon: CalendarIcon },
    ],
  },
  {
    items: [
      { href: '/customers', label: 'Customers', icon: CustomersIcon },
      { href: '/invoices', label: 'Invoices', icon: InvoicesIcon },
      { href: '/jobs', label: 'Jobs', icon: JobsIcon },
      { href: '/reviews', label: 'Reviews', icon: ReviewsIcon },
      { href: '/referrals', label: 'Referrals', icon: ReferralsIcon },
    ],
  },
  {
    items: [
      { href: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
      { href: '/reports', label: 'Reports', icon: ReportsIcon },
      { href: '/products', label: 'Products', icon: ProductsIcon },
    ],
  },
  {
    items: [
      { href: '/team', label: 'Team', icon: TeamIcon },
      { href: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

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
function InvoicesIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" /></svg>;
}
function JobsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v6M8 6H6a2 2 0 00-2 2v6" /></svg>;
}
function ReviewsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>;
}
function ReferralsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>;
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
function SettingsIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        const u = JSON.parse(stored);
        setUser(u);
        // Apply full theme from stored user data
        applyFullTheme(u.portal_theme || 'dark', u.theme_primary || '#C9A84C');
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
          const primary = data.theme_primary || '#C9A84C';
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
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('vector_token');
    localStorage.removeItem('vector_user');
    router.push('/login');
  };

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'V';

  const navContent = (
    <>
      {/* Logo */}
      <div className="h-[72px] flex items-center px-7">
        {user?.theme_logo_url ? (
          <img src={user.theme_logo_url} alt={user.company || 'Logo'} className="h-8 max-w-[160px] object-contain" />
        ) : (
          <span className="text-v-gold text-base font-light" style={{ letterSpacing: '0.3em' }}>VECTOR</span>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-0">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="mx-5 my-2 border-t border-v-border-subtle" />}
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`sidebar-nav-item flex items-center gap-3 h-12 px-7 text-xs uppercase transition-colors relative ${
                    active
                      ? 'text-v-gold bg-v-surface-light/30'
                      : 'text-v-text-secondary hover:text-v-text-primary'
                  }`}
                  style={{ letterSpacing: '0.15em' }}
                >
                  {active && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-v-gold" />}
                  <Icon />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom user area */}
      <div className="border-t border-v-border-subtle px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-v-gold/50 flex items-center justify-center text-v-gold text-xs font-light" style={{ letterSpacing: '0.05em' }}>
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-v-text-primary truncate" style={{ fontVariant: 'small-caps', letterSpacing: '0.05em' }}>
              {user?.name || user?.email || ''}
            </p>
            <p className="text-[10px] text-v-text-secondary truncate">{user?.company || ''}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-v-text-secondary hover:text-v-gold transition-colors p-1"
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
          <span className="text-v-gold text-sm font-light" style={{ letterSpacing: '0.3em' }}>VECTOR</span>
        )}
        <div className="flex items-center gap-2">
          <PointsBadge />
          <NotificationBell />
          <button
            onClick={() => setMobileOpen(prev => !prev)}
            className="p-2 text-v-text-secondary hover:text-v-text-primary"
            aria-label="Menu"
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
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[260px] bg-v-sidebar border-r border-v-border-subtle z-50 flex flex-col slide-in-left">
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
