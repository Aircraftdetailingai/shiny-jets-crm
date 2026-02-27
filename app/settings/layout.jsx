"use client";
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { href: '/settings', label: 'General', icon: '⚙️' },
  { href: '/settings/services', label: 'Services', icon: '🛠️' },
  { href: '/settings/integrations', label: 'Integrations', icon: '🔗' },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
      {/* Header */}
      <header className="text-white flex items-center p-4 space-x-2">
        <a href="/dashboard" className="text-2xl">&#8592;</a>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      <div className="flex flex-col md:flex-row gap-4 px-4 pb-4">
        {/* Sidebar */}
        <nav className="w-full md:w-48 flex-shrink-0">
          <div className="bg-white/10 rounded-lg p-2 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-amber-500 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 text-gray-900">
          {children}
        </main>
      </div>
    </div>
  );
}
