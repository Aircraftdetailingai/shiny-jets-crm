"use client";
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

const CONFIDENCE_STYLES = {
  estimated: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Estimated' },
  learning: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Learning' },
  good: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Good data' },
  confident: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Confident' },
};

function ConfidenceBadge({ confidence }) {
  const style = CONFIDENCE_STYLES[confidence.level] || CONFIDENCE_STYLES.estimated;
  const stars = confidence.stars || 0;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${style.bg} ${style.text}`}>
      {stars > 0 && <span>{'✦'.repeat(stars)}</span>}
      {style.label}
    </span>
  );
}

export default function LogProductsPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [jobData, setJobData] = useState(null);
  const [serviceGroups, setServiceGroups] = useState([]);
  const [quantities, setQuantities] = useState({});

  useEffect(() => {
    fetchJobProducts();
  }, [jobId]);

  const fetchJobProducts = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      if (!token) { router.push('/login'); return; }

      const res = await fetch(`/api/inventory/job-products?job_id=${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load job products');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setJobData(data.job);
      setServiceGroups(data.service_groups || []);

      // Pre-fill quantities with actual (if previously logged) or estimated
      const initial = {};
      for (const group of (data.service_groups || [])) {
        for (const item of group.products) {
          const key = `${item.product_id}|${item.service_id}`;
          initial[key] = item.actual_quantity !== null
            ? String(item.actual_quantity)
            : String(item.estimated_quantity || '');
        }
      }
      setQuantities(initial);

      if (data.already_logged) {
        setSubmitted(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (productId, serviceId, value) => {
    const key = `${productId}|${serviceId}`;
    setQuantities(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('vector_token');
      const entries = [];

      for (const group of serviceGroups) {
        for (const item of group.products) {
          const key = `${item.product_id}|${item.service_id}`;
          const qty = parseFloat(quantities[key]);
          if (qty > 0) {
            entries.push({
              product_id: item.product_id,
              service_id: item.service_id,
              quantity_used: qty,
              unit: item.unit,
            });
          }
        }
      }

      if (entries.length === 0) {
        setError('Please enter at least one product quantity');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/inventory/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId, entries }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to log usage');
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-v-text-secondary text-sm">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error && !jobData) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
        <div className="bg-v-surface rounded-xl p-6 max-w-md w-full text-center">
          <div className="text-4xl mb-3">!</div>
          <p className="text-v-text-primary font-medium mb-2">Could not load job</p>
          <p className="text-v-text-secondary text-sm mb-4">{error}</p>
          <button onClick={() => router.back()} className="px-4 py-2 bg-v-gold text-white rounded-lg text-sm">Go Back</button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
        <div className="bg-v-surface rounded-xl p-6 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-v-text-primary font-semibold text-lg mb-1">Products Logged</p>
          <p className="text-v-text-secondary text-sm mb-6">
            Usage recorded for {jobData?.aircraft_model || 'this job'}. Inventory has been updated.
          </p>
          <div className="flex gap-3">
            <button onClick={() => { setSubmitted(false); fetchJobProducts(); }} className="flex-1 py-2.5 border border-v-border rounded-lg text-v-text-secondary text-sm hover:bg-white/5">
              Edit
            </button>
            <button onClick={() => router.push('/dashboard')} className="flex-1 py-2.5 bg-v-gold text-white rounded-lg text-sm hover:bg-v-gold-dim">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v-charcoal pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-v-surface border-b border-v-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-v-text-secondary hover:text-v-text-primary text-xl">&larr;</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-v-text-primary font-semibold text-base truncate">Log Products Used</h1>
            <p className="text-v-text-secondary text-xs truncate">
              {jobData?.client_name} &middot; {jobData?.aircraft_model || jobData?.aircraft_type}
            </p>
          </div>
          <span className={`px-2 py-1 rounded text-[10px] uppercase ${
            jobData?.status === 'completed' ? 'bg-purple-500/20 text-purple-400' :
            jobData?.status === 'in_progress' ? 'bg-amber-500/20 text-amber-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            {jobData?.status?.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Service Groups */}
      <div className="px-4 pt-4 space-y-4">
        {serviceGroups.length === 0 ? (
          <div className="bg-v-surface rounded-xl p-6 text-center">
            <p className="text-v-text-secondary text-sm">No products assigned to this job's services.</p>
            <p className="text-v-text-secondary text-xs mt-1">Assign products to services in Settings &rarr; Services.</p>
          </div>
        ) : (
          serviceGroups.map((group) => (
            <div key={group.service_id} className="bg-v-surface rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-v-border">
                <h2 className="text-v-text-primary font-medium text-sm">{group.service_name}</h2>
              </div>
              <div className="divide-y divide-v-border">
                {group.products.map((item) => {
                  const key = `${item.product_id}|${item.service_id}`;
                  return (
                    <div key={key} className="px-4 py-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-v-text-primary text-sm font-medium truncate">{item.product_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.product_brand && <span className="text-v-text-secondary text-[10px]">{item.product_brand}</span>}
                            <ConfidenceBadge confidence={item.confidence} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-v-text-secondary text-[10px]">Stock: {item.current_stock} {item.unit}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min="0"
                            value={quantities[key] || ''}
                            onChange={(e) => handleQuantityChange(item.product_id, item.service_id, e.target.value)}
                            placeholder={String(item.estimated_quantity)}
                            className="w-full bg-v-charcoal border border-v-border rounded-lg px-3 py-2.5 text-v-text-primary text-sm focus:border-v-gold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        <span className="text-v-text-secondary text-sm w-12">{item.unit}</span>
                        {item.estimated_quantity > 0 && (
                          <button
                            onClick={() => handleQuantityChange(item.product_id, item.service_id, String(item.estimated_quantity))}
                            className="px-2 py-2 text-[10px] text-v-gold border border-v-gold/30 rounded-lg hover:bg-v-gold/10"
                            title="Use estimated"
                          >
                            Est.
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Submit Button - Fixed Bottom */}
      {serviceGroups.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-v-surface border-t border-v-border">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3.5 bg-v-gold text-white rounded-xl font-medium text-sm hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Logging...' : 'Log Product Usage'}
          </button>
        </div>
      )}
    </div>
  );
}
