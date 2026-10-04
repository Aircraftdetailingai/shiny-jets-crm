'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  MUST_CHANGE_PASSWORD_STORAGE_KEY,
  safeNextPath,
  validateSetPasswordInput,
} from '@/lib/password-change';

function EyeIcon({ off }) {
  if (off) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 3l18 18" strokeLinecap="round" />
        <path d="M10.6 10.6A2 2 0 0 0 12 15a2 2 0 0 0 1.4-.6" strokeLinecap="round" />
        <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6 0 10 7 10 7a18.4 18.4 0 0 1-3.2 4.1" strokeLinecap="round" />
        <path d="M6.1 6.1C3.7 7.8 2 12 2 12s4 7 10 7a10.7 10.7 0 0 0 4.1-.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  shown,
  onToggle,
  autoComplete,
  autoFocus,
  invalid,
  describedBy,
  inputRef,
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-v-text-primary mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-required="true"
          aria-invalid={invalid ? 'true' : 'false'}
          aria-describedby={describedBy}
          className="set-password-input w-full bg-v-surface-light border border-[#94A3B8] rounded-sm px-4 py-3 pr-14 text-base text-v-text-primary outline-none"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={shown}
          aria-controls={id}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-v-text-primary hover:text-white"
        >
          <EyeIcon off={shown} />
        </button>
      </div>
    </div>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const errorId = useId();
  const hintId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let token = null;
    try {
      token = localStorage.getItem('vector_token');
    } catch {
      token = null;
    }
    if (!token) {
      try { localStorage.removeItem(MUST_CHANGE_PASSWORD_STORAGE_KEY); } catch {}
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  const clearSessionAndLeave = () => {
    try {
      localStorage.removeItem('vector_token');
      localStorage.removeItem('vector_user');
      localStorage.removeItem(MUST_CHANGE_PASSWORD_STORAGE_KEY);
    } catch {}
    window.location.href = '/login?logged_out=true';
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    clearSessionAndLeave();
  };

  const continueWithToken = async (data) => {
    if (data.token) {
      try { localStorage.setItem('vector_token', data.token); } catch {}
    }
    try { localStorage.removeItem(MUST_CHANGE_PASSWORD_STORAGE_KEY); } catch {}
    try {
      const refCode = localStorage.getItem('vector_referral_code');
      if (refCode && data.token) {
        const claim = await fetch('/api/referrals/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ referral_code: refCode }),
        });
        if (claim.ok) localStorage.removeItem('vector_referral_code');
      }
    } catch {}
    window.location.assign(data.redirect || '/onboarding');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validateSetPasswordInput({ password, confirm });
    if (validation) {
      setError(validation.error);
      setErrorField(validation.field);
      const node = validation.field === 'confirm' ? confirmRef.current : passwordRef.current;
      node?.focus();
      return;
    }
    setLoading(true);
    setError('');
    setErrorField('');
    try {
      const token = localStorage.getItem('vector_token');
      const next = safeNextPath(params.get('next'));
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password, confirm, ...(next ? { next } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        clearSessionAndLeave();
        return;
      }
      if (!res.ok) {
        const message = data.error || 'Could not update your password. Try again.';
        setError(message);
        setErrorField(data.field || 'password');
        const node = data.field === 'confirm' ? confirmRef.current : passwordRef.current;
        node?.focus();
        return;
      }
      continueWithToken(data);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setErrorField('');
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#7DD3FC] border-t-transparent rounded-full animate-spin" role="status">
          <span className="sr-only">Loading</span>
        </div>
      </div>
    );
  }

  const passwordDescribedBy = [hintId, error && errorField === 'password' ? errorId : null].filter(Boolean).join(' ');
  const confirmDescribedBy = error && (errorField === 'confirm' || errorField === '') ? errorId : undefined;

  return (
    <div className="min-h-screen bg-v-charcoal text-v-text-primary flex items-center justify-center px-4 py-8 md:py-16">
      <div className="w-full max-w-5xl md:grid md:grid-cols-2 md:gap-16 md:items-center">
        <div className="mb-8 md:mb-0">
          <img src="/logos/shiny-jets-dark.png" alt="Shiny Jets CRM" className="h-10 md:h-12 mb-6 object-contain" />
          <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-v-text-primary">
            Set your password
          </h1>
          <p className="mt-3 text-base text-v-text-secondary max-w-md leading-relaxed">
            Your account was created with a temporary password. Choose a new one before you continue to setup or the dashboard.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="set-password-form bg-v-surface border border-[#94A3B8] rounded-sm p-5 sm:p-8"
          aria-busy={loading ? 'true' : 'false'}
        >
          <div className="space-y-5">
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              shown={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              autoComplete="new-password"
              autoFocus
              invalid={errorField === 'password'}
              describedBy={passwordDescribedBy}
              inputRef={passwordRef}
            />
            <p id={hintId} className="text-sm text-v-text-secondary -mt-3">
              Use at least 8 characters. It must be different from the temporary password.
            </p>

            <PasswordField
              id="confirm-password"
              label="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              shown={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
              invalid={errorField === 'confirm'}
              describedBy={confirmDescribedBy}
              inputRef={confirmRef}
            />

            <div id={errorId} role="alert" aria-live="assertive" className="min-h-[1.5rem]">
              {error ? (
                <p className="text-sm text-[#FECACA]">{error}</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-12 py-3 px-4 bg-[#007CB1] text-white rounded-sm font-medium hover:bg-[#006691] disabled:bg-[#005070] disabled:cursor-wait"
            >
              {loading ? 'Saving password…' : 'Save password'}
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-[#5C7394]">
            <button
              type="button"
              onClick={logout}
              className="min-h-11 text-sm text-v-text-primary underline underline-offset-4 hover:text-white"
            >
              Log out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#7DD3FC] border-t-transparent rounded-full animate-spin" role="status">
          <span className="sr-only">Loading</span>
        </div>
      </div>
    }>
      <SetPasswordForm />
    </Suspense>
  );
}
