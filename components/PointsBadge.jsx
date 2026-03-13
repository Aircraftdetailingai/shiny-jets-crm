"use client";
import { useState, useEffect } from 'react';

export default function PointsBadge() {
  const [data, setData] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const fetchPoints = async () => {
      try {
        const token = localStorage.getItem('vector_token');
        if (!token) return;

        const res = await fetch('/api/points/balance', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch points:', err);
      }
    };

    fetchPoints();
  }, []);

  if (!data || typeof data.balance !== 'number') return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center space-x-1 bg-v-gold/10 hover:bg-v-gold/20 px-3 py-1 rounded transition-colors border border-v-gold/20"
      >
        <span className="text-v-gold">&#9733;</span>
        <span className="text-v-gold font-data">{data.balance.toLocaleString()}</span>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="slide-in-right absolute right-0 top-full mt-2 w-64 bg-v-surface border border-v-border rounded z-50 overflow-hidden">
            <div className="p-4 border-b border-v-border">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-v-text-secondary uppercase tracking-wider">Available Points</p>
                  <p className="text-3xl font-data font-light text-v-gold">{data.balance.toLocaleString()}</p>
                </div>
                <span className="text-2xl text-v-gold">&#9733;</span>
              </div>
              {data.multiplier > 1 && (
                <p className="text-v-gold/60 text-xs mt-1">{data.multiplier}x multiplier active</p>
              )}
            </div>

            <div className="p-4 space-y-3">
              {data.loginStreak > 1 && (
                <div className="flex justify-between text-sm">
                  <span className="text-v-text-secondary">Login Streak</span>
                  <span className="font-data text-orange-400">{data.loginStreak} days</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-v-text-secondary">Lifetime Earned</span>
                <span className="font-data text-v-text-primary">{data.lifetime.toLocaleString()}</span>
              </div>

              {data.recentActivity && data.recentActivity.length > 0 && (
                <div className="pt-3 border-t border-v-border">
                  <p className="text-xs text-v-text-secondary mb-2">Recent Activity</p>
                  {data.recentActivity.slice(0, 3).map((activity, i) => (
                    <div key={i} className="flex justify-between text-xs py-1">
                      <span className="text-v-text-secondary">{activity.description}</span>
                      <span className={activity.final_points >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {activity.final_points >= 0 ? '+' : ''}{activity.final_points}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <a
                  href="/rewards"
                  className="flex-1 text-center text-sm bg-v-gold text-v-charcoal py-1.5 rounded hover:bg-v-gold-dim font-medium"
                >
                  Redeem Points
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
