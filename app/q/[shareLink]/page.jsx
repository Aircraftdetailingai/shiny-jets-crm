"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';
import { formatPrice } from '@/lib/formatPrice';
import { getCurrencySymbol } from '@/lib/currency';
import { calculateCcFee } from '@/lib/cc-fee';

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
        if (!res.ok) throw new Error('Quote not found');
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
    if (params.shareLink) fetchQuote();
  }, [params.shareLink]);

  // Inject detailer theme as CSS variables
  useEffect(() => {
    if (!detailer) return;
    const s = document.documentElement.style;
    s.setProperty('--brand-primary', detailer.theme_primary || '#C9A84C');
    s.setProperty('--brand-accent', detailer.theme_accent || '#0D1B2A');
    s.setProperty('--brand-bg', detailer.theme_bg || '#0A0E17');
    s.setProperty('--brand-surface', detailer.theme_surface || '#111827');
    return () => {
      ['--brand-primary', '--brand-accent', '--brand-bg', '--brand-surface'].forEach(v => s.removeProperty(v));
    };
  }, [detailer]);

  // Inject detailer custom fonts
  useEffect(() => {
    if (!detailer?.font_embed_url) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = detailer.font_embed_url;
    document.head.appendChild(link);
    return () => link.remove();
  }, [detailer?.font_embed_url]);

  const brandFontHeading = detailer?.font_heading ? `"${detailer.font_heading}", "Playfair Display", serif` : undefined;
  const brandFontBody = detailer?.font_body ? `"${detailer.font_body}", Inter, sans-serif` : undefined;

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
        const errorCode = data.code || 'default';
        setPaymentError(PAYMENT_ERROR_MESSAGES[errorCode] || PAYMENT_ERROR_MESSAGES.default);
        return;
      }
      if (data.url) window.location.href = data.url;
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
      if (res.ok) setRequestSent(true);
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
      if (res.ok) setTipsSent(true);
    } catch (err) {
      // Silently fail
    } finally {
      setPaymentLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getServicesList = (quote) => {
    const items = quote.line_items || quote.metadata?.line_items;
    if (Array.isArray(items) && items.length > 0) {
      return items.map(item => ({
        name: item.service || item.description || item.name || 'Service',
        amount: item.amount || 0,
      }));
    }
    const selected = quote.selected_services || quote.metadata?.selected_services;
    if (Array.isArray(selected) && selected.length > 0) {
      return selected.map(svc => ({ name: svc.name || svc.description || 'Service', amount: 0 }));
    }
    if (quote.services && typeof quote.services === 'object') {
      const labels = {
        exterior: 'Exterior Wash & Detail',
        interior: 'Interior Detail',
        brightwork: 'Brightwork Polish',
        ceramic: 'Ceramic Coating',
        engine: 'Engine Detail',
      };
      const entries = Object.entries(quote.services).filter(([, v]) => v === true);
      if (entries.length > 0) return entries.map(([key]) => ({ name: labels[key] || key, amount: 0 }));
    }
    return [];
  };

  // --- LOADING ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--brand-bg,#0A0E17)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--brand-primary,#C9A84C)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#8A9BB0] text-sm tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  // --- ERROR ---
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4">
        <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] p-10 text-center">
          <div className="w-12 h-[1px] bg-[var(--brand-primary,#C9A84C)] mx-auto mb-8" />
          <p className="text-[#8A9BB0] text-xs tracking-[0.2em] uppercase mb-3">Error</p>
          <h1 className="font-heading text-2xl font-light text-[#F5F5F5] mb-3" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>Quote Not Found</h1>
          <p className="text-[#8A9BB0] text-sm">This quote link may be invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const services = getServicesList(quote);
  const quoteNumber = quote.quote_number || `#${String(quote.id).slice(-6).toUpperCase()}`;

  // --- EXPIRED ---
  if (isExpired && !isPaid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4">
        <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] p-10">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-2">Quote</p>
            <div className="w-12 h-[1px] bg-[var(--brand-primary,#C9A84C)] mx-auto mb-6" />
            <p className="text-[#8A9BB0] text-xs tracking-[0.2em] uppercase mb-6">Expired</p>
            <p className="text-[#8A9BB0] text-sm">
              This quote expired on {formatDate(quote.valid_until)}.
            </p>
          </div>

          {!requestSent ? (
            <>
              <p className="text-[#8A9BB0] text-sm text-center mb-6">Would you like to request an updated quote?</p>
              <button
                onClick={handleRequestNewQuote}
                disabled={paymentLoading}
                className="w-full py-4 bg-[var(--brand-primary,#C9A84C)] text-[#0A0E17] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-50 transition-colors"
              >
                {paymentLoading ? 'Requesting...' : 'Request New Quote'}
              </button>
            </>
          ) : (
            <div className="border border-[#2A3A50] p-6 text-center">
              <p className="text-[var(--brand-primary,#C9A84C)] text-sm tracking-[0.15em] uppercase mb-1">Request Sent</p>
              <p className="text-[#8A9BB0] text-sm">{detailer?.company || 'The detailer'} will send you an updated quote soon.</p>
            </div>
          )}

          {detailer && (
            <div className="mt-8 pt-6 border-t border-[#1A2236] text-center">
              <p className="text-[#8A9BB0] text-xs tracking-[0.15em] uppercase mb-3">Or contact directly</p>
              <div className="flex justify-center gap-6 text-sm">
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] transition-colors">{detailer.phone}</a>}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] transition-colors">{detailer.email}</a>}
              </div>
            </div>
          )}
        </div>

        <p className="text-[#8A9BB0]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by Vector Aviation</p>
      </div>
    );
  }

  // --- PAID ---
  if (isPaid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4">
        <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] p-10">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-2">Quote</p>
            <div className="w-12 h-[1px] bg-[var(--brand-primary,#C9A84C)] mx-auto mb-6" />
            <p className="text-[var(--brand-primary,#C9A84C)] text-xs tracking-[0.2em] uppercase">Confirmed</p>
          </div>

          {/* Company */}
          {detailer && (
            <div className="text-center mb-8">
              <h1 className="font-heading text-2xl font-light text-[#F5F5F5]" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>{detailer.company}</h1>
            </div>
          )}

          {/* Aircraft */}
          <div className="mb-8">
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-1">Aircraft</p>
            <p className="text-[#F5F5F5] text-[1.2rem]">{quote.aircraft_model || quote.aircraft_type}</p>
            {quote.tail_number && (
              <>
                <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mt-4 mb-1">Registration</p>
                <p className="text-[#F5F5F5] font-mono">{quote.tail_number}</p>
              </>
            )}
          </div>

          {/* Services */}
          <div className="mb-8">
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-3">Services</p>
            <div className="divide-y divide-[#1A2236]">
              {services.map((svc, i) => (
                <div key={i} className="flex justify-between py-3">
                  <span className="text-[#F5F5F5] text-sm">{svc.name}</span>
                  {svc.amount > 0 && <span className="text-[#8A9BB0] text-sm">{sym}{formatPrice(svc.amount)}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="border-t border-[#2A3A50] pt-6 mb-8 text-center">
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-2">Total Paid</p>
            <p className="text-[var(--brand-primary,#C9A84C)] text-[2.5rem] font-light">{sym}{formatPrice(quote.total_price)}</p>
            {quote.paid_at && (
              <p className="text-[#8A9BB0] text-xs mt-2">{formatDate(quote.paid_at)}</p>
            )}
          </div>

          {/* Download PDF */}
          <a
            href={`/api/quotes/${quote.id}/pdf?token=${params.shareLink}`}
            target="_blank"
            rel="noreferrer"
            className="block w-full py-4 border border-[#2A3A50] text-[#8A9BB0] text-sm tracking-[0.2em] uppercase text-center hover:border-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] transition-colors mb-4"
          >
            Download PDF
          </a>

          {/* Tips */}
          {!tipsSent ? (
            <button
              onClick={handleSendTips}
              disabled={paymentLoading}
              className="w-full py-4 border border-[#2A3A50] text-[#8A9BB0] text-sm tracking-[0.2em] uppercase hover:border-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] disabled:opacity-50 transition-colors"
            >
              {paymentLoading ? 'Sending...' : 'Send Me Preparation Tips'}
            </button>
          ) : (
            <div className="border border-[#2A3A50] p-4 text-center">
              <p className="text-[var(--brand-primary,#C9A84C)] text-sm tracking-[0.15em] uppercase">Tips sent to your email</p>
            </div>
          )}

          {/* Contact */}
          {detailer && (
            <div className="mt-8 pt-6 border-t border-[#1A2236] text-center">
              <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-3">Questions</p>
              <div className="flex justify-center gap-6 text-sm">
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] transition-colors">{detailer.phone}</a>}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] transition-colors">{detailer.email}</a>}
              </div>
            </div>
          )}
        </div>

        <p className="text-[#8A9BB0]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by Vector Aviation</p>
      </div>
    );
  }

  // --- NORMAL QUOTE VIEW ---
  const plan = detailer?.plan || 'free';
  const feeRate = PLATFORM_FEES[plan] || PLATFORM_FEES.free;
  const passFee = detailer?.pass_fee_to_customer;
  const ccFeeMode = detailer?.cc_fee_mode || 'absorb';
  const basePrice = parseFloat(quote.total_price) || 0;
  const serviceFee = passFee ? Math.round(basePrice * feeRate * 100) / 100 : 0;
  const subtotalWithService = basePrice + serviceFee;
  const ccFee = (ccFeeMode === 'pass' || ccFeeMode === 'customer_choice') ? calculateCcFee(subtotalWithService) : 0;
  const showCcFee = ccFeeMode === 'pass';
  const displayTotal = subtotalWithService + (showCcFee ? ccFee : 0);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4" style={brandFontBody ? { fontFamily: brandFontBody } : undefined}>
      <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] px-8 py-10 sm:px-10">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-2">Quote</p>
          <div className="w-12 h-[1px] bg-[var(--brand-primary,#C9A84C)] mx-auto mb-4" />
          <p className="text-[#8A9BB0]/60 text-xs font-mono">{quoteNumber}</p>
        </div>

        {/* Company / Logo */}
        {detailer && (
          <div className="text-center mb-10">
            {detailer.theme_logo_url ? (
              <img src={detailer.theme_logo_url} alt={detailer.company} className="h-10 mx-auto mb-3 object-contain" />
            ) : null}
            <h1 className="font-heading text-3xl font-light text-[#F5F5F5] mb-1" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>{detailer.company}</h1>
            {(detailer.phone || detailer.email) && (
              <p className="text-[#8A9BB0]/60 text-xs">
                {[detailer.phone, detailer.email].filter(Boolean).join(' \u00B7 ')}
              </p>
            )}
          </div>
        )}

        {/* Aircraft + Tail */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-1">Aircraft</p>
            <p className="text-[#F5F5F5] text-[1.2rem]">{quote.aircraft_model || quote.aircraft_type}</p>
          </div>
          {quote.tail_number && (
            <div>
              <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-1">Registration</p>
              <p className="text-[#F5F5F5] text-[1.2rem] font-mono">{quote.tail_number}</p>
            </div>
          )}
          {quote.airport && (
            <div>
              <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-1">Location</p>
              <p className="text-[#F5F5F5] text-[1.2rem] font-mono">{quote.airport}</p>
            </div>
          )}
        </div>

        {/* Services */}
        <div className="mb-8">
          <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-3">Services</p>

          {/* Full breakdown */}
          {!quote.minimum_fee_applied && detailer?.quote_display_preference === 'full_breakdown' && services.length > 0 && (
            <div className="divide-y divide-[#1A2236]">
              {services.map((svc, i) => (
                <div key={i} className="flex justify-between py-3">
                  <span className="text-[#F5F5F5] text-sm">{svc.name}</span>
                  {svc.amount > 0 && <span className="text-[#8A9BB0] text-sm">{sym}{formatPrice(svc.amount)}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Labor/products split */}
          {!quote.minimum_fee_applied && detailer?.quote_display_preference === 'labor_products' && (
            <div className="divide-y divide-[#1A2236]">
              <div className="flex justify-between py-3">
                <span className="text-[#F5F5F5] text-sm">Labor</span>
                <span className="text-[#8A9BB0] text-sm">{sym}{formatPrice(parseFloat(quote.labor_total) || basePrice * 0.7)}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-[#F5F5F5] text-sm">Products & Materials</span>
                <span className="text-[#8A9BB0] text-sm">{sym}{formatPrice(parseFloat(quote.products_total) || basePrice * 0.3)}</span>
              </div>
            </div>
          )}

          {/* Default: service names only */}
          {(quote.minimum_fee_applied || (!detailer?.quote_display_preference || detailer?.quote_display_preference === 'total_only')) && services.length > 0 && (
            <div className="divide-y divide-[#1A2236]">
              {services.map((svc, i) => (
                <div key={i} className="py-3">
                  <span className="text-[#F5F5F5] text-sm">{svc.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Package discount */}
        {!quote.minimum_fee_applied && quote.discount_percent > 0 && (
          <div className="flex justify-between py-2 text-sm">
            <span className="text-[#8A9BB0]">Package Discount ({quote.discount_percent}%)</span>
            <span className="text-[var(--brand-primary,#C9A84C)]">Included</span>
          </div>
        )}

        {/* Add-on fees */}
        {!quote.minimum_fee_applied && quote.addon_fees && quote.addon_fees.length > 0 && (
          <div className="border-t border-[#1A2236] pt-2 mb-2">
            {quote.addon_fees.map((fee, i) => (
              <div key={i} className="flex justify-between py-2 text-sm">
                <span className="text-[#8A9BB0]">{fee.name}{fee.fee_type === 'percent' ? ` (${fee.amount}%)` : ''}</span>
                <span className="text-[#8A9BB0]">+{sym}{formatPrice(fee.calculated)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Service fee + CC fee */}
        {passFee && serviceFee > 0 && (
          <div className="flex justify-between py-2 text-sm">
            <span className="text-[#8A9BB0]">Service Fee ({Math.round(feeRate * 100)}%)</span>
            <span className="text-[#8A9BB0]">+{sym}{formatPrice(serviceFee)}</span>
          </div>
        )}
        {showCcFee && ccFee > 0 && (
          <div className="flex justify-between py-2 text-sm">
            <span className="text-[#8A9BB0]">Processing Fee</span>
            <span className="text-[#8A9BB0]">+{sym}{formatPrice(ccFee)}</span>
          </div>
        )}

        {/* Total */}
        <div className="border-t border-[#2A3A50] pt-8 mb-2 text-center">
          <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-2">Total</p>
          <p className="text-[var(--brand-primary,#C9A84C)] text-[2.5rem] font-light">{sym}{formatPrice(displayTotal)}</p>
          {ccFeeMode === 'customer_choice' && (
            <p className="text-[#8A9BB0]/60 text-xs mt-2">
              Card payment includes +{sym}{formatPrice(ccFee)} processing fee
            </p>
          )}
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="border-l-2 border-[var(--brand-primary,#C9A84C)]/40 pl-4 my-6">
            <p className="text-[#8A9BB0] text-sm leading-relaxed">{quote.notes}</p>
          </div>
        )}

        {/* Terms & Conditions */}
        {(detailer?.terms_text || detailer?.terms_pdf_url) && !isPaid && !isExpired && (
          <div className="border border-[#1A2236] p-5 mb-4">
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-3">Terms & Conditions</p>
            {detailer.terms_pdf_url ? (
              <a href={detailer.terms_pdf_url} target="_blank" rel="noopener noreferrer"
                className="text-[var(--brand-primary,#C9A84C)] text-sm hover:text-[var(--brand-primary,#C9A84C)] transition-colors">
                View Terms & Conditions (PDF)
              </a>
            ) : detailer.terms_text ? (
              <div className="text-[#8A9BB0]/70 text-xs max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {detailer.terms_text}
              </div>
            ) : null}
          </div>
        )}

        {/* Terms checkbox */}
        {stripeConnected && !isPaid && !isExpired && (
          <label htmlFor="agreeCustomerTerms" className="flex items-start gap-3 mb-6 cursor-pointer group">
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                id="agreeCustomerTerms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-5 h-5 border border-[#2A3A50] peer-checked:border-[var(--brand-primary,#C9A84C)] peer-checked:bg-[var(--brand-primary,#C9A84C)] transition-colors flex items-center justify-center">
                {agreedToTerms && <span className="text-[#0A0E17] text-xs font-bold">&#10003;</span>}
              </div>
            </div>
            <span className="text-[#8A9BB0] text-sm leading-snug">
              I agree to the {(detailer?.terms_text || detailer?.terms_pdf_url) ? 'above ' : ''}Terms & Conditions for this service
            </span>
          </label>
        )}

        {/* Payment Error */}
        {paymentError && (
          <div className="border border-red-500/30 bg-red-500/5 p-4 mb-4">
            <p className="text-red-400 text-sm">{paymentError}</p>
            {detailer && (
              <p className="text-[#8A9BB0] text-xs mt-2">
                Contact {detailer.company}: {' '}
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#C9A84C)]">{detailer.phone}</a>}
                {detailer.phone && detailer.email && ' or '}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#C9A84C)]">{detailer.email}</a>}
              </p>
            )}
          </div>
        )}

        {/* CTA Buttons */}
        {invoiceAccepted ? (
          <div className="border border-[#2A3A50] p-6 text-center">
            <p className="text-[var(--brand-primary,#C9A84C)] text-sm tracking-[0.15em] uppercase mb-1">Invoice Requested</p>
            <p className="text-[#8A9BB0] text-sm">{detailer?.company || 'The detailer'} has been notified and will send you an invoice.</p>
          </div>
        ) : stripeConnected ? (
          detailer?.cc_fee_mode === 'customer_choice' ? (
            <div className="space-y-3">
              <button
                onClick={handlePayment}
                disabled={paymentLoading || !agreedToTerms}
                className="w-full py-4 bg-[var(--brand-primary,#C9A84C)] text-[#0A0E17] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
              >
                {paymentLoading ? 'Processing...' : 'Accept & Pay by Card'}
              </button>
              <button
                onClick={handleRequestInvoice}
                disabled={invoiceRequesting || !agreedToTerms}
                className="w-full py-4 border border-[#2A3A50] text-[#8A9BB0] text-sm tracking-[0.2em] uppercase hover:border-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] disabled:opacity-40 transition-colors"
              >
                {invoiceRequesting ? 'Submitting...' : 'Request Invoice'}
              </button>
              <p className="text-[#8A9BB0]/50 text-[10px] tracking-[0.1em] text-center uppercase">
                Card includes processing fee &middot; Invoice has no additional fees
              </p>
            </div>
          ) : (
            <button
              onClick={handlePayment}
              disabled={paymentLoading || !agreedToTerms}
              className="w-full py-4 bg-[var(--brand-primary,#C9A84C)] text-[#0A0E17] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
            >
              {paymentLoading ? 'Processing...' : 'Accept & Pay'}
            </button>
          )
        ) : (
          <div className="border border-[#2A3A50] p-6 text-center">
            <p className="text-[#8A9BB0] text-sm tracking-[0.15em] uppercase mb-1">Payment Details to Follow</p>
            <p className="text-[#8A9BB0]/70 text-sm">{detailer?.company || 'The detailer'} will contact you with payment arrangements.</p>
          </div>
        )}

        {/* Valid until */}
        <p className="text-[#8A9BB0]/40 text-[10px] tracking-[0.15em] uppercase text-center mt-6">
          Valid until {formatDate(quote.valid_until)}
        </p>
        <p className="text-[#8A9BB0]/30 text-[10px] text-center mt-1">
          Dates subject to availability, confirmed upon payment.
        </p>

        {/* Questions / Contact */}
        {detailer && (detailer.phone || detailer.email) && (
          <div className="mt-8 pt-6 border-t border-[#1A2236] text-center">
            <p className="text-[#8A9BB0] text-[10px] tracking-[0.3em] uppercase mb-3">Questions about this quote?</p>
            <div className="flex justify-center gap-6 text-sm">
              {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] transition-colors">{detailer.phone}</a>}
              {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#C9A84C)] hover:text-[var(--brand-primary,#C9A84C)] transition-colors">{detailer.email}</a>}
            </div>
          </div>
        )}

        {/* Download PDF */}
        <div className="mt-6 text-center">
          <a
            href={`/api/quotes/${quote.id}/pdf?token=${params.shareLink}`}
            target="_blank"
            rel="noreferrer"
            className="text-[#8A9BB0]/50 text-[10px] tracking-[0.15em] uppercase hover:text-[var(--brand-primary,#C9A84C)] transition-colors"
          >
            Download PDF
          </a>
        </div>
      </div>

      {/* Footer */}
      <p className="text-[#8A9BB0]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by Vector Aviation</p>
    </div>
  );
}
