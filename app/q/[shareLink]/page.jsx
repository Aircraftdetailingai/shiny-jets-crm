"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';
import { formatPrice } from '@/lib/formatPrice';
import { getCurrencySymbol } from '@/lib/currency';
import { calculateCcFee } from '@/lib/cc-fee';

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
  const [invoiceRequesting, setInvoiceRequesting] = useState(false);
  const [invoiceAccepted, setInvoiceAccepted] = useState(false);

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
  const isPaid = quote && (quote.status === 'paid' || quote.status === 'approved' || quote.status === 'accepted');

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

  const handleRequestInvoice = async () => {
    setInvoiceRequesting(true);
    setPaymentError('');
    try {
      const res = await fetch(`/api/quotes/${quote.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareLink: params.shareLink }),
      });
      if (res.ok) {
        setInvoiceAccepted(true);
      } else {
        const data = await res.json();
        setPaymentError(data.error || 'Failed to submit request');
      }
    } catch (err) {
      setPaymentError('Network error. Please try again.');
    } finally {
      setInvoiceRequesting(false);
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

  const getServicesList = (quote) => {
    // Primary: use line_items column or metadata fallback
    const items = quote.line_items || quote.metadata?.line_items;
    if (Array.isArray(items) && items.length > 0) {
      return items.map(item => ({
        name: item.service || item.description || item.name || 'Service',
        amount: item.amount || 0,
      }));
    }
    // Fallback: selected_services array (column or metadata)
    const selected = quote.selected_services || quote.metadata?.selected_services;
    if (Array.isArray(selected) && selected.length > 0) {
      return selected.map(svc => ({
        name: svc.name || svc.description || 'Service',
        amount: 0,
      }));
    }
    // Fallback: legacy services object { exterior: true, ... }
    if (quote.services && typeof quote.services === 'object') {
      const labels = {
        exterior: 'Exterior Wash & Detail',
        interior: 'Interior Detail',
        brightwork: 'Brightwork Polish',
        ceramic: 'Ceramic Coating',
        engine: 'Engine Detail',
      };
      const entries = Object.entries(quote.services)
        .filter(([, value]) => value === true);
      if (entries.length > 0) {
        return entries.map(([key]) => ({ name: labels[key] || key, amount: 0 }));
      }
    }
    return [];
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
                  {getServicesList(quote).map((svc, i) => (
                    <li key={i} className="text-gray-800">{svc.name}</li>
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
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg text-sm font-semibold hover:from-amber-600 hover:to-amber-700 shadow-md hover:shadow-lg transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download PDF
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
                {getServicesList(quote).map((svc, i) => (
                  <li key={i} className="flex items-center text-gray-800">
                    <span className="text-green-500 mr-2">&#10003;</span>
                    {svc.name}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pricing based on detailer preference - hide breakdown when minimum fee applies */}
            {!quote.minimum_fee_applied && detailer?.quote_display_preference === 'full_breakdown' && (quote.line_items || quote.metadata?.line_items) && (
              <div className="pt-3 border-t space-y-2">
                {(quote.line_items || quote.metadata?.line_items).map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.description || item.service || item.name || 'Service'}</span>
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

            {/* Service Fee + CC Processing Fee */}
            {(() => {
              const plan = detailer?.plan || 'free';
              const feeRate = PLATFORM_FEES[plan] || PLATFORM_FEES.free;
              const passFee = detailer?.pass_fee_to_customer;
              const ccFeeMode = detailer?.cc_fee_mode || 'absorb';
              const basePrice = parseFloat(quote.total_price) || 0;
              const serviceFee = passFee ? Math.round(basePrice * feeRate * 100) / 100 : 0;
              const subtotalWithService = basePrice + serviceFee;
              const ccFee = (ccFeeMode === 'pass' || ccFeeMode === 'customer_choice') ? calculateCcFee(subtotalWithService) : 0;
              const showCcFee = ccFeeMode === 'pass'; // always show for pass, conditional for customer_choice
              const displayTotal = subtotalWithService + (showCcFee ? ccFee : 0);

              return (
                <>
                  {passFee && serviceFee > 0 && (
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-gray-500">Service Fee ({Math.round(feeRate * 100)}%)</span>
                      <span className="text-gray-700">+{sym}{formatPrice(serviceFee)}</span>
                    </div>
                  )}
                  {showCcFee && ccFee > 0 && (
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-gray-500">Processing Fee (2.9% + $0.30)</span>
                      <span className="text-gray-700">+{sym}{formatPrice(ccFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t">
                    <span className="text-gray-800 font-semibold">Total:</span>
                    <span className="font-bold text-2xl text-[#1e3a5f]">{sym}{formatPrice(displayTotal)}</span>
                  </div>
                  {ccFeeMode === 'customer_choice' && (
                    <p className="text-xs text-gray-400 text-right mt-1">
                      Pay by card includes +{sym}{formatPrice(ccFee)} processing fee
                    </p>
                  )}
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
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg text-sm font-semibold hover:from-amber-600 hover:to-amber-700 shadow-md hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Download PDF
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
        {invoiceAccepted ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-green-800 font-medium">Invoice Requested</p>
            <p className="text-green-700 text-sm mt-1">
              {detailer?.company || 'The detailer'} has been notified and will send you an invoice.
            </p>
          </div>
        ) : stripeConnected ? (
          detailer?.cc_fee_mode === 'customer_choice' ? (
            <div className="space-y-3">
              <button
                onClick={handlePayment}
                disabled={paymentLoading || !agreedToTerms}
                className="w-full py-3 rounded-lg text-white font-medium bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 disabled:opacity-50"
              >
                {paymentLoading ? 'Processing...' : 'Pay by Card'}
              </button>
              <button
                onClick={handleRequestInvoice}
                disabled={invoiceRequesting || !agreedToTerms}
                className="w-full py-3 rounded-lg font-medium border-2 border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {invoiceRequesting ? 'Submitting...' : 'Request Invoice (Check/ACH)'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Card payment includes a processing fee. Invoice payments have no additional fees.
              </p>
            </div>
          ) : (
            <button
              onClick={handlePayment}
              disabled={paymentLoading || !agreedToTerms}
              className="w-full py-3 rounded-lg text-white font-medium bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 disabled:opacity-50"
            >
              {paymentLoading ? 'Processing...' : 'Approve & Pay'}
            </button>
          )
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
