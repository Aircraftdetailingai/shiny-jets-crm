"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function DetailerProfilePage() {
  const { id } = useParams();
  const [detailer, setDetailer] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/detailers/${id}/profile`)
      .then(r => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then(data => {
        if (data) {
          setDetailer(data.detailer);
          setReviews(data.reviews || []);
          setStats(data.stats || { total: 0, avgRating: 0 });
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const renderStars = (rating, size = 'w-5 h-5') => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} className={`${size} ${s <= Math.round(rating) ? 'text-amber-400' : 'text-white/10'}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 30) return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (days > 0) return `${days}d ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs > 0) return `${hrs}h ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Detailer Not Found</h1>
          <p className="text-gray-400 mb-6">This profile is not available.</p>
          <a href="/find-a-detailer" className="text-amber-400 hover:text-amber-300 text-sm">Browse all detailers</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center space-x-2 text-white text-xl font-bold">
            <span className="text-2xl">{'\u2708\uFE0F'}</span>
            <span>Vector</span>
          </a>
          <div className="flex items-center space-x-4">
            <a href="/find-a-detailer" className="text-gray-300 hover:text-white text-sm transition-colors">Directory</a>
            <a href="/login" className="text-gray-300 hover:text-white text-sm transition-colors">Sign In</a>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-20">
        {/* Profile Header */}
        <div className="p-6 rounded-xl bg-white/[0.03] border border-white/5 mb-6">
          <div className="flex items-start gap-5">
            {detailer?.logoUrl ? (
              <img src={detailer.logoUrl} alt="" className="w-16 h-16 rounded-lg object-contain bg-white/5 p-1" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-amber-500/10 flex items-center justify-center text-2xl">
                {'\u2708\uFE0F'}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{detailer?.company || detailer?.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-400">
                {detailer?.country && <span>{detailer.country}</span>}
                {detailer?.homeAirport && <span>{'\u2708\uFE0F'} {detailer.homeAirport}</span>}
              </div>
              {stats?.total > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  {renderStars(stats.avgRating)}
                  <span className="text-amber-400 font-semibold">{stats.avgRating}</span>
                  <span className="text-gray-500 text-sm">({stats.total} review{stats.total !== 1 ? 's' : ''})</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-5">
            <a
              href={`/quote-request/${id}`}
              className="inline-block px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              Request a Quote
            </a>
          </div>
        </div>

        {/* Reviews */}
        {reviews.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Recent Reviews</h2>
            <div className="space-y-3">
              {reviews.map(review => (
                <div key={review.id} className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {renderStars(review.rating, 'w-4 h-4')}
                      <span className="text-sm font-medium text-white">
                        {review.customerName ? review.customerName.split(' ')[0] : 'Customer'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{timeAgo(review.createdAt)}</span>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-gray-400 mt-1">{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {reviews.length === 0 && stats?.total === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No reviews yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
