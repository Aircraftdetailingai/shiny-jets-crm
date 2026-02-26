"use client";
import { useState, useEffect } from 'react';

export default function PointsBadge() {
  const [points, setPoints] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const fetchPoints = async () => {
      try {
        const token = localStorage.getItem('vector_token');
        if (!token) return;

        const res = await fetch('/api/points', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPoints(data);
        }
      } catch (err) {
        console.error('Failed to fetch points:', err);
      }
    };

    fetchPoints();
  }, []);

  // Don't render if no points data or missing required fields
  if (!points || typeof points.total !== 'number') return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center space-x-1 bg-amber-500/20 hover:bg-amber-500/30 px-3 py-1 rounded-full transition-colors"
      >
        <span className="text-amber-400">&#9733;</span>
        <span className="text-amber-300 font-semibold">{(points.total || 0).toLocaleString()}</span>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="slide-in-right absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-4 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm opacity-90">Available Points</p>
                  <p className="text-3xl font-bold">{(points.total || 0).toLocaleString()}</p>
                </div>
                <span className="text-3xl">&#9733;</span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">This Week</span>
                <span className="font-medium text-green-600">+{points.thisWeek || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Lifetime Earned</span>
                <span className="font-medium text-gray-900">{(points.lifetime || 0).toLocaleString()}</span>
              </div>

              {points.recentActivity && points.recentActivity.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-gray-500 mb-2">Recent Activity</p>
                  {points.recentActivity.slice(0, 3).map((activity, i) => (
                    <div key={i} className="flex justify-between text-xs py-1">
                      <span className="text-gray-600">{activity.description}</span>
                      <span className="text-green-600">+{activity.points}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <a
                  href="/rewards"
                  className="flex-1 text-center text-sm bg-amber-500 text-white py-1.5 rounded hover:bg-amber-600 font-medium"
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
