"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SocialLoginButtons from '@/components/SocialLoginButtons';

// Fire ad-conversion events on successful signup. Both are gated on their
// NEXT_PUBLIC_* env var being present — if unset, this no-ops silently. Wrapped
// so an analytics hiccup can never affect the signup flow.
function fireSignupConversions() {
  if (typeof window === 'undefined') return;
  try {
    // Meta Pixel — CompleteRegistration
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
    if (pixelId) {
      if (!window.fbq) {
        /* eslint-disable */
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */
        window.fbq('init', pixelId);
      }
      window.fbq('track', 'CompleteRegistration');
    }

    // GA4 — sign_up
    const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
    if (ga4Id) {
      if (!window.gtag) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        const s = document.createElement('script');
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
        document.head.appendChild(s);
        window.gtag('js', new Date());
        window.gtag('config', ga4Id);
      }
      window.gtag('event', 'sign_up', { method: 'email' });
    }
  } catch (e) {
    // Never let analytics break signup.
    console.error('[signup] conversion event failed:', e?.message || e);
  }
}

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const refCode = searchParams.get('ref');
  const planParam = searchParams.get('plan');

  const [invite, setInvite] = useState(null);
  const [validatingInvite, setValidatingInvite] = useState(false);
  // website_url is a honeypot — see hidden input below. Stays empty for
  // real humans; bots scraping all inputs fill it and get silently rejected.
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', website_url: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  // Open signup is the default UX now — the previous "invite-only gate" that
  // surfaced an error card whenever /api/auth/signup-mode returned
  // invite_only=true is gone. If a token is in the URL we still validate it
  // so the invite banner + locked email field can render, but the page is
  // always usable as a normal signup. Server enforces invite-only when the
  // DB row demands it.
  useEffect(() => {
    if (!inviteToken) return;
    setValidatingInvite(true);
    (async () => {
      try {
        const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(inviteToken)}`);
        const data = await res.json();
        if (data.valid) {
          setInvite(data);
          setForm((f) => ({ ...f, email: data.email }));
        }
      } catch {
        // Invalid token in URL? Fall through to open signup — server will
        // reject if invite-only mode requires a token.
      } finally {
        setValidatingInvite(false);
      }
    })();
  }, [inviteToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.email.trim()) { setFormError('Email is required'); return; }
    if (form.password.length < 8) { setFormError('Password must be at least 8 characters'); return; }
    if (form.password !== form.confirmPassword) { setFormError('Passwords do not match'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          plan: planParam || 'free',
          invite_token: inviteToken || null,
          referral_code: refCode || (typeof window !== 'undefined' ? localStorage.getItem('vector_referral_code') : null) || null,
          website_url: form.website_url,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setFormError('ACCOUNT_EXISTS');
        } else {
          setFormError(data.error || 'Failed to create account. Please try again.');
        }
        return;
      }

      localStorage.setItem('vector_token', data.token);
      localStorage.setItem('vector_user', JSON.stringify(data.user));

      // Fire ad-conversion events on the confirmed registration, before redirect.
      fireSignupConversions();

      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/onboarding';
      }, 1200);
    } catch {
      setFormError('Connection error. Please check your internet and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-heading text-v-text-primary mb-2">Account Created!</h1>
          <p className="text-v-text-secondary text-sm">Setting up your workspace...</p>
          <div className="mt-6">
            <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-transition min-h-screen flex items-center justify-center bg-v-charcoal p-4">
      <div className="w-full max-w-md">
        {/* Header — distinct from /login so users know they're on the signup path */}
        <div className="text-center mb-8">
          <img src="/logos/shiny-jets-dark.png" alt="Shiny Jets CRM" className="h-12 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-heading text-v-text-primary tracking-wide">Create your Shiny Jets CRM account</h1>
          <p className="text-v-text-secondary mt-2 text-sm">Get started with Shiny Jets CRM</p>
        </div>

        {/* Invite accepted banner — only when validating returned a valid token */}
        {invite && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-sm p-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-v-gold/20 flex items-center justify-center mt-0.5">
                <svg className="w-4.5 h-4.5 text-v-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-green-300 font-medium text-sm">Invitation accepted</p>
                <p className="text-green-400/70 text-xs mt-0.5">
                  {invite.duration_days >= 365
                    ? '1 year'
                    : invite.duration_days >= 180
                    ? '6 months'
                    : invite.duration_days >= 90
                    ? '3 months'
                    : `${invite.duration_days} days`}{' '}
                  of {invite.plan === 'business' ? 'Business' : 'Pro'} — completely free
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-v-surface border border-v-border rounded-sm p-6">
          {/* Error message */}
          {formError && formError !== 'ACCOUNT_EXISTS' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-sm px-4 py-3 mb-4">
              <p className="text-red-400 text-sm leading-relaxed">{formError}</p>
            </div>
          )}

          {formError === 'ACCOUNT_EXISTS' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-sm px-4 py-3 mb-4">
              <p className="text-amber-300 text-sm font-medium mb-1">This email is already registered</p>
              <p className="text-amber-400/70 text-xs">
                <a href="/login" className="text-v-gold underline underline-offset-2 hover:text-v-gold-dim">
                  Sign in to your existing account
                </a>{' '}
                or use a different email.
              </p>
            </div>
          )}

          {/* Email signup form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot — visually + interaction-hidden. Real users never see
                or focus this; bots scraping all inputs fill it and get
                silently rejected server-side. Do not remove. */}
            <input
              type="text"
              name="website_url"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={form.website_url}
              onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
              style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
            />

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoComplete="name"
                required
                placeholder="John Smith"
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Email</label>
              {invite ? (
                <div className="w-full bg-v-charcoal border border-v-border rounded-sm px-4 py-3 text-base text-v-text-secondary">
                  {form.email}
                </div>
              ) : (
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  autoComplete="email"
                  inputMode="email"
                  required
                  placeholder="you@company.com"
                  className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
                />
              )}
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 pr-11 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-v-text-secondary hover:text-v-text-primary"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.584 10.587a2 2 0 002.828 2.83M9.363 5.365A9.466 9.466 0 0112 5c4.477 0 8.268 2.943 9.542 7-.41 1.305-1.077 2.51-1.962 3.563M6.196 6.197A10.026 10.026 0 002.458 12c1.274 4.057 5.065 7 9.542 7 1.66 0 3.224-.4 4.604-1.107" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                autoComplete="new-password"
                required
                placeholder="Re-enter password"
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
            </div>

            <button
              type="submit"
              disabled={saving || validatingInvite}
              className="w-full py-3 bg-v-gold text-v-charcoal rounded-sm font-medium hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          {/* Divider + Google — placed BELOW the form per spec so the
              primary call-to-action (email signup) leads. Same component
              the /login page uses, so the Google button styling matches. */}
          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-v-border"></div>
            <span className="mx-4 text-v-text-secondary text-xs uppercase tracking-widest">or</span>
            <div className="flex-grow border-t border-v-border"></div>
          </div>

          <SocialLoginButtons />
        </div>

        {/* Footer: switch to login */}
        <div className="mt-6 text-center">
          <p className="text-v-text-secondary text-sm">
            Already have an account?{' '}
            <a href="/login" className="text-v-gold hover:text-v-gold-dim transition-colors">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
