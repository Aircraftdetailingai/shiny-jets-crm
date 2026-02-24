"use client";
import { useState, useEffect, useCallback } from 'react';
import UpgradeModal from './UpgradeModal';

// Hook to check quote limits before creating quotes
export function useQuoteLimits() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const fetchUsage = useCallback(async () => {
    try {
      const token = localStorage.getItem('vector_token');
      if (!token) return;

      const res = await fetch('/api/usage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Check if user can create a quote
  const canCreateQuote = useCallback(() => {
    if (!usage) return true; // Allow if we don't have usage data yet
    return usage.quotesRemaining > 0;
  }, [usage]);

  // Call before creating a quote
  const checkQuoteLimit = useCallback(() => {
    if (!canCreateQuote()) {
      setShowUpgradeModal(true);
      return false;
    }
    return true;
  }, [canCreateQuote]);

  // Refresh usage after creating a quote
  const refreshUsage = useCallback(() => {
    fetchUsage();
  }, [fetchUsage]);

  return {
    usage,
    loading,
    canCreateQuote: canCreateQuote(),
    checkQuoteLimit,
    refreshUsage,
    showUpgradeModal,
    setShowUpgradeModal,
    quotesRemaining: usage?.quotesRemaining ?? Infinity,
    quotesUsed: usage?.quotesThisMonth ?? 0,
    quotesLimit: usage?.quotesLimit ?? Infinity,
  };
}

// Wrapper component that adds limit checking to any quote form
export default function QuoteFormWithLimits({ children, onQuoteCreated }) {
  const {
    usage,
    loading,
    canCreateQuote,
    checkQuoteLimit,
    refreshUsage,
    showUpgradeModal,
    setShowUpgradeModal,
    quotesRemaining,
    quotesLimit,
  } = useQuoteLimits();

  const user = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('vector_user') || '{}')
    : {};

  // Show usage banner
  const showUsageBanner = usage && quotesLimit !== Infinity && quotesRemaining <= 5;

  const handleQuoteCreated = useCallback(() => {
    refreshUsage();
    if (onQuoteCreated) {
      onQuoteCreated();
    }
  }, [refreshUsage, onQuoteCreated]);

  return (
    <>
      {/* Usage Warning Banner */}
      {showUsageBanner && (
        <div className={`mb-4 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          quotesRemaining === 0
            ? 'bg-red-100 border border-red-300'
            : 'bg-amber-100 border border-amber-300'
        }`}>
          <div className="flex items-center">
            <span className={`text-lg sm:text-xl mr-3 ${quotesRemaining === 0 ? 'text-red-500' : 'text-amber-500'}`}>
              {quotesRemaining === 0 ? '⚠️' : '📊'}
            </span>
            <div>
              <p className={`font-medium text-sm sm:text-base ${quotesRemaining === 0 ? 'text-red-800' : 'text-amber-800'}`}>
                {quotesRemaining === 0
                  ? 'Quote limit reached!'
                  : `${quotesRemaining} quote${quotesRemaining === 1 ? '' : 's'} remaining this month`}
              </p>
              <p className={`text-xs sm:text-sm ${quotesRemaining === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                {quotesRemaining === 0
                  ? 'Upgrade to continue sending quotes'
                  : `You've used ${usage.quotesThisMonth} of ${quotesLimit} quotes`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowUpgradeModal(true)}
            className={`px-4 py-3 rounded-lg font-medium min-h-[44px] whitespace-nowrap ${
              quotesRemaining === 0
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Pass limit check to children */}
      {typeof children === 'function'
        ? children({
            canCreateQuote,
            checkQuoteLimit,
            onQuoteCreated: handleQuoteCreated,
            quotesRemaining,
            loading,
          })
        : children}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        detailerId={user?.id}
      />
    </>
  );
}

// Simple usage display component
export function UsageDisplay({ className = '' }) {
  const { usage, loading, quotesRemaining, quotesLimit } = useQuoteLimits();

  if (loading || !usage) return null;
  if (quotesLimit === Infinity) return null;

  const percentage = (usage.quotesThisMonth / quotesLimit) * 100;

  return (
    <div className={`text-sm ${className}`}>
      <div className="flex justify-between text-gray-600 mb-1">
        <span>Quotes this month</span>
        <span className="font-medium">{usage.quotesThisMonth}/{quotesLimit}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            percentage >= 100 ? 'bg-red-500' :
            percentage >= 80 ? 'bg-amber-500' :
            'bg-green-500'
          }`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  );
}
