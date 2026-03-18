"use client";
import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOffline = () => setOffline(true);
    const goOnline = () => { setOffline(false); setDismissed(false); };

    // Check initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) setOffline(true);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[110] bg-v-gold text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 12h.01" />
      </svg>
      <span>You&apos;re offline. Some features may be unavailable.</span>
      <button onClick={() => setDismissed(true)} className="ml-2 hover:text-white/80" aria-label={'Close'}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
