"use client";
import { useState, useEffect } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

export default function BiometricPrompt() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Don't show if already registered
    if (localStorage.getItem('webauthn_registered')) return;

    // Don't show if dismissed (check expiry — 1 year)
    const dismissedUntil = localStorage.getItem('webauthn_dismissed_until');
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) return;

    // Don't show if browser doesn't support WebAuthn
    if (!window.PublicKeyCredential) return;

    // Only show after a delay
    const timer = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const user = JSON.parse(localStorage.getItem('vector_user') || '{}');

      const optRes = await fetch('/api/auth/webauthn/register-options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!optRes.ok) throw new Error('Failed to get options');
      const options = await optRes.json();

      const credential = await startRegistration({ optionsJSON: options });

      const verRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ credential, deviceName: navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Mac') ? 'Mac' : 'This device' }),
      });
      if (!verRes.ok) throw new Error('Registration failed');

      localStorage.setItem('webauthn_registered', user.email || 'true');
      setDone(true);
      setTimeout(() => setShow(false), 2000);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('WebAuthn registration error:', err);
      }
      // On cancel/error, dismiss for 30 days
      localStorage.setItem('webauthn_dismissed_until', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
      setShow(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    // Dismiss for 1 year
    localStorage.setItem('webauthn_dismissed_until', String(Date.now() + 365 * 24 * 60 * 60 * 1000));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md bg-v-surface rounded-xl shadow-2xl border border-v-border overflow-hidden animate-slide-up">
      <div className="p-4">
        {done ? (
          <div className="text-center py-2">
            <p className="text-v-text-primary text-sm font-medium">Biometric login enabled!</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-v-gold/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-v-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 10v4m0 0v.01M7.5 8.5C8.5 6.5 10 5.5 12 5.5s3.5 1 4.5 3M6 11c0-3.3 2.7-6 6-6s6 2.7 6 6M4.5 13.5C4.5 9.4 7.9 6 12 6s7.5 3.4 7.5 7.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-v-text-primary text-sm font-medium">Enable Face ID / Fingerprint?</p>
                <p className="text-v-text-secondary text-xs mt-0.5">Sign in faster next time with biometrics.</p>
              </div>
              <button onClick={handleDismiss} aria-label="Dismiss" className="w-10 h-10 -mr-2 flex items-center justify-center text-v-text-secondary hover:text-v-text-primary text-xl leading-none">&times;</button>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleDismiss} className="flex-1 py-2 text-xs text-v-text-secondary border border-v-border rounded-lg hover:bg-white/5">
                Not now
              </button>
              <button
                onClick={handleEnable}
                disabled={loading}
                className="flex-1 py-2 text-xs text-white bg-v-gold rounded-lg hover:bg-v-gold-dim disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Enable'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
