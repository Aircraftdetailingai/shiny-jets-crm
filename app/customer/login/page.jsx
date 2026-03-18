"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState('email'); // email | code
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const handleRequestCode = async (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/customer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_code', email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send');
        return;
      }

      setStep('code');
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!code || code.length !== 6) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/customer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_code', email, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid code');
        return;
      }

      // Store token and redirect
      localStorage.setItem('customer_token', data.token);
      localStorage.setItem('customer_user', JSON.stringify(data.customer));
      router.push('/customer/dashboard');
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-2">
            <span>&#9992;</span> {'Vector'}
          </h1>
          <p className="text-blue-200 mt-2">{'Customer'} Portal</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          {step === 'email' ? (
            <>
              <h2 className="text-2xl font-semibold mb-2 text-center">Welcome Back</h2>
              <p className="text-gray-500 text-center mb-6">
                Enter your email to access your quotes and jobs
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {'Email'} Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full border rounded-lg px-4 py-3 text-lg"
                    placeholder="your@email.com"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3 bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Login Code'}
                </button>
              </form>

              <p className="text-xs text-gray-500 text-center mt-4">
                We'll send a 6-digit code to your email
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold mb-2 text-center">Enter Code</h2>
              <p className="text-gray-500 text-center mb-6">
                We sent a code to <strong>{email}</strong>
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    6-Digit Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    maxLength={6}
                    className="w-full border rounded-lg px-4 py-3 text-2xl text-center tracking-widest font-mono"
                    placeholder="000000"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full py-3 bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Login'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setStep('email')}
                  className="text-v-gold-dim hover:underline text-sm"
                >
                  Use a different email
                </button>
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={handleRequestCode}
                  disabled={loading}
                  className="text-gray-500 hover:text-gray-700 text-sm"
                >
                  Didn't receive code? Resend
                </button>
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="text-center mt-6 text-blue-200 text-sm">
          <p>View your quotes, pay invoices, and track your jobs.</p>
        </div>
      </div>
    </div>
  );
}
