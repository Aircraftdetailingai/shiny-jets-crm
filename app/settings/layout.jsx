"use client";
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import PlanSyncMount from '@/components/PlanSyncMount';

function BuildingIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" /></svg>;
}
function CreditCardIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>;
}
function WrenchIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>;
}
function ZapIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
}
function GitBranchIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>;
}
function PlugIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5" /><path d="M9 7V2" /><path d="M15 7V2" /><path d="M6 13V8h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z" /></svg>;
}
function UsersIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function TerminalIcon() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>;
}

const BUCKETS = [
  { href: '/settings/business', label: 'Business Info', Icon: BuildingIcon },
  { href: '/settings/payments', label: 'Payments & Billing', Icon: CreditCardIcon },
  { href: '/settings/services', label: 'Services & Pricing', Icon: WrenchIcon },
  { href: '/settings/intake-flow', label: 'Intake Flow', Icon: GitBranchIcon },
  { href: '/settings/automations', label: 'Automations', Icon: ZapIcon },
  { href: '/settings/connections', label: 'Connections', Icon: PlugIcon },
  { href: '/settings/team-access', label: 'Team & Access', Icon: UsersIcon },
  { href: '/settings/developer', label: 'Developer', Icon: TerminalIcon },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vector_user');
      if (stored) setIsAdmin(!!JSON.parse(stored).is_admin);
    } catch {}
  }, []);

  const visibleBuckets = BUCKETS.filter(b => !b.adminOnly || isAdmin);
  const activeBucket =
    visibleBuckets.find(b => pathname === b.href || pathname.startsWith(b.href + '/'))
      ?? visibleBuckets[0];

  return (
    <div className="min-h-screen bg-v-charcoal">
      <PlanSyncMount />
      {/* Header */}
      <header className="text-white flex items-center p-4 space-x-2">
        <a href="/dashboard" className="text-2xl">&#8592;</a>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      {/* Mobile dropdown — visible below md */}
      <div className="md:hidden px-4 pb-3">
        <select
          value={activeBucket.href}
          onChange={(e) => router.push(e.target.value)}
          className="w-full bg-v-surface border border-v-border text-v-text-primary rounded-lg px-3 py-2 text-sm"
        >
          {visibleBuckets.map(b => (
            <option key={b.href} value={b.href}>{b.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col md:flex-row gap-4 px-4 pb-4">
        {/* Sticky sub-nav (md+) */}
        <nav className="hidden md:block w-56 flex-shrink-0">
          <div className="sticky top-4 bg-white/10 rounded-lg p-2 space-y-1">
            {visibleBuckets.map((bucket) => {
              const isActive = bucket === activeBucket;
              const Icon = bucket.Icon;
              return (
                <Link
                  key={bucket.href}
                  href={bucket.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-v-gold text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon />
                  <span className="text-sm">{bucket.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <main className="flex-1 text-v-text-primary">
          {children}
        </main>
      </div>
    </div>
  );
}
