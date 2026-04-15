"use client";
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { href: '/settings', label: 'General', icon: '⚙️' },
  { href: '/settings/locations', label: 'Locations', icon: '📍' },
  { href: '/settings/integrations', label: 'Integrations', icon: '🔗' },
  { href: '/settings/directory', label: 'Directory', icon: '🌐' },
  { href: '/settings/services', label: 'Services', icon: '🛠️', section: 'Tools' },
  { href: '/settings/embed', label: 'Embed & QR', icon: '🔗' },
  { href: '/settings/intake-flow', label: 'AI Lead Intake', icon: '🤖' },
  { href: '/settings/aircraft', label: 'Aircraft DB', icon: '✈️' },
  { href: '/settings/import', label: 'Import / Export', icon: '📦', section: 'Data' },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-v-charcoal">
      {/* Header */}
      <header className="text-white flex items-center p-4 space-x-2">
        <a href="/dashboard" className="text-2xl">&#8592;</a>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      <div className="flex flex-col md:flex-row gap-4 px-4 pb-4">
        {/* Sidebar */}
        <nav className="w-full md:w-48 flex-shrink-0">
          <div className="bg-white/10 rounded-lg p-2 space-y-1">
            {navItems.map((item, i) => {
              const isActive = pathname === item.href;
              const showSection = item.section && (!navItems[i - 1] || navItems[i - 1].section !== item.section);
              return (
                <div key={item.href}>
                  {showSection && (
                    <div className="text-white/40 text-[10px] uppercase tracking-wider px-3 pt-3 pb-1">{item.section}</div>
                  )}
                  <Link
                    href={item.href}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-v-gold text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 text-v-text-primary">
          {children}
        </main>
      </div>
    </div>
  );
}
