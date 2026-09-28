"use client";

import Sidebar from './Sidebar.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import PointsBadge from './PointsBadge.jsx';
import NotificationBell from './NotificationBell.jsx';
import PushNotifications from './PushNotifications.jsx';
import PlanSyncMount from './PlanSyncMount.jsx';

export default function AppShell({ children, title }) {
  return (
    <div className="min-h-screen bg-v-charcoal">
      <PlanSyncMount />
      <Sidebar />

      {/* Main content */}
      <main className="md:ml-[260px] min-h-screen min-w-0 overflow-x-clip">
        {/* Desktop top bar */}
        <header className="hidden md:flex items-center justify-between h-14 px-8 border-b border-v-border-subtle bg-v-charcoal sticky top-0 z-30">
          <div>
            {title && (
              <h1 className="font-heading text-v-text-primary font-light text-sm uppercase" style={{ letterSpacing: '0.15em' }}>
                {title}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-4">
            <GlobalSearch />
            <PointsBadge />
            <NotificationBell />
          </div>
        </header>

        {/* Mobile spacer for fixed top bar */}
        <div className="md:hidden h-14" />

        {/* Push notification prompt */}
        <PushNotifications />

        {/* Page content */}
        <div className="page-transition">
          {children}
        </div>
      </main>
    </div>
  );
}
