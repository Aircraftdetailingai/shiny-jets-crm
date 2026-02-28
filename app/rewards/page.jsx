"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const CATEGORY_LABELS = {
  visibility: 'Visibility',
  subscription: 'Subscription',
  products: 'Products',
  coaching: 'Coaching',
};

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function RewardsPage() {
  const router = useRouter();
  const [rewards, setRewards] = useState([]);
  const [points, setPoints] = useState({ available: 0, lifetime: 0 });
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
      const res = await fetch('/api/rewards', {
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
      <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 flex items-center justify-center">
        <div className="text-white text-xl">{'Loading rewards...'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white max-w-4xl mx-auto">
        <div className="flex items-center space-x-2 text-2xl font-bold">
          <span>&#9992;</span>
          <span>Vector</span>
          <span className="text-lg font-medium">- {'Rewards'}</span>
        </div>
        <div className="space-x-4 text-sm">
          <a href="/dashboard" className="underline">{'Dashboard'}</a>
          <a href="/settings" className="underline">{'Settings'}</a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Points Balance Card */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-amber-100 text-sm">{'Available Points'}</p>
              <p className="text-4xl font-bold">{points.available.toLocaleString()}</p>
              <p className="text-amber-200 text-sm mt-1">
                {`${points.lifetime.toLocaleString()} lifetime points earned`}
              </p>
            </div>
            <div className="text-6xl opacity-50">&#9733;</div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
            <button onClick={() => setMessage(null)} className="float-right font-bold">&times;</button>
          </div>
        )}

        {/* Available Rewards */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold">{'Available Rewards'}</h2>
            <p className="text-gray-500 text-sm">{'Redeem your points for exclusive rewards'}</p>
          </div>

          <div className="divide-y">
            {rewards.map((reward) => {
              const canAfford = points.available >= reward.points;
              return (
                <div key={reward.id} className={`p-6 ${canAfford ? '' : 'opacity-60'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{reward.name}</h3>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {CATEGORY_LABELS[reward.category] || reward.category}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm">{reward.description}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-amber-600 font-bold text-lg">{reward.points.toLocaleString()} {'pts'}</p>
                      {canAfford ? (
                        <button
                          onClick={() => setShowConfirm(reward)}
                          disabled={redeeming === reward.id}
                          className="mt-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded hover:bg-amber-600 disabled:opacity-50"
                        >
                          {redeeming === reward.id ? 'Processing...' : 'Redeem'}
                        </button>
                      ) : (
                        <p className="mt-2 text-gray-400 text-sm">
                          {`Need ${(reward.points - points.available).toLocaleString()} more`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Redemption History */}
        {redemptions.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">{'Redemption History'}</h2>
            </div>

            <div className="divide-y">
              {redemptions.map((r) => (
                <div key={r.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{r.reward_name}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-600 font-medium">-{r.points_spent.toLocaleString()} {'pts'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[r.status] || 'bg-gray-100'}`}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How to Earn More */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">{'How to Earn More Points'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-amber-500">&#9733;</span>
              <span className="text-blue-800">{'2 points per $1 booked'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-500">&#9733;</span>
              <span className="text-blue-800">{'100 points for first payment'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-500">&#9733;</span>
              <span className="text-blue-800">{'25 points for first quote'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-500">&#9733;</span>
              <span className="text-blue-800">{'20 points per tip completed'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-500">&#9733;</span>
              <span className="text-blue-800">{'10 points for logging products'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-500">&#9733;</span>
              <span className="text-blue-800">{'50 points for profile completion'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">{'Confirm Redemption'}</h3>
            <p className="text-gray-600 mb-4">
              {`Redeem ${showConfirm.points.toLocaleString()} points for:`}
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="font-semibold">{showConfirm.name}</p>
              <p className="text-sm text-gray-500">{showConfirm.description}</p>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {`Your new balance will be ${(points.available - showConfirm.points).toLocaleString()} points.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                {'Cancel'}
              </button>
              <button
                onClick={() => handleRedeem(showConfirm)}
                disabled={redeeming}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {redeeming ? 'Processing...' : 'Confirm Redemption'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
