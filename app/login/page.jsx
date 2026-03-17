"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setUserCurrency } from '@/lib/currency';
import TermsConsentModal from '@/components/TermsConsentModal';
import { TERMS_VERSION } from '@/lib/terms';

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(null);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const user = localStorage.getItem('vector_user');
    if (token && user) {
      router.push('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Email:', email);
    console.log('Password length:', password.length);
    setLoading(true);
    setError('');
    try {
      console.log('Sending request to /api/auth/login...');
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      console.log('Response status:', res.status);
      const data = await res.json();
      console.log('Response data:', data);
      if (!res.ok) {
        console.log('Login failed - res.ok is false');
        throw new Error(data.error || 'Login failed');
      }
      if (data.token) {
        console.log('Token received, saving to localStorage...');
        if (typeof window !== 'undefined') {
          localStorage.setItem('vector_token', data.token);
          localStorage.setItem('vector_user', JSON.stringify(data.user));
          setUserCurrency(data.user?.currency || 'USD');
          console.log('Saved to localStorage');

          // Claim referral if stored
          const refCode = localStorage.getItem('vector_referral_code');
          if (refCode) {
            try {
              await fetch('/api/referrals/claim', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${data.token}`,
                },
                body: JSON.stringify({ referral_code: refCode }),
              });
              localStorage.removeItem('vector_referral_code');
            } catch (err) {
              // Non-critical, continue with login
            }
          }
        }
        const redirectTo = (data.must_change_password || data.onboarding_complete === false) ? '/onboarding' : '/dashboard';
        if (data.user.terms_accepted_version !== TERMS_VERSION) {
          setPendingRedirect(redirectTo);
          setShowTermsModal(true);
        } else {
          router.push(redirectTo);
        }
      } else {
        console.log('No token in response!');
      }
    } catch (err) {
      console.log('Login error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
      console.log('=== LOGIN COMPLETE ===');
    }
  };

  return (
    <div className="page-transition min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center">
            <span className="mr-2">✈️</span> {'Vector'}
          </h1>
          <p className="text-gray-500 mt-1 text-center">
            Professional Aircraft Detailing Quotes
          </p>
        </div>
        {error && <div className="text-red-600 mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{'Email'}</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-md p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-md p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded-md text-white font-medium bg-gradient-to-r from-[#f59e0b] to-[#d97706] hover:opacity-90"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-2 text-right">
          <a href="/forgot-password" className="text-sm text-blue-600 hover:underline">
            Forgot password?
          </a>
        </div>
        <div className="my-6 flex items-center">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="mx-2 text-gray-500 text-sm">New to {'Vector'}?</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>
        <a
          href="/"
          className="block w-full text-center bg-[#1e3a5f] text-white py-2 rounded-md font-medium hover:opacity-90"
        >
          See Plans & Pricing
        </a>
        <div className="mt-4 flex items-center justify-between">
          <a href="/crew/login" className="text-sm text-gray-500 hover:text-[#1e3a5f] transition-colors">
            Crew login →
          </a>
          <p className="text-xs text-gray-400">By Vector Aviation</p>
        </div>
      </div>
      <TermsConsentModal
        isOpen={showTermsModal}
        onAccept={() => {
          setShowTermsModal(false);
          if (pendingRedirect) router.push(pendingRedirect);
        }}
      />
    </div>
  );
}
