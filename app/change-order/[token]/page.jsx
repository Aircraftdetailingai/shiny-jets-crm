"use client";
import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

export default function ChangeOrderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = params.token;
  const actionParam = searchParams.get('action');

  const [loading, setLoading] = useState(true);
  const [changeOrder, setChangeOrder] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (token) {
      fetchChangeOrder();
    }
  }, [token]);

  // Handle payment success/cancel redirects
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    if (success === 'true') {
      setResult('approved');
      // Refresh to get updated status
      fetchChangeOrder();
    } else if (canceled === 'true') {
      setError('Payment was canceled. You can try again or decline the change order.');
    }
  }, [searchParams]);

  const fetchChangeOrder = async () => {
    try {
      const res = await fetch(`/api/change-orders/view?token=${token}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Change order not found');
        return;
      }

      setChangeOrder(data.changeOrder);
      setQuote(data.quote);

      // Auto-process if action param is present and order is pending
      if (actionParam && data.changeOrder.status === 'pending') {
        if (actionParam === 'decline') {
          handleDecline();
        }
        // For approve, we need payment first
      }
    } catch (err) {
      setError('Failed to load change order');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      // Create Stripe checkout for the change order amount
      const res = await fetch('/api/change-orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_token: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Payment failed');
        return;
      }

      // Redirect to Stripe
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError('Payment failed: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/change-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_token: token,
          action: 'decline',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to decline');
        return;
      }

      setResult('declined');
      setChangeOrder(prev => ({ ...prev, status: 'declined' }));
    } catch (err) {
      setError('Failed to decline: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-v-gold border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !changeOrder) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">&#9888;</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Error</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const isAlreadyProcessed = changeOrder?.status !== 'pending';
  const newTotal = (quote?.total_price || 0) + (changeOrder?.amount || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center text-white mb-8 pt-8">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
            <span>&#9992;</span> Vector
          </h1>
          <p className="text-blue-200 mt-2">Additional Services Request</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Status Banner */}
          {isAlreadyProcessed && (
            <div className={`p-4 text-center text-white ${
              changeOrder.status === 'approved' ? 'bg-green-500' : 'bg-red-500'
            }`}>
              <p className="font-semibold">
                This change order has been {changeOrder.status}
              </p>
            </div>
          )}

          {result && (
            <div className={`p-4 text-center text-white ${
              result === 'approved' ? 'bg-green-500' : 'bg-red-500'
            }`}>
              <p className="font-semibold">
                {result === 'approved' ? 'Payment successful! Change order approved.' : 'Change order declined.'}
              </p>
            </div>
          )}

          <div className="p-6">
            {/* Original Quote Info */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Original Quote</h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Aircraft</span>
                  <span className="font-medium">{quote?.aircraft_model || quote?.aircraft_type}</span>
                </div>
                {quote?.tail_number && (
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Tail Number</span>
                    <span className="font-medium">{quote.tail_number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Original Total</span>
                  <span className="font-semibold">{formatCurrency(quote?.total_price)}</span>
                </div>
              </div>
            </div>

            {/* Additional Services */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Additional Services Requested</h2>
              <div className="bg-v-gold/5 border border-v-gold/20 rounded-lg p-4">
                <ul className="space-y-2 mb-4">
                  {changeOrder?.services?.map((service, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span>{service.name || service.description}</span>
                      <span className="font-medium">{formatCurrency(service.amount || service.price)}</span>
                    </li>
                  ))}
                </ul>

                {changeOrder?.reason && (
                  <div className="border-t border-v-gold/20 pt-3 mt-3">
                    <p className="text-sm text-v-gold-muted">
                      <strong>Note from detailer:</strong> {changeOrder.reason}
                    </p>
                  </div>
                )}

                <div className="border-t border-v-gold/20 pt-3 mt-3">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Additional Amount</span>
                    <span className="text-v-gold-dim">{formatCurrency(changeOrder?.amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* New Total */}
            <div className="mb-8">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex justify-between text-xl font-bold">
                  <span>New Total</span>
                  <span className="text-green-600">{formatCurrency(newTotal)}</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            {!isAlreadyProcessed && !result && (
              <div className="flex gap-4">
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex-1 py-4 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {processing ? 'Processing...' : `Approve & Pay ${formatCurrency(changeOrder?.amount)}`}
                </button>
                <button
                  onClick={handleDecline}
                  disabled={processing}
                  className="flex-1 py-4 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            )}

            {/* Contact Info */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Questions? Contact your detailer at{' '}
                <a href={`mailto:${quote?.detailers?.email}`} className="text-v-gold-dim hover:underline">
                  {quote?.detailers?.email}
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
