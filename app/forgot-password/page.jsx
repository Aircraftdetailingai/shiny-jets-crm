"use client";
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-transition min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center">
            <span className="mr-2">&#9992;&#65039;</span> {'Vector'}
          </h1>
          <p className="text-gray-500 mt-1 text-center">Reset Your Password</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-green-600 text-4xl mb-3">&#10003;</div>
            <h2 className="text-lg font-semibold mb-2">Check Your Email</h2>
            <p className="text-gray-600 mb-4">
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. It expires in 1 hour.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Don&apos;t see it? Check your spam folder.
            </p>
            <a
              href="/login"
              className="inline-block px-6 py-2 rounded-md text-white font-medium bg-gradient-to-r from-[#f59e0b] to-[#d97706] hover:opacity-90"
            >
              Back to {'Login'}
            </a>
          </div>
        ) : (
          <>
            <p className="text-gray-600 text-sm mb-4">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
            {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'Email'}</label>
                <input
                  type="email"
                  className="w-full border border-gray-300 rounded-md p-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-md text-white font-medium bg-gradient-to-r from-[#f59e0b] to-[#d97706] hover:opacity-90 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
            <div className="mt-4 text-center">
              <a href="/login" className="text-sm text-blue-600 hover:underline">
                Back to {'Login'}
              </a>
            </div>
          </>
        )}
        <p className="mt-6 text-xs text-gray-400 text-center">By Aircraft Detailing 101</p>
      </div>
    </div>
  );
}
