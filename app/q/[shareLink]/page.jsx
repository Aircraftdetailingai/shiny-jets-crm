"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';
import { formatPrice } from '@/lib/formatPrice';
import { getCurrencySymbol } from '@/lib/currency';

// Friendly error messages for payment declines
const PAYMENT_ERROR_MESSAGES = {
  card_declined: "Your card was declined. Please try a different card.",
  insufficient_funds: "Insufficient funds. Please try a different card.",
  expired_card: "Your card has expired. Please use a different card.",
  incorrect_cvc: "Incorrect security code. Please check and try again.",
  processing_error: "Processing error. Please try again in a moment.",
  generic_decline: "Your card was declined. Please try a different card.",
  default: "Payment could not be processed. Please check your card details and try again."
};

export default function QuoteViewPage() {
  const params = useParams();
  const [quote, setQuote] = useState(null);
  const [detailer, setDetailer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [tipsSent, setTipsSent] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const res = await fetch(`/api/quotes/view/${params.shareLink}`);
        if (!res.ok) {
          throw new Error('Quote not found');
        }
        const data = await res.json();
        setQuote(data.quote);
        setDetailer(data.detailer);
        setStripeConnected(data.stripe_connected !== false);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (params.shareLink) {
      fetchQuote();
    }
  }, [params.shareLink]);

  const sym = getCurrencySymbol(detailer?.preferred_currency || 'USD');
  const isExpired = quote && new Date() > new Date(quote.valid_until);
  const isPaid = quote && (quote.status === 'paid' || quote.status === 'approved');

  const handlePayment = async () => {
    setPaymentError('');
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id, shareLink: params.shareLink, agreedToTermsAt: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Handle specific error codes
        const errorCode = data.code || 'default';
        const message = PAYMENT_ERROR_MESSAGES[errorCode] || PAYMENT_ERROR_MESSAGES.default;
        setPaymentError(message);
        return;
      }
      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setPaymentError(PAYMENT_ERROR_MESSAGES.default);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleRequestNewQuote = async () => {
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/quotes/request-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalQuoteId: quote.id, shareLink: params.shareLink }),
      });
      if (res.ok) {
        setRequestSent(true);
      }
    } catch (err) {
      setError('Failed to request new quote');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleSendTips = async () => {
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/quotes/send-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id, shareLink: params.shareLink }),
      });
      if (res.ok) {
        setTipsSent(true);
      }
    } catch (err) {
      // Silently fail
    } finally {
      setPaymentLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatServices = (services) => {
    if (!services) return [];
    const labels = {
      exterior: 'Exterior Wash & Detail',
      interior: 'Interior Detail',
      brightwork: 'Brightwork Polish',
      ceramic: 'Ceramic Coating',
      engine: 'Engine Detail',
    };
    return Object.entries(services)
      .filter(([key, value]) => value === true)
      .map(([key]) => labels[key] || key);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
        <div className="text-white text-xl">Loading quote...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Quote Not Found</h1>
          <p className="text-gray-600">This quote link may be invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  // EXPIRED QUOTE VIEW
  if (isExpired && !isPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
          <div className="text-center">
            <div className="text-amber-500 text-5xl mb-4">&#9200;</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">This Quote Has Expired</h1>
            <p className="text-gray-600 mb-6">
              This quote expired on {formatDate(quote.valid_until)}.
            </p>

            {!requestSent ? (
              <>
                <p className="text-gray-700 mb-4">Would you like to request an updated quote?</p>
                <button
                  onClick={handleRequestNewQuote}
                  disabled={paymentLoading}
                  className="w-full py-3 rounded-lg text-white font-medium bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 disabled:opacity-50 mb-4"
                >
                  {paymentLoading ? 'Requesting...' : 'Request New Quote'}
                </button>
              </>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-green-800 font-medium">Quote request sent!</p>
                <p className="text-green-700 text-sm">{detailer?.company || 'The detailer'} will send you an updated quote soon.</p>
              </div>
            )}

            {detailer && (
              <div className="border-t pt-4 mt-4">
                <p className="text-gray-600 text-sm mb-2">Or contact {detailer.company} directly:</p>
                <div className="flex justify-center space-x-4 text-sm">
                  {detailer.phone && (
                    <a href={`tel:${detailer.phone}`} className="text-blue-600 hover:underline">
                      {detailer.phone}
                    </a>
                  )}
                  {detailer.email && (
                    <a href={`mailto:${detailer.email}`} className="text-blue-600 hover:underline">
                      {detailer.email}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PAID QUOTE VIEW
  if (isPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
          <div className="text-center">
            <div className="text-green-500 text-5xl mb-4">&#10003;</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Quote Approved & Paid</h1>
            <p className="text-gray-600 mb-6">
              Thank you! Your payment was received{quote.paid_at ? ` on ${formatDate(quote.paid_at)}` : ''}.
            </p>
          </div>

          <div className="border-t border-b py-4 my-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Aircraft:</span>
                <span className="font-medium">{quote.aircraft_model || quote.aircraft_type}</span>
              </div>
              {quote.tail_number && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Tail Number:</span>
                  <span className="font-medium font-mono">{quote.tail_number}</span>
                </div>
              )}
              <div>
                <span className="text-gray-600">Services:</span>
                <ul className="mt-1 ml-4 list-disc list-inside">
                  {formatServices(quote.services).map((svc, i) => (
                    <li key={i} className="text-gray-800">{svc}</li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-gray-800 font-semibold">Total Paid:</span>
                <span className="font-bold text-lg">{sym}{formatPrice(quote.total_price)}</span>
              </div>
            </div>
          </div>

          {/* Download Quote PDF */}
          <div className="text-center mb-4">
            <a
              href={`/api/quotes/${quote.id}/pdf?token=${params.shareLink}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block px-6 py-2 border-2 border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              &#128196; Download Quote PDF
            </a>
          </div>

          {!tipsSent ? (
            <div className="text-center">
              <p className="text-gray-700 mb-4">Would you like tips to prepare for your detail?</p>
              <button
                onClick={handleSendTips}
                disabled={paymentLoading}
                className="w-full py-3 rounded-lg text-white font-medium bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 disabled:opacity-50"
              >
                {paymentLoading ? 'Sending...' : 'Yes, Send Me Tips'}
              </button>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium">Tips sent to your email!</p>
              <p className="text-green-700 text-sm">Check your inbox for preparation tips.</p>
            </div>
          )}

          {detailer && (
            <div className="border-t pt-4 mt-4 text-center">
              <p className="text-gray-600 text-sm mb-2">Questions? Contact {detailer.company}:</p>
              <div className="flex justify-center space-x-4 text-sm">
                {detailer.phone && (
                  <a href={`tel:${detailer.phone}`} className="text-blue-600 hover:underline">
                    {detailer.phone}
                  </a>
                )}
                {detailer.email && (
                  <a href={`mailto:${detailer.email}`} className="text-blue-600 hover:underline">
                    {detailer.email}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // NORMAL QUOTE VIEW (ready to pay)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center justify-center">
            <span className="mr-2">&#9992;</span> Your Quote
          </h1>
          {detailer && (
            <p className="text-gray-600 mt-1">from {detailer.company}</p>
          )}
        </div>

        {/* Quote Details */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Aircraft:</span>
              <span className="font-medium">{quote.aircraft_model || quote.aircraft_type}</span>
            </div>
            {quote.tail_number && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tail Number:</span>
                <span className="font-medium font-mono">{quote.tail_number}</span>
              </div>
            )}

            <div>
              <span className="text-gray-600">Services:</span>
              <ul className="mt-2 space-y-1">
                {formatServices(quote.services).map((svc, i) => (
                  <li key={i} className="flex items-center text-gray-800">
                    <span className="text-green-500 mr-2">&#10003;</span>
                    {svc}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pricing based on detailer preference - hide breakdown when minimum fee applies */}
            {!quote.minimum_fee_applied && detailer?.quote_display_preference === 'full_breakdown' && quote.line_items && (
              <div className="pt-3 border-t space-y-2">
                {quote.line_items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.description}</span>
                    <span className="text-gray-900">{sym}{formatPrice(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {!quote.minimum_fee_applied && detailer?.quote_display_preference === 'labor_products' && (
              <div className="pt-3 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Labor</span>
                  <span className="text-gray-900">{sym}{formatPrice(parseFloat(quote.labor_total) || parseFloat(quote.total_price) * 0.7)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Products & Materials</span>
                  <span className="text-gray-900">{sym}{formatPrice(parseFloat(quote.products_total) || parseFloat(quote.total_price) * 0.3)}</span>
                </div>
              </div>
            )}

            {/* Package discount - hide when minimum fee applies (show clean total only) */}
            {!quote.minimum_fee_applied && quote.discount_percent > 0 && (
              <div className="flex justify-between text-sm text-green-600 pt-2">
                <span>Package Discount ({quote.discount_percent}%)</span>
                <span>Included</span>
              </div>
            )}

            {/* Add-on Fees - hide when minimum fee applies (show clean total only) */}
            {!quote.minimum_fee_applied && quote.addon_fees && quote.addon_fees.length > 0 && (
              <div className="pt-3 border-t space-y-2">
                {quote.addon_fees.map((fee, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-700">
                      {fee.name} {fee.fee_type === 'percent' ? `(${fee.amount}%)` : ''}
                    </span>
                    <span className="text-gray-900">+{sym}{formatPrice(fee.calculated)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Service Fee (platform fee passed to customer) */}
            {(() => {
              const plan = detailer?.plan || 'free';
              const feeRate = PLATFORM_FEES[plan] || PLATFORM_FEES.free;
              const passFee = detailer?.pass_fee_to_customer;
              const basePrice = parseFloat(quote.total_price) || 0;
              const serviceFee = passFee ? Math.round(basePrice * feeRate * 100) / 100 : 0;
              const displayTotal = passFee ? basePrice + serviceFee : basePrice;

              return (
                <>
                  {passFee && serviceFee > 0 && (
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-gray-500">Service Fee ({Math.round(feeRate * 100)}%)</span>
                      <span className="text-gray-700">+{sym}{formatPrice(serviceFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t">
                    <span className="text-gray-800 font-semibold">Total:</span>
                    <span className="font-bold text-2xl text-[#1e3a5f]">{sym}{formatPrice(displayTotal)}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800">{quote.notes}</p>
          </div>
        )}

        {/* Valid Until Notice */}
        <p className="text-center text-sm text-gray-500 mb-4">
          Valid until {formatDate(quote.valid_until)}
        </p>
        <p className="text-center text-xs text-gray-400 mb-4">
          Dates are subject to availability and confirmed upon payment.
        </p>

        {/* Payment Error */}
        {paymentError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 font-medium">{paymentError}</p>
            {detailer && (
              <p className="text-red-700 text-sm mt-2">
                Questions? Contact {detailer.company} at{' '}
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="underline">{detailer.phone}</a>}
                {detailer.phone && detailer.email && ' or '}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="underline">{detailer.email}</a>}
              </p>
            )}
          </div>
        )}

        {/* Download Quote PDF */}
        <div className="text-center mb-4">
          <a
            href={`/api/quotes/${quote.id}/pdf?token=${params.shareLink}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block px-6 py-2 border-2 border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            &#128196; Download Quote PDF
          </a>
        </div>

        {/* Detailer Terms & Conditions */}
        {(detailer?.terms_text || detailer?.terms_pdf_url) && !isPaid && !isExpired && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Terms & Conditions</h4>
            {detailer.terms_pdf_url ? (
              <a href={detailer.terms_pdf_url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-amber-600 underline hover:text-amber-800">
                View Terms & Conditions (PDF)
              </a>
            ) : detailer.terms_text ? (
              <div className="text-xs text-gray-600 max-h-40 overflow-y-auto whitespace-pre-wrap border rounded p-2 bg-white">
                {detailer.terms_text}
              </div>
            ) : null}
          </div>
        )}

        {/* Terms Agreement Checkbox */}
        {stripeConnected && !isPaid && !isExpired && (
          <div className="flex items-start gap-2 mb-4 p-4 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="agreeCustomerTerms"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="agreeCustomerTerms" className="text-sm text-gray-600">
              I agree to the {(detailer?.terms_text || detailer?.terms_pdf_url) ? 'above' : ''} Terms & Conditions for this service
            </label>
          </div>
        )}

        {/* Pay Button or Payment Unavailable */}
        {stripeConnected ? (
          <button
            onClick={handlePayment}
            disabled={paymentLoading || !agreedToTerms}
            className="w-full py-3 rounded-lg text-white font-medium bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 disabled:opacity-50"
          >
            {paymentLoading ? 'Processing...' : 'Approve & Pay'}
          </button>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-blue-800 font-medium">Payment details to follow</p>
            <p className="text-blue-700 text-sm mt-1">
              Online payment is not available for this quote. {detailer?.company || 'The detailer'} will contact you with payment arrangements.
            </p>
          </div>
        )}

        {/* Detailer Contact */}
        {detailer && (
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm mb-2">Questions about this quote?</p>
            <div className="flex justify-center space-x-4 text-sm">
              {detailer.phone && (
                <a href={`tel:${detailer.phone}`} className="text-blue-600 hover:underline">
                  {detailer.phone}
                </a>
              )}
              {detailer.email && (
                <a href={`mailto:${detailer.email}`} className="text-blue-600 hover:underline">
                  {detailer.email}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
