"use client";
import { useState, useEffect } from 'react';
import { EquipmentTeaser } from './EquipmentROI';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';

export default function UpgradeModal({ isOpen, onClose, detailerId, existingServices = [] }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoResult, setPromoResult] = useState(null);
  const [promoError, setPromoError] = useState('');

  useEffect(() => {
    if (isOpen && detailerId) {
      fetchAnalysis();
    }
  }, [isOpen, detailerId]);

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/usage/analysis', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch (err) {
      console.error('Failed to fetch upgrade analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  const validatePromo = async (code) => {
    if (!code.trim()) {
      setPromoResult(null);
      setPromoError('');
      return;
    }
    setPromoValidating(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setPromoResult(data);
      } else {
        setPromoError(data.error || 'Invalid promo code');
      }
    } catch (err) {
      setPromoError('Failed to validate code');
    } finally {
      setPromoValidating(false);
    }
  };

  const handleUpgrade = () => {
    if (!analysis?.nextTier) return;
    const planUrls = {
      pro: 'https://shinyjets.com/products/aircraft-detailing-crm-pro',
      business: 'https://shinyjets.com/products/aircraft-detailing-crm-business',
      enterprise: 'https://shinyjets.com/products/aircraft-detailing-crm-enterprise',
    };
    const url = planUrls[analysis.nextTier];
    if (url) {
      try {
        const user = JSON.parse(localStorage.getItem('vector_user') || '{}');
        const email = user.email || '';
        window.open(`${url}?email=${encodeURIComponent(email)}`, '_blank');
      } catch {
        window.open(url, '_blank');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="modal-content bg-v-surface rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full sm:max-w-lg shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-v-gold border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-v-text-secondary">{'Analyzing your usage...'}</p>
          </div>
        ) : analysis ? (
          <>
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-v-text-primary">
                  {analysis.recommendation === 'strong' ? `🚀 ${'Time to Upgrade!'}` :
                   analysis.recommendation === 'moderate' ? `📈 ${'Consider Upgrading'}` :
                   `✨ ${'Your Plan Status'}`}
                </h2>
                <p className="text-sm text-v-text-secondary mt-1">
                  {'Current plan:'} <span className="font-medium capitalize">{analysis.currentTier}</span>
                </p>
              </div>
              <button onClick={onClose} className="text-v-text-secondary hover:text-v-text-secondary text-2xl">
                &times;
              </button>
            </div>

            {/* AI Message */}
            <div className={`p-4 rounded-lg mb-6 ${
              analysis.urgency === 'high' ? 'bg-red-50 border border-red-200' :
              analysis.urgency === 'medium' ? 'bg-v-gold/5 border border-v-gold/20' :
              'bg-blue-50 border border-blue-200'
            }`}>
              <p className={`font-medium ${
                analysis.urgency === 'high' ? 'text-red-800' :
                analysis.urgency === 'medium' ? 'text-v-gold-muted' :
                'text-blue-800'
              }`}>
                {analysis.message}
              </p>
            </div>

            {/* Usage Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-v-charcoal p-3 rounded-lg">
                <p className="text-xs sm:text-sm text-v-text-secondary uppercase tracking-wide">{'Quotes This Month'}</p>
                <p className="text-2xl font-bold">
                  {analysis.stats.quotesThisMonth}
                  <span className="text-sm font-normal text-v-text-secondary">
                    /{analysis.stats.quotesLimit === Infinity ? '∞' : analysis.stats.quotesLimit}
                  </span>
                </p>
                {analysis.quotesUsedPercent >= 80 && (
                  <div className="mt-2">
                    <div className="h-2 bg-v-border rounded-full overflow-hidden">
                      <div
                        className={`h-full ${analysis.quotesUsedPercent >= 100 ? 'bg-red-500' : 'bg-v-gold'}`}
                        style={{ width: `${Math.min(100, analysis.quotesUsedPercent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-v-charcoal p-3 rounded-lg">
                <p className="text-xs text-v-text-secondary uppercase tracking-wide">{'Avg Monthly Revenue'}</p>
                <p className="text-2xl font-bold">${analysis.stats.avgMonthlyRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-v-charcoal p-3 rounded-lg">
                <p className="text-xs text-v-text-secondary uppercase tracking-wide">{'Current Fee Rate'}</p>
                <p className="text-2xl font-bold">{(analysis.stats.feeRate * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-v-charcoal p-3 rounded-lg">
                <p className="text-xs text-v-text-secondary uppercase tracking-wide">{'Fees This Month'}</p>
                <p className="text-2xl font-bold">{currencySymbol()}{formatPrice(analysis.stats.feesThisMonth)}</p>
              </div>
            </div>

            {/* Upgrade Comparison */}
            {analysis.nextTier && analysis.savings && (
              <div className="border rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="font-semibold text-lg">{analysis.savings.nextTierName}</p>
                    <p className="text-v-text-secondary">${analysis.savings.nextTierPrice}{'/month'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-v-text-secondary">{'Platform fee'}</p>
                    <p className="font-bold text-green-600">
                      {(analysis.savings.targetMonthlyFees / analysis.stats.avgMonthlyRevenue * 100).toFixed(0)}%
                      <span className="text-v-text-secondary text-sm ml-1">
                        (vs {(analysis.stats.feeRate * 100).toFixed(0)}%)
                      </span>
                    </p>
                  </div>
                </div>

                {analysis.savings.netMonthlySavings > 0 ? (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-green-800 font-medium">
                        {'You\'d save'} <span className="text-xl font-bold">{currencySymbol()}{formatPrice(analysis.savings.netMonthlySavings)}</span>{'/month'}
                      </p>
                      <p className="text-green-600 text-sm">
                        That's ${formatPrice(analysis.savings.netMonthlySavings * 12)}{'/year'}!
                      </p>
                    </div>
                    {/* Equipment ROI Teaser */}
                    <EquipmentTeaser
                      monthlySavings={analysis.savings.netMonthlySavings}
                      existingServices={existingServices}
                    />
                  </>
                ) : (
                  <div className="bg-v-charcoal rounded-lg p-3 text-center">
                    <p className="text-v-text-secondary text-sm">
                      {'Upgrade pays for itself at'} ${formatPriceWhole(analysis.savings.breakevenRevenue)}{'/month'} {'revenue'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Promo Code */}
            {analysis.nextTier && (
              <div className="mb-4">
                <button
                  onClick={() => setShowPromo(!showPromo)}
                  className="text-sm text-v-text-secondary hover:text-v-text-primary transition-colors"
                >
                  {showPromo ? `- ${'Hide promo code'}` : `+ ${'Have a promo code?'}`}
                </button>
                {showPromo && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase());
                        setPromoResult(null);
                        setPromoError('');
                      }}
                      onBlur={() => validatePromo(promoCode)}
                      onKeyDown={(e) => e.key === 'Enter' && validatePromo(promoCode)}
                      placeholder={'Enter code'}
                      className="px-3 py-1.5 bg-v-surface border border-v-border rounded text-sm w-36 text-v-text-primary focus:border-v-gold outline-none"
                    />
                    {promoValidating && (
                      <span className="text-xs text-v-text-secondary">{'Checking...'}</span>
                    )}
                    {promoResult && (
                      <span className="text-xs text-green-600 font-medium">
                        {promoResult.code}: {promoResult.description}
                      </span>
                    )}
                    {promoError && (
                      <span className="text-xs text-red-500">{promoError}</span>
                    )}
                  </div>
                )}
                {promoResult?.min_months > 0 && (
                  <p className="text-xs text-v-text-secondary mt-1">
                    {promoResult.min_months} month minimum commitment required
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-v-border rounded-lg text-v-text-secondary hover:bg-v-surface-light/30"
              >
                {'Maybe Later'}
              </button>
              {analysis.nextTier && (
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  className="flex-1 px-4 py-3 bg-v-gold hover:bg-v-gold-dim text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {upgrading ? 'Processing...' : `${'Upgrade to'} ${analysis.savings?.nextTierName}`}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-red-500">{'Failed to load report'}</p>
            <button onClick={onClose} className="mt-4 text-v-text-secondary underline">{'Close'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
