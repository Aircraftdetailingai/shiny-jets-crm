"use client";
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';

function ResetPasswordContent() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
          <div className="text-red-500 text-4xl mb-3">&#9888;&#65039;</div>
          <h2 className="text-lg font-semibold mb-2">Invalid Reset Link</h2>
          <p className="text-gray-600 mb-4">This password reset link is invalid or has expired.</p>
          <a
            href="/forgot-password"
            className="inline-block px-6 py-2 rounded-md text-white font-medium bg-gradient-to-r from-[#f59e0b] to-[#d97706] hover:opacity-90"
          >
            Request New Link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center">
            <span className="mr-2">&#9992;&#65039;</span> {t('dashboard.title')}
          </h1>
          <p className="text-gray-500 mt-1 text-center">Set New Password</p>
        </div>

        {success ? (
          <div className="text-center">
            <div className="text-green-600 text-4xl mb-3">&#10003;</div>
            <h2 className="text-lg font-semibold mb-2">Password Updated</h2>
            <p className="text-gray-600 mb-6">Your password has been reset successfully. You can now sign in with your new password.</p>
            <a
              href="/login"
              className="inline-block w-full py-2 rounded-md text-white font-medium bg-gradient-to-r from-[#f59e0b] to-[#d97706] hover:opacity-90 text-center"
            >
              {t('common.signIn')}
            </a>
          </div>
        ) : (
          <>
            {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-md p-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-md p-2"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  minLength={8}
                  required
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                )}
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-md text-white font-medium bg-gradient-to-r from-[#f59e0b] to-[#d97706] hover:opacity-90 disabled:opacity-50"
                disabled={loading || password.length < 8 || password !== confirmPassword}
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-xs text-gray-400 text-center">By Aircraft Detailing 101</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="page-transition min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]"><div className="text-white">Loading...</div></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
