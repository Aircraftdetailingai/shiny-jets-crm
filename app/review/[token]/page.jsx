"use client";
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

export default function ReviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token;
  const preselectedRating = parseInt(searchParams.get('r')) || 0;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [detailer, setDetailer] = useState(null);
  const [rating, setRating] = useState(preselectedRating >= 1 && preselectedRating <= 5 ? preselectedRating : 0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // Apply detailer branding
  useEffect(() => {
    if (!detailer) return;
    const s = document.documentElement.style;
    s.setProperty('--brand-primary', detailer.theme_primary || '#007CB1');
    s.setProperty('--brand-accent', detailer.theme_accent || '#0D1B2A');
    s.setProperty('--brand-bg', detailer.theme_bg || '#0A0E17');
    s.setProperty('--brand-surface', detailer.theme_surface || '#111827');
    return () => {
      s.removeProperty('--brand-primary');
      s.removeProperty('--brand-accent');
      s.removeProperty('--brand-bg');
      s.removeProperty('--brand-surface');
    };
  }, [detailer]);

  // Load custom fonts
  useEffect(() => {
    if (!detailer?.font_embed_url) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = detailer.font_embed_url;
    document.head.appendChild(link);
    return () => link.remove();
  }, [detailer?.font_embed_url]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/feedback?token=${token}`);
        const data = await res.json();
        if (!res.ok) {
          if (data.alreadySubmitted) {
            setAlreadySubmitted(true);
          } else {
            setError(data.error || 'Invalid review link');
          }
          return;
        }
        setQuote(data.quote);
        setDetailer(data.detailer);
      } catch {
        setError('Failed to load review form');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, comment }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit review');
      }
    } catch {
      setError('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const starLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
  const brandPrimary = detailer?.theme_primary || '#007CB1';
  const brandBg = detailer?.theme_bg || '#0A0E17';
  const brandSurface = detailer?.theme_surface || '#111827';
  const fontHeading = detailer?.font_heading || 'Playfair Display, serif';
  const fontBody = detailer?.font_body || 'Inter, sans-serif';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: brandBg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-white/20 rounded-full animate-spin" style={{ borderTopColor: brandPrimary }} />
          <p className="text-white/60 text-sm" style={{ fontFamily: fontBody }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: brandBg }}>
        <div className="max-w-md w-full rounded-2xl p-8 text-center border border-white/10" style={{ background: brandSurface }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${brandPrimary}20` }}>
            <svg className="w-8 h-8" style={{ color: brandPrimary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: fontHeading }}>Already Submitted</h1>
          <p className="text-white/60">You&apos;ve already submitted a review for this service. Thank you!</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: brandBg }}>
        <div className="max-w-md w-full rounded-2xl p-8 text-center border border-white/10" style={{ background: brandSurface }}>
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: fontHeading }}>Oops</h1>
          <p className="text-white/60">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: brandBg }}>
        <div className="max-w-md w-full rounded-2xl p-8 text-center border border-white/10" style={{ background: brandSurface }}>
          {detailer?.logo_url && (
            <img src={detailer.logo_url} alt="" className="h-10 mx-auto mb-6 object-contain" />
          )}
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${brandPrimary}20` }}>
            <svg className="w-8 h-8" style={{ color: brandPrimary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: fontHeading }}>Thank You!</h1>
          <p className="text-white/60 mb-2">Your review has been submitted successfully.</p>
          {rating >= 4 && (
            <p className="text-sm text-white/40">We&apos;re glad you had a great experience!</p>
          )}
          {rating <= 2 && (
            <p className="text-sm text-white/40">We appreciate your honest feedback and will work to improve.</p>
          )}
          <div className="flex justify-center gap-1 mt-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg key={star} className="w-6 h-6" style={{ color: star <= rating ? brandPrimary : '#374151' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: brandBg, fontFamily: fontBody }}>
      <div className="max-w-md w-full rounded-2xl overflow-hidden border border-white/10" style={{ background: brandSurface }}>
        {/* Header */}
        <div className="px-6 py-6 text-center" style={{ background: `${brandPrimary}10`, borderBottom: `1px solid ${brandPrimary}20` }}>
          {detailer?.logo_url && (
            <img src={detailer.logo_url} alt="" className="h-10 mx-auto mb-4 object-contain" />
          )}
          <h1 className="text-xl font-bold text-white" style={{ fontFamily: fontHeading }}>
            How was your experience?
          </h1>
          {detailer?.company && (
            <p className="text-sm mt-1" style={{ color: `${brandPrimary}CC` }}>with {detailer.company}</p>
          )}
        </div>

        <div className="p-6">
          {/* Service context */}
          <div className="rounded-lg p-4 mb-6 border border-white/5" style={{ background: `${brandBg}` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider">Aircraft</p>
                <p className="font-semibold text-white">{quote?.aircraft}</p>
              </div>
              {quote?.clientName && (
                <div className="text-right">
                  <p className="text-xs text-white/40 uppercase tracking-wider">Customer</p>
                  <p className="font-semibold text-white">{quote.clientName}</p>
                </div>
              )}
            </div>
          </div>

          {/* Star rating */}
          <div className="text-center mb-6">
            <p className="text-sm text-white/50 mb-3">Tap a star to rate</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <svg
                    className="w-10 h-10 transition-colors"
                    style={{ color: star <= (hoveredRating || rating) ? brandPrimary : '#374151' }}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>
            {(hoveredRating || rating) > 0 && (
              <p className="text-sm font-medium mt-2" style={{ color: brandPrimary }}>
                {starLabels[hoveredRating || rating]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/70 mb-1">
              Tell us more <span className="text-white/30 font-normal">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              rows={3}
              maxLength={1000}
              className="w-full px-3 py-2 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 outline-none resize-none text-sm"
              style={{ background: brandBg, focusRingColor: brandPrimary }}
            />
            <p className="text-xs text-white/30 text-right mt-1">{comment.length}/1000</p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="w-full py-3 rounded-lg font-semibold text-sm uppercase tracking-wider transition-all"
            style={{
              background: rating === 0 ? '#374151' : brandPrimary,
              color: rating === 0 ? '#6b7280' : brandBg,
              cursor: rating === 0 ? 'not-allowed' : submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="text-xs text-white/20">
            Powered by <span className="font-medium">Shiny Jets</span>
          </p>
        </div>
      </div>
    </div>
  );
}
