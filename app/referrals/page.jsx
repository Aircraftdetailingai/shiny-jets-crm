"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function QRCode({ value, size = 160 }) {
  // Simple QR code using a public API — renders as an image
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=0D1B2A&color=C9A84C&format=svg`;
  return <img src={url} alt="QR Code" width={size} height={size} className="rounded-sm" />;
}

export default function ReferralsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const fetchReferrals = useCallback(async () => {
    try {
      const token = localStorage.getItem('vector_token');
      if (!token) { router.push('/login'); return; }

      const res = await fetch('/api/referrals', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) throw new Error('Failed to load referrals');

      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchReferrals(); }, [fetchReferrals]);

  const referralUrl = data?.referral_code
    ? `https://app.vectorav.ai/ref/${data.referral_code}`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = referralUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const stats = data?.stats || {};
  const referrals = data?.referrals || [];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'rewarded':
      case 'completed':
        return <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30 rounded-sm">Rewarded</span>;
      case 'pending':
        return <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-v-gold/15 text-v-gold border border-v-gold/30 rounded-sm">Pending</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-v-text-secondary/15 text-v-text-secondary border border-v-border rounded-sm">{status}</span>;
    }
  };

  const anonymize = (referral) => {
    const u = referral.referred_user;
    if (!u) return 'A detailer';
    // Show company or "Detailer in [Country]" for privacy
    if (u.company) return u.company;
    return 'A fellow detailer';
  };

  return (
    <>
      <Sidebar />
      <main className="md:ml-[260px] min-h-screen bg-v-charcoal">
        {/* Mobile spacer */}
        <div className="h-14 md:hidden" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => router.push('/dashboard')} className="text-v-text-secondary hover:text-v-text-primary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div>
              <h1 className="text-2xl font-heading text-v-text-primary tracking-wide">Referrals</h1>
              <p className="text-sm text-v-text-secondary mt-0.5">Invite detailers and earn rewards</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-sm p-6 text-center">
              <p className="text-red-400">{error}</p>
              <button onClick={fetchReferrals} className="mt-3 text-sm text-v-gold hover:text-v-gold-dim">Retry</button>
            </div>
          ) : (
            <>
              {/* Referral Link + QR Code */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Link Card */}
                <div className="lg:col-span-2 bg-v-surface border border-v-border rounded-sm p-6">
                  <h2 className="text-sm text-v-text-secondary uppercase tracking-widest mb-4">Your Referral Link</h2>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-v-charcoal border border-v-border rounded-sm px-4 py-3 font-mono text-sm text-v-text-primary truncate">
                      {referralUrl}
                    </div>
                    <button
                      onClick={handleCopy}
                      className={`px-5 py-3 rounded-sm text-sm font-medium transition-all ${
                        copied
                          ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                          : 'bg-v-gold text-v-charcoal hover:bg-v-gold-dim'
                      }`}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-xs text-v-text-secondary">Your code:</span>
                    <span className="font-mono text-sm text-v-gold tracking-wider">{data?.referral_code}</span>
                  </div>
                  <p className="text-xs text-v-text-secondary/70 mt-3">
                    Share this link with fellow aviation detailers. When they sign up and complete their first paid quote, you'll both earn rewards.
                  </p>
                </div>

                {/* QR Code Card */}
                <div className="bg-v-surface border border-v-border rounded-sm p-6 flex flex-col items-center justify-center">
                  <h2 className="text-sm text-v-text-secondary uppercase tracking-widest mb-4">QR Code</h2>
                  {referralUrl && <QRCode value={referralUrl} size={140} />}
                  <p className="text-[10px] text-v-text-secondary/50 mt-3">Scan to open referral link</p>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-xs text-v-text-secondary uppercase tracking-widest">Total Referred</p>
                  <p className="text-3xl font-heading text-v-text-primary mt-2">{stats.total || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-xs text-v-text-secondary uppercase tracking-widest">Rewarded</p>
                  <p className="text-3xl font-heading text-green-400 mt-2">{stats.rewarded || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-xs text-v-text-secondary uppercase tracking-widest">Pending</p>
                  <p className="text-3xl font-heading text-v-gold mt-2">{stats.pending || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-5">
                  <p className="text-xs text-v-text-secondary uppercase tracking-widest">Pro Days Earned</p>
                  <p className="text-3xl font-heading text-v-text-primary mt-2">{(stats.months_earned || 0) * 30}</p>
                </div>
              </div>

              {/* Rewards Summary */}
              <div className="bg-v-surface border border-v-border rounded-sm p-6 mb-8 border-l-2 border-l-v-gold">
                <h2 className="text-sm text-v-text-secondary uppercase tracking-widest mb-3">Rewards Earned</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-v-text-secondary">Points from Referrals</p>
                    <p className="text-xl font-mono text-v-gold mt-1">{(stats.points_earned || 0).toLocaleString()} pts</p>
                  </div>
                  <div>
                    <p className="text-xs text-v-text-secondary">Free Pro Months</p>
                    <p className="text-xl font-mono text-v-text-primary mt-1">{stats.months_earned || 0} month{(stats.months_earned || 0) !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-xs text-v-text-secondary">Conversion Rate</p>
                    <p className="text-xl font-mono text-v-text-primary mt-1">
                      {stats.total > 0 ? Math.round(((stats.rewarded || 0) / stats.total) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div className="bg-v-surface border border-v-border rounded-sm p-6 mb-8">
                <h2 className="text-sm text-v-text-secondary uppercase tracking-widest mb-4">How It Works</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-10 h-10 mx-auto bg-v-gold/10 border border-v-gold/30 rounded-full flex items-center justify-center text-v-gold text-lg mb-3">1</div>
                    <p className="text-sm text-v-text-primary font-medium">Share Your Link</p>
                    <p className="text-xs text-v-text-secondary mt-1">Send your referral link to fellow aviation detailers</p>
                  </div>
                  <div className="text-center">
                    <div className="w-10 h-10 mx-auto bg-v-gold/10 border border-v-gold/30 rounded-full flex items-center justify-center text-v-gold text-lg mb-3">2</div>
                    <p className="text-sm text-v-text-primary font-medium">They Sign Up</p>
                    <p className="text-xs text-v-text-secondary mt-1">They create an account and start using Vector</p>
                  </div>
                  <div className="text-center">
                    <div className="w-10 h-10 mx-auto bg-v-gold/10 border border-v-gold/30 rounded-full flex items-center justify-center text-v-gold text-lg mb-3">3</div>
                    <p className="text-sm text-v-text-primary font-medium">You Both Earn</p>
                    <p className="text-xs text-v-text-secondary mt-1">500 pts each + 1 month free Pro for you when they complete their first paid quote</p>
                  </div>
                </div>
              </div>

              {/* Referral List */}
              <div className="bg-v-surface border border-v-border rounded-sm">
                <div className="px-6 py-4 border-b border-v-border">
                  <h2 className="text-sm text-v-text-secondary uppercase tracking-widest">Your Referrals</h2>
                </div>
                {referrals.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <div className="text-3xl mb-3 opacity-40">
                      <svg className="w-10 h-10 mx-auto text-v-text-secondary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                    </div>
                    <p className="text-sm text-v-text-secondary">No referrals yet. Share your link to get started!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-v-border">
                    {referrals.map((ref) => (
                      <div key={ref.id} className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-v-gold/10 border border-v-gold/30 flex items-center justify-center">
                            <svg className="w-4 h-4 text-v-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                          </div>
                          <div>
                            <p className="text-sm text-v-text-primary">{anonymize(ref)}</p>
                            <p className="text-[11px] text-v-text-secondary">
                              {new Date(ref.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {(ref.status === 'rewarded' || ref.status === 'completed') && (
                            <span className="text-xs text-green-400 font-mono">+500 pts</span>
                          )}
                          {getStatusBadge(ref.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
