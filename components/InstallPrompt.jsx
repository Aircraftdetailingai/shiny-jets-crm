"use client";
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Pages where the install prompt should NOT appear
const CUSTOMER_PATHS = ['/portal', '/customer', '/q/', '/compare', '/feedback', '/change-order', '/landing', '/login', '/terms', '/privacy'];

export default function InstallPrompt() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Don't show on customer-facing pages
    if (CUSTOMER_PATHS.some(p => pathname?.startsWith(p))) return;

    // Check if already installed as PWA
    try {
      if (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone) {
        setIsInstalled(true);
        return;
      }
    } catch {}

    // Check if dismissed within the last 7 days
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedAt < sevenDays) return;
    }

    // Detect iOS
    const ua = window.navigator?.userAgent || '';
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    setIsIOS(isiOS);

    if (isiOS) {
      // Show iOS prompt after brief delay
      setTimeout(() => setShow(true), 2000);
    }

    // Listen for Android/Chrome install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShow(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa_install_dismissed', String(Date.now()));
  };

  if (!show || isInstalled) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#0f172a] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg">&#9992;</span>
          </div>
          <h3 className="font-bold text-gray-900">Install Vector App</h3>
        </div>
        <button
          onClick={handleDismiss}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {isIOS ? (
        /* iOS Instructions */
        <div className="px-4 pb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-1">
            <p className="text-sm text-gray-700 leading-relaxed">
              <span className="font-semibold">To install:</span> Tap the{' '}
              <span className="inline-flex items-center align-middle mx-0.5 px-1.5 py-0.5 bg-white border border-gray-200 rounded-md">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
              </span>{' '}
              <span className="font-medium">Share</span> icon at the bottom of Safari, then tap{' '}
              <span className="font-semibold">&quot;Add to Home Screen&quot;</span>
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="mt-3 w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Got it
          </button>
        </div>
      ) : (
        /* Android / Chrome — can auto-install */
        <div className="px-4 pb-4">
          <p className="text-sm text-gray-500 mt-1 mb-4">Get the full app experience with quick access from your home screen.</p>
          <div className="flex gap-3">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Maybe Later
            </button>
            {deferredPrompt ? (
              <button
                onClick={handleInstall}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                Install Now
              </button>
            ) : (
              <button
                onClick={handleDismiss}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                Got it
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
