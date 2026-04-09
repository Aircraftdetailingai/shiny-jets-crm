"use client";
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AcceptInvitePage() {
  const { token } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [done, setDone] = useState(false);

  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invite/accept?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setInvite(data);
          setExistingAccount(data.existing_account || false);
        }
      })
      .catch(() => setError('Failed to load invitation'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setSubmitting(true);
    setError('');

    const password = passwordRef.current?.value;
    const confirm = confirmRef.current?.value;

    if (!existingAccount) {
      if (!password || password.length < 8) {
        setError('Password must be at least 8 characters');
        setSubmitting(false);
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match');
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: existingAccount ? undefined : password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept invitation');

      if (data.token) {
        // Clear any stale detailer session so onboarding doesn't intercept
        localStorage.removeItem('vector_token');
        localStorage.removeItem('vector_user');
        // Store as crew session
        localStorage.setItem('crew_token', data.token);
        if (data.user) {
          localStorage.setItem('crew_user', JSON.stringify(data.user));
        }
      }
      setDone(true);
      // Use window.location for hard redirect to avoid client-side routing intercepting
      setTimeout(() => { window.location.href = '/crew'; }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 text-sm placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-light text-white mb-3">You&apos;re in!</h2>
        <p className="text-white/60 text-sm">Redirecting to your crew dashboard...</p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-light text-white mb-3">Invalid Invitation</h2>
        <p className="text-white/60 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-[#007CB1] text-2xl font-bold tracking-wide">Shiny Jets CRM</span>
          <p className="text-white/40 text-sm mt-2">Team Invitation</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-white text-lg font-medium mb-2">
            Join {invite?.company || 'the team'}
          </h2>
          <p className="text-white/60 text-sm mb-6">
            <strong className="text-white/80">{invite?.inviter_name}</strong> has invited you to join
            <strong className="text-white/80"> {invite?.company}</strong> as <strong className="text-white/80">{(invite?.role || 'team member').replace('_', ' ')}</strong>.
          </p>

          {existingAccount ? (
            <div className="bg-[#007CB1]/10 border border-[#007CB1]/30 rounded-lg p-4 mb-6">
              <p className="text-[#007CB1] text-sm">
                You already have an account with <strong>{invite?.email}</strong>. Click below to link your account to this team.
              </p>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Email</label>
                <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white/70 text-sm">
                  {invite?.email}
                </div>
              </div>
              <div>
                <label className="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Password</label>
                <input ref={passwordRef} type="password" placeholder="Min 8 characters" style={{ fontSize: '16px' }} className={inputCls} />
              </div>
              <div>
                <label className="block text-white/60 text-xs uppercase tracking-wider mb-1.5">Confirm Password</label>
                <input ref={confirmRef} type="password" placeholder="Confirm password" style={{ fontSize: '16px' }} className={inputCls} />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleAccept}
            disabled={submitting}
            className="w-full py-3.5 bg-[#007CB1] text-white rounded-lg font-semibold text-sm hover:bg-[#006a9e] disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Setting up...' : existingAccount ? 'Join Team' : 'Accept Invitation'}
          </button>
        </div>

        <p className="text-center text-white/20 text-[10px] mt-6">Powered by Shiny Jets CRM</p>
      </div>
    </div>
  );
}
