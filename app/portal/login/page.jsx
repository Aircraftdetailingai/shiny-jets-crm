"use client";
import { useState } from 'react';

export default function PortalLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check URL params for errors
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'expired' && !error) setError('Link expired. Please request a new one.');
    if (params.get('error') === 'invalid' && !error) setError('Invalid link. Please request a new one.');
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/portal/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to send link');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#007CB1]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#007CB1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0D1B2A]">Aircraft Service Portal</h1>
          <p className="text-[#666] text-sm mt-1">View your service history, photos, and upcoming appointments</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#e5e7eb] p-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#0D1B2A] mb-1">Check your email</h2>
              <p className="text-[#666] text-sm mb-4">
                We sent a sign-in link to <strong>{email}</strong>
              </p>
              <p className="text-[#999] text-xs">The link expires in 1 hour. Check spam if you don't see it.</p>
              <button onClick={() => { setSent(false); setEmail(''); }} className="mt-4 text-[#007CB1] text-sm hover:underline">
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-[#333] mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full px-4 py-3 border border-[#ddd] rounded-lg text-[#333] placeholder-[#aaa] outline-none focus:border-[#007CB1] focus:ring-2 focus:ring-[#007CB1]/20 text-sm"
              />
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full mt-4 py-3 bg-[#007CB1] text-white rounded-lg font-semibold text-sm hover:bg-[#006a9a] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sending...' : 'Send Sign-In Link'}
              </button>
              <p className="text-center text-[#999] text-xs mt-3">No password needed — we'll email you a secure link</p>
            </form>
          )}
        </div>

        <p className="text-center text-[#bbb] text-xs mt-6">Powered by Shiny Jets Aviation</p>
      </div>
    </div>
  );
}
