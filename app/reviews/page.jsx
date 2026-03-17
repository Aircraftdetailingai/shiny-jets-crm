"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell.jsx';

export default function ReviewsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }

    fetch('/api/reviews', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setReviews(data.reviews || []);
        setStats(data.stats || { total: 0, avgRating: 0, breakdown: [] });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const togglePublic = async (reviewId, currentPublic) => {
    const token = localStorage.getItem('vector_token');
    const res = await fetch(`/api/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic: !currentPublic }),
    });
    if (res.ok) {
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, isPublic: !currentPublic } : r));
    }
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 30) return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (days > 0) return `${days}d ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs > 0) return `${hrs}h ago`;
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  };

  const renderStars = (rating, size = 'w-4 h-4') => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} className={`${size} ${s <= rating ? 'text-v-gold' : 'text-white/10'}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );

  return (
    <AppShell title="Reviews">
      <div className="p-4 sm:p-8 max-w-4xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats?.total === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-v-gold/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-v-gold" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-v-text-primary mb-2">No reviews yet</h2>
            <p className="text-sm text-v-text-secondary max-w-sm mx-auto">
              After completing a job, customers will receive a review request email. Their reviews will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Stats Header */}
            <div className="bg-v-surface border border-v-border rounded-sm p-6 mb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                {/* Average Rating */}
                <div className="text-center sm:text-left">
                  <div className="text-5xl font-bold text-v-gold">{stats.avgRating}</div>
                  <div className="mt-1">{renderStars(Math.round(stats.avgRating), 'w-5 h-5')}</div>
                  <p className="text-xs text-v-text-secondary mt-1">{stats.total} review{stats.total !== 1 ? 's' : ''}</p>
                </div>

                {/* Breakdown */}
                <div className="flex-1 w-full space-y-1.5">
                  {(stats.breakdown || []).map(b => (
                    <div key={b.star} className="flex items-center gap-2">
                      <span className="text-xs text-v-text-secondary w-12">{b.star} star</span>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-v-gold rounded-full transition-all" style={{ width: `${b.percent}%` }} />
                      </div>
                      <span className="text-xs text-v-text-secondary w-8 text-right">{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reviews List */}
            <div className="space-y-3">
              {reviews.map(review => (
                <div key={review.id} className="bg-v-surface border border-v-border rounded-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        {renderStars(review.rating)}
                        <span className="text-xs text-v-text-secondary">{timeAgo(review.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-v-text-primary">{review.customerName || 'Anonymous'}</span>
                        {review.aircraft && (
                          <span className="text-xs text-v-text-secondary">— {review.aircraft}</span>
                        )}
                      </div>
                      {review.comment && (
                        <p className="text-sm text-v-text-secondary mt-1">{review.comment}</p>
                      )}
                    </div>
                    <button
                      onClick={() => togglePublic(review.id, review.isPublic)}
                      title={review.isPublic ? 'Visible on public profile — click to hide' : 'Hidden from public profile — click to show'}
                      className={`flex-shrink-0 p-1.5 rounded transition-colors ${review.isPublic ? 'text-v-gold hover:text-v-gold-dim' : 'text-white/20 hover:text-white/40'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        {review.isPublic ? (
                          <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        ) : (
                          <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
