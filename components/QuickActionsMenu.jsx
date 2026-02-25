"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const ACTIONS = [
  {
    id: 'new-quote',
    label: 'New Quote',
    icon: '&#128196;',
    href: '/dashboard',
    color: 'bg-amber-500 hover:bg-amber-600',
  },
  {
    id: 'add-customer',
    label: 'Add Customer',
    icon: '&#128100;',
    href: '/customers',
    color: 'bg-blue-500 hover:bg-blue-600',
  },
  {
    id: 'log-time',
    label: 'Log Time',
    icon: '&#9201;',
    href: '/time-log',
    color: 'bg-emerald-500 hover:bg-emerald-600',
  },
  {
    id: 'add-equipment',
    label: 'Add Equipment',
    icon: '&#128295;',
    href: '/equipment',
    color: 'bg-purple-500 hover:bg-purple-600',
  },
];

// Pages where the FAB should not appear
const HIDDEN_PATHS = ['/login', '/signup', '/onboarding', '/feedback', '/q/', '/portal/', '/quote-request/'];

export default function QuickActionsMenu() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const menuRef = useRef(null);
  const router = useRouter();
  const pathname = usePathname();

  // Hide on public/auth pages
  const shouldHide = HIDDEN_PATHS.some(p => pathname?.startsWith(p));

  // Also hide if no auth token
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
    setVisible(!!token && !shouldHide);
  }, [shouldHide, pathname]);

  // Keyboard shortcut: Cmd+Shift+A
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  const handleAction = useCallback((href) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  if (!visible) return null;

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
      {/* Action items - animate in/out */}
      <div
        className={`flex flex-col items-end gap-2 transition-all duration-200 ${
          open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        {ACTIONS.map((action, i) => (
          <button
            key={action.id}
            onClick={() => handleAction(action.href)}
            className={`flex items-center gap-3 pl-4 pr-5 py-3 rounded-full text-white font-medium shadow-lg ${action.color} transition-all duration-200 min-h-[48px]`}
            style={{ transitionDelay: open ? `${i * 40}ms` : '0ms' }}
          >
            <span className="text-lg" dangerouslySetInnerHTML={{ __html: action.icon }} />
            <span className="text-sm whitespace-nowrap">{action.label}</span>
          </button>
        ))}
      </div>

      {/* FAB trigger */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-gray-700 hover:bg-gray-600 rotate-45'
            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
        }`}
        aria-label="Quick actions"
        title="Quick Actions (Cmd+Shift+A)"
      >
        <svg
          className="w-7 h-7 text-white transition-transform duration-200"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
