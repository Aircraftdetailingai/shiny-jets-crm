"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { STRIPE_COUNTRIES } from '@/lib/currency';

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const refCode = searchParams.get('ref');

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '', confirmPassword: '', country: 'US' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!inviteToken) {
      setError('No invite token provided. You need a valid invitation to sign up.');
      setLoading(false);
      return;
    }

    fetch(`/api/invites/validate?token=${encodeURIComponent(inviteToken)}`)
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setInvite(data);
          setForm(f => ({ ...f, email: data.email }));
        } else {
          setError(data.error || 'Invalid invite token');
        }
      })
      .catch(() => setError('Failed to validate invite'))
      .finally(() => setLoading(false));
  }, [inviteToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (form.password.length < 8) { setFormError('Password must be at least 8 characters'); return; }
    if (form.password !== form.confirmPassword) { setFormError('Passwords do not match'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name.trim(),
          company: form.company.trim() || null,
          country: form.country || null,
          invite_token: inviteToken,
          referral_code: refCode || localStorage.getItem('vector_referral_code') || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Failed to create account');
        return;
      }

      // Store auth
      localStorage.setItem('vector_token', data.token);
      localStorage.setItem('vector_user', JSON.stringify(data.user));
      window.location.href = '/onboarding';
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
        <div className="bg-v-surface border border-v-border rounded-sm p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">✉️</div>
          <h1 className="text-xl font-heading text-v-text-primary mb-2">Invalid Invitation</h1>
          <p className="text-v-text-secondary text-sm mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-v-gold text-v-charcoal rounded-sm font-medium hover:bg-v-gold-dim transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading text-v-text-primary tracking-wide">Vector Aviation</h1>
          <p className="text-v-text-secondary mt-2">You've been invited to join</p>
        </div>

        {/* Invite details card */}
        <div className="bg-v-surface border border-v-border rounded-sm p-5 mb-6 border-l-2 border-l-v-gold">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-v-text-secondary uppercase tracking-widest">Your Plan</p>
              <p className="text-lg font-heading text-v-gold mt-1">{invite.plan === 'business' ? 'Business' : 'Pro'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-v-text-secondary uppercase tracking-widest">Duration</p>
              <p className="text-lg font-mono text-v-text-primary mt-1">{invite.duration_days} days</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-v-text-secondary uppercase tracking-widest">Cost</p>
              <p className="text-lg font-mono text-green-400 mt-1">$0</p>
            </div>
          </div>
        </div>

        {/* Signup form */}
        <form onSubmit={handleSubmit} className="bg-v-surface border border-v-border rounded-sm p-6 modal-glow">
          <h2 className="text-lg font-heading text-v-text-primary mb-5">Create Your Account</h2>

          {formError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-sm px-4 py-3 mb-4">
              <p className="text-red-400 text-sm">{formError}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="John Smith"
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Company Name</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Your Aviation Company"
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Country</label>
              <select
                value={form.country}
                onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))}
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-sm text-v-text-primary outline-none focus:border-v-gold/50"
              >
                {STRIPE_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                readOnly
                className="w-full bg-v-charcoal border border-v-border rounded-sm px-4 py-3 text-sm text-v-text-secondary cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Password <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Minimum 8 characters"
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
            </div>

            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Confirm Password <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Re-enter password"
                className="w-full bg-v-surface-light border border-v-border rounded-sm px-4 py-3 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-6 py-3 bg-v-gold text-v-charcoal rounded-sm font-medium hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating Account...' : 'Create Account'}
          </button>

          <p className="text-center text-xs text-v-text-secondary/60 mt-4">
            Already have an account? <a href="/login" className="text-v-gold hover:text-v-gold-dim">Log in</a>
          </p>
        </form>
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
