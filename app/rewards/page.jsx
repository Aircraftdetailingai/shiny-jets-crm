"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { POINTS_PER_DOLLAR, formatPointsAsDollars } from '@/lib/points';

const CATEGORY_LABELS = {
  visibility: 'Visibility',
  subscription: 'Subscription',
  products: 'Products',
  coaching: 'Coaching',
  merch: 'Merch',
  discount: 'Discount',
};

const STATUS_STYLES = {
  pending: 'bg-transparent text-yellow-400 border border-yellow-400/30',
  processing: 'bg-transparent text-v-gold border border-v-gold/30',
  fulfilled: 'bg-transparent text-green-400 border border-green-400/30',
  completed: 'bg-transparent text-green-400 border border-green-400/30',
  cancelled: 'bg-transparent text-red-400 border border-red-400/30',
};

const TIER_COLORS = {
  free: 'text-v-text-secondary',
  pro: 'text-v-gold',
  business: 'text-v-gold',
  enterprise: 'text-v-gold',
};

export default function RewardsPage() {
  const router = useRouter();
  const [rewards, setRewards] = useState([]);
  const [points, setPoints] = useState({ available: 0, lifetime: 0 });
  const [tier, setTier] = useState('free');
  const [multiplier, setMultiplier] = useState(1.0);
  const [userCanRedeem, setUserCanRedeem] = useState(false);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(null);
  const [showConfirm, setShowConfirm] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [router]);

  const fetchData = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/rewards', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRewards(data.rewards || []);
        setPoints(data.points || { available: 0, lifetime: 0 });
        setTier(data.tier || 'free');
        setMultiplier(data.multiplier || 1.0);
        setUserCanRedeem(data.canRedeem ?? false);
        setRedemptions(data.redemptions || []);
      }
    } catch (err) {
      console.error('Failed to fetch rewards:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async (reward) => {
    setRedeeming(reward.id);
    setMessage(null);

    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/rewards/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rewardId: reward.id }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setPoints({ ...points, available: data.newBalance });
        setRedemptions([data.redemption, ...redemptions]);
        setMessage({ type: 'success', text: `Successfully redeemed ${reward.name}! We'll be in touch soon.` });
        setShowConfirm(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to redeem reward' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setRedeeming(null);
    }
  };

  if (loading) {
    return (
      <div className="page-transition min-h-screen bg-v-charcoal p-4 flex items-center justify-center">
        <div className="text-white text-xl">Loading rewards...</div>
      </div>
    );
  }

  return (
    <AppShell title="Rewards">
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        {/* Points Balance Card */}
        <div className="border border-v-gold/30 p-6 text-v-text-primary">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs uppercase tracking-widest text-v-gold mb-1">Available Points</p>
              <p className="text-4xl font-bold text-v-text-primary">{points.available.toLocaleString()}</p>
              <p className="text-v-gold-dim text-sm mt-1">
                = {formatPointsAsDollars(points.available)} redemption value
              </p>
              <p className="text-v-text-secondary text-sm mt-1">
                {points.lifetime.toLocaleString()} lifetime points earned
              </p>
            </div>
            <div className="text-right">
              <div className="text-5xl text-v-gold/30">&#9733;</div>
              {multiplier > 1 && (
                <span className="inline-block mt-2 border border-v-gold/40 text-v-gold text-xs font-bold px-2 py-1 uppercase tracking-wider">
                  {multiplier}x Multiplier
                </span>
              )}
            </div>
          </div>
          {!userCanRedeem && (
            <div className="mt-3 border-t border-v-gold/20 pt-3 text-sm text-v-text-secondary">
              Upgrade to Pro or higher to redeem rewards.{' '}
              <a href="/settings" className="text-v-gold hover:text-v-gold-dim transition-colors">Upgrade now</a>
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 ${message.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
            {message.text}
            <button onClick={() => setMessage(null)} className="float-right font-bold">&times;</button>
          </div>
        )}

        {/* Available Rewards */}
        <div>
          <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Available Rewards</h2>

          {rewards.length === 0 ? (
            <div className="p-8 text-center text-v-text-secondary">
              <p className="text-lg mb-2">No rewards available yet</p>
              <p className="text-sm">Check back soon - new rewards are added regularly!</p>
            </div>
          ) : (
            <div className="divide-y divide-v-border">
              {rewards.map((reward) => {
                const canAfford = reward.affordable;
                const eligible = reward.eligible;
                const inStock = reward.in_stock;
                const canGet = canAfford && eligible && inStock && userCanRedeem;
                return (
                  <div key={reward.id} className={`py-5 ${canGet ? '' : 'opacity-60'}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h3 className="font-semibold text-lg text-v-text-primary">{reward.name}</h3>
                          {reward.featured && (
                            <span className="text-xs text-v-gold border border-v-gold/30 px-2 py-0.5 uppercase tracking-wider">Featured</span>
                          )}
                          <span className="text-xs text-v-text-secondary border border-v-border px-2 py-0.5">
                            {CATEGORY_LABELS[reward.category] || reward.category}
                          </span>
                          {reward.min_tier && reward.min_tier !== 'free' && (
                            <span className={`text-xs ${TIER_COLORS[reward.min_tier] || ''}`}>
                              {reward.min_tier.charAt(0).toUpperCase() + reward.min_tier.slice(1)}+
                            </span>
                          )}
                        </div>
                        <p className="text-v-text-secondary text-sm">{reward.description}</p>
                        {!inStock && <p className="text-red-400 text-xs mt-1">Out of stock</p>}
                        {!eligible && <p className="text-orange-400 text-xs mt-1">Requires {reward.min_tier} tier or higher</p>}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-v-gold font-bold text-lg">{reward.points_cost.toLocaleString()} pts</p>
                        <p className="text-v-text-secondary text-xs">{formatPointsAsDollars(reward.points_cost)} value</p>
                        {canGet ? (
                          <button
                            onClick={() => setShowConfirm(reward)}
                            disabled={redeeming === reward.id}
                            className="mt-2 px-4 py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
                          >
                            {redeeming === reward.id ? 'Processing...' : 'Redeem'}
                          </button>
                        ) : canAfford ? null : (
                          <p className="mt-2 text-v-text-secondary text-sm">
                            Need {(reward.points_cost - points.available).toLocaleString()} more
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Redemption History */}
        {redemptions.length > 0 && (
          <div>
            <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Redemption History</h2>

            <div className="divide-y divide-v-border">
              {redemptions.map((r) => (
                <div key={r.id} className="py-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-v-text-primary">{r.reward_name || 'Reward'}</p>
                    <p className="text-sm text-v-text-secondary">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-v-gold font-medium">-{r.points_spent.toLocaleString()} pts</p>
                    <span className={`text-xs px-2 py-0.5 ${STATUS_STYLES[r.status] || 'text-v-text-secondary'}`}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How to Earn More */}
        <div className="border border-v-gold/20 p-6">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4">How to Earn Points</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {[
              '5 pts daily check-in',
              '10 pts per quote sent',
              '25 pts when quote accepted',
              '50 pts when quote paid',
              '50 pts for 5-star reviews',
              '500 pts per referral signup',
              '50 pts for profile completion',
              '50+ pts for login streaks',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-v-gold text-xs">&#9733;</span>
                <span className="text-v-text-secondary">{item}</span>
              </div>
            ))}
          </div>
          {multiplier > 1 && (
            <p className="mt-3 text-v-gold-dim font-medium text-sm">
              Your {tier.charAt(0).toUpperCase() + tier.slice(1)} plan gives you a {multiplier}x multiplier on all points!
            </p>
          )}
          <p className="mt-3 text-v-text-secondary text-xs">
            {POINTS_PER_DOLLAR} points = $1.00 redemption value. Points have no cash value.
          </p>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface border border-v-border p-6 w-full max-w-md">
            <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Confirm Redemption</h3>
            <p className="text-v-text-secondary mb-4">
              Redeem {showConfirm.points_cost.toLocaleString()} points for:
            </p>
            <div className="border-l-2 border-v-gold/30 pl-4 mb-4">
              <p className="font-semibold text-v-text-primary">{showConfirm.name}</p>
              <p className="text-sm text-v-text-secondary">{showConfirm.description}</p>
            </div>
            <p className="text-sm text-v-text-secondary mb-4">
              Your new balance will be {(points.available - showConfirm.points_cost).toLocaleString()} points.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="px-4 py-2 border border-v-border text-v-text-secondary hover:bg-white/5 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRedeem(showConfirm)}
                disabled={redeeming}
                className="px-5 py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
              >
                {redeeming ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
