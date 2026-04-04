"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { STRIPE_COUNTRIES } from '@/lib/currency';
import SocialLoginButtons from '@/components/SocialLoginButtons';

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const refCode = searchParams.get('ref');
  const planParam = searchParams.get('plan');

  const [loading, setLoading] = useState(true);
  const [inviteOnly, setInviteOnly] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '', confirmPassword: '', country: 'US' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const init = async () => {
      let isInviteOnly = true;
      try {
        const modeRes = await fetch('/api/auth/signup-mode');
        if (modeRes.ok) {
          const modeData = await modeRes.json();
          isInviteOnly = modeData.invite_only;
        }
      } catch {}
      setInviteOnly(isInviteOnly);

      if (isInviteOnly) {
        if (!inviteToken) {
          setError('No invite token provided. You need a valid invitation to sign up.');
          setLoading(false);
          return;
        }
        try {
          const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(inviteToken)}`);
          const data = await res.json();
          if (data.valid) {
            setInvite(data);
            setForm(f => ({ ...f, email: data.email }));
          } else {
            setError(data.error || 'This invitation link is invalid or has expired.');
          }
        } catch {
          setError('Failed to validate invite. Please check your link and try again.');
        }
      } else if (inviteToken) {
        try {
          const res = await fetch(`/api/invites/validate?token=${encodeURIComponent(inviteToken)}`);
          const data = await res.json();
          if (data.valid) {
            setInvite(data);
            setForm(f => ({ ...f, email: data.email }));
          }
        } catch {}
      }
      setLoading(false);
    };
    init();
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
          company: form.company.trim() || null,
          country: form.country || null,
          plan: planParam || 'free',
          invite_token: inviteToken || null,
          referral_code: refCode || localStorage.getItem('vector_referral_code') || null,
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

      // Store auth
      localStorage.setItem('vector_token', data.token);
      localStorage.setItem('vector_user', JSON.stringify(data.user));

      // Show success screen then redirect
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/onboarding';
      }, 1500);
    } catch {
      setFormError('Connection error. Please check your internet and try again.');
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Success state
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

  // Error state (invalid invite)
  if (error) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
        <div className="bg-v-surface border border-v-border rounded-lg p-6 sm:p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-heading text-v-text-primary mb-2">Invalid Invitation</h1>
          <p className="text-v-text-secondary text-sm mb-6 leading-relaxed">{error}</p>
          <a
            href="/login"
            className="inline-block w-full px-6 py-3 bg-v-gold text-v-charcoal rounded-lg font-medium hover:bg-v-gold-dim transition-colors text-center"
            style={{ minHeight: '48px', lineHeight: '24px' }}
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v-charcoal flex flex-col items-center justify-start sm:justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-heading text-v-text-primary tracking-wide">Shiny Jets CRM</h1>
          {!invite && (
            <p className="text-v-text-secondary mt-2 text-sm">Create your account</p>
          )}
        </div>

        {/* Invite accepted banner */}
        {invite && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-5">
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

        {/* Signup form */}
        <form onSubmit={handleSubmit} className="bg-v-surface border border-v-border rounded-lg p-5 sm:p-6">
          {/* Social login — only show when not on invite flow */}
          {!invite && (
            <>
              <SocialLoginButtons />
              <div className="flex items-center my-5">
                <div className="flex-grow border-t border-v-border"></div>
                <span className="mx-3 text-v-text-secondary text-[11px] uppercase tracking-widest whitespace-nowrap">or with email</span>
                <div className="flex-grow border-t border-v-border"></div>
              </div>
            </>
          )}

          {invite && (
            <h2 className="text-base font-heading text-v-text-primary mb-4">Create Your Account</h2>
          )}

          {/* Error message */}
          {formError && formError !== 'ACCOUNT_EXISTS' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
              <p className="text-red-400 text-sm leading-relaxed">{formError}</p>
            </div>
          )}

          {/* Account already exists error */}
          {formError === 'ACCOUNT_EXISTS' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-4">
              <p className="text-amber-300 text-sm font-medium mb-1">This email is already registered</p>
              <p className="text-amber-400/70 text-xs">
                <a href="/login" className="text-v-gold underline underline-offset-2 hover:text-v-gold-dim">
                  Sign in to your existing account
                </a>{' '}
                or use a different email.
              </p>
            </div>
          )}

          <div className="space-y-3.5">
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Full Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="John Smith"
                autoComplete="name"
                className="w-full bg-v-surface-light border border-v-border rounded-lg px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 focus:ring-1 focus:ring-v-gold/20"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Company Name</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Your Aviation Company"
                autoComplete="organization"
                className="w-full bg-v-surface-light border border-v-border rounded-lg px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 focus:ring-1 focus:ring-v-gold/20"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Country</label>
              <select
                value={form.country}
                onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))}
                className="w-full bg-v-surface-light border border-v-border rounded-lg px-4 py-3 text-base text-v-text-primary outline-none focus:border-v-gold/50 focus:ring-1 focus:ring-v-gold/20 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                {STRIPE_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Email <span className="text-red-400">*</span></label>
              {invite ? (
                <div className="w-full bg-v-charcoal border border-v-border rounded-lg px-4 py-3 text-base text-v-text-secondary">
                  {form.email}
                </div>
              ) : (
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@company.com"
                  autoComplete="email"
                  inputMode="email"
                  className="w-full bg-v-surface-light border border-v-border rounded-lg px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 focus:ring-1 focus:ring-v-gold/20"
                />
              )}
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Password <span className="text-red-400">*</span></label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                className="w-full bg-v-surface-light border border-v-border rounded-lg px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 focus:ring-1 focus:ring-v-gold/20"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Confirm Password <span className="text-red-400">*</span></label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className="w-full bg-v-surface-light border border-v-border rounded-lg px-4 py-3 text-base text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 focus:ring-1 focus:ring-v-gold/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-5 bg-v-gold text-v-charcoal rounded-lg font-semibold hover:bg-v-gold-dim disabled:opacity-50 transition-colors text-base"
            style={{ minHeight: '48px' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-v-charcoal/30 border-t-v-charcoal rounded-full animate-spin" />
                Creating Account...
              </span>
            ) : (
              'Create Account'
            )}
          </button>

          <p className="text-center text-xs text-v-text-secondary/60 mt-4">
            Already have an account?{' '}
            <a href="/login" className="text-v-gold hover:text-v-gold-dim underline underline-offset-2">Log in</a>
          </p>
        </form>

        {/* Bottom spacing for mobile keyboard */}
        <div className="h-8 sm:h-0" />
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
