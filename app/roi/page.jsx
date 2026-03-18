"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ROIDashboard from '@/components/ROIDashboard';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ROIPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTestimonial, setShowTestimonial] = useState(false);
  const [testimonialData, setTestimonialData] = useState(null);
  const [rating, setRating] = useState(0);
  const [testimonialText, setTestimonialText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('vector_user'); router.push('/login'); return; }
    setLoading(false);

    // Check for testimonial prompt
    checkTestimonial(token);
  }, [router]);

  const checkTestimonial = async (token) => {
    try {
      const res = await fetch('/api/testimonials', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTestimonialData(data);
        if (data.showPrompt) {
          setShowTestimonial(true);
        }
      }
    } catch (err) {
      console.error('Failed to check testimonial:', err);
    }
  };

  const submitTestimonial = async () => {
    if (rating === 0) return;
    setSubmitting(true);

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating,
          text: testimonialText,
          milestone: testimonialData?.currentMilestone,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Thank you! You earned ${data.pointsAwarded} bonus points!`);
        setShowTestimonial(false);
      }
    } catch (err) {
      alert('Failed to submit testimonial');
    } finally {
      setSubmitting(false);
    }
  };

  const dismissTestimonial = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/testimonials', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Ignore
    }
    setShowTestimonial(false);
  };

  const getMilestoneText = (milestone) => {
    const texts = {
      first_10k: "You've booked $10K through Vector!",
      first_25k: "You've booked $25K through Vector!",
      first_50k: "You've hit $50K booked through Vector!",
      first_100k: "Amazing! $100K booked through Vector!",
      time_saved_100h: "You've saved 100+ hours with Vector!",
      one_year: "Happy 1 year anniversary with Vector!",
    };
    return texts[milestone] || "You're crushing it with Vector!";
  };

  if (loading) {
    return <LoadingSpinner message="Loading ROI data..." />;
  }

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-v-gold">←</a>
          <h1 className="text-2xl font-bold">ROI Dashboard</h1>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <a href="/dashboard" className="underline">Dashboard</a>
          <a href="/quotes" className="underline">Quotes</a>
          <a href="/settings" className="underline">Settings</a>
        </div>
      </header>

      {/* Testimonial Prompt Modal */}
      {showTestimonial && testimonialData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-v-surface rounded-t-2xl sm:rounded-xl p-5 sm:p-6 sm:max-w-md w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <span className="text-5xl">🎉</span>
              <h2 className="text-xl font-bold text-v-text-primary mt-2">
                {getMilestoneText(testimonialData.currentMilestone)}
              </h2>
              <p className="text-v-text-secondary mt-1">
                Would you share a quick testimonial?
              </p>
            </div>

            {/* Star Rating */}
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`text-3xl transition-transform hover:scale-110 ${
                    star <= rating ? 'text-v-gold' : 'text-gray-300'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            {/* Optional Text */}
            <textarea
              value={testimonialText}
              onChange={(e) => setTestimonialText(e.target.value)}
              placeholder="Tell us what you love about Vector... (optional)"
              className="w-full border rounded-lg px-3 py-2 mb-4"
              rows={3}
            />

            <div className="bg-v-gold-muted/20 border border-v-gold/20 rounded-lg p-3 mb-4 text-center">
              <p className="text-v-gold-muted text-sm">
                <strong>+{testimonialText ? 200 : 100} bonus points</strong> for sharing!
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={dismissTestimonial}
                className="flex-1 px-4 py-2 border rounded-lg text-v-text-secondary hover:bg-white/5"
              >
                Maybe Later
              </button>
              <button
                onClick={submitTestimonial}
                disabled={rating === 0 || submitting}
                className="flex-1 px-4 py-2 bg-v-gold-muted/200 text-white rounded-lg font-medium hover:bg-v-gold-dim disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-4xl mx-auto">
        <ROIDashboard compact={false} />
      </div>
    </div>
  );
}
