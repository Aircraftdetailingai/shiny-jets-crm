"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import QuoteRequestFlow from '@/components/QuoteRequestFlow';

export default function QuoteRequestPage() {
  const params = useParams();
  const detailerId = params.detailerId;
  const [detailer, setDetailer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/lead-intake/widget?detailer_id=${detailerId}`)
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then(d => setDetailer(d.detailer))
      .catch(() => setError('Detailer not found'))
      .finally(() => setLoading(false));
  }, [detailerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center text-white/60 text-sm">
        {error}
      </div>
    );
  }

  return (
    <QuoteRequestFlow
      detailerId={detailerId}
      detailerName={detailer?.name}
      detailerLogo={detailer?.logo}
      detailerPlan={detailer?.plan || 'free'}
    />
  );
}
