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

  // Scheduling state
  const [availableDates, setAvailableDates] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [timePreference, setTimePreference] = useState('No preference');
  const [schedulingNotes, setSchedulingNotes] = useState('');
  const [schedulingLoading, setSchedulingLoading] = useState(false);
  const [schedulingError, setSchedulingError] = useState('');
  const [justScheduled, setJustScheduled] = useState(false);
  const [skipScheduling, setSkipScheduling] = useState(false);
  const [calendlyUrl, setCalendlyUrl] = useState(null);
  const [useCalendlyScheduling, setUseCalendlyScheduling] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

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
    const isLight = detailer.portal_theme === 'light';
    s.setProperty('--brand-primary', detailer.theme_primary || '#007CB1');
    s.setProperty('--brand-accent', detailer.theme_accent || '#0D1B2A');
    s.setProperty('--brand-bg', isLight ? '#FFFFFF' : (detailer.theme_bg || '#0A0E17'));
    s.setProperty('--brand-surface', isLight ? '#F3F4F6' : (detailer.theme_surface || '#111827'));
    s.setProperty('--brand-text', isLight ? '#1F2937' : '#F5F5F5');
    s.setProperty('--brand-text-secondary', isLight ? '#6B7280' : '#8A9BB0');
    s.setProperty('--brand-border', isLight ? '#E5E7EB' : '#1A2236');
    s.setProperty('--brand-border-strong', isLight ? '#D1D5DB' : '#2A3A50');
    s.setProperty('--brand-btn-text', isLight ? '#FFFFFF' : (detailer.theme_bg || '#0A0E17'));
    return () => {
      ['--brand-primary', '--brand-accent', '--brand-bg', '--brand-surface', '--brand-text', '--brand-text-secondary', '--brand-border', '--brand-border-strong', '--brand-btn-text'].forEach(v => s.removeProperty(v));
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
  const isPaid = quote && (quote.status === 'paid' || quote.status === 'approved' || quote.status === 'accepted' || quote.status === 'scheduled' || quote.status === 'deposit_paid');
  const isDepositPaid = quote?.status === 'deposit_paid';
  const bookingMode = detailer?.booking_mode || 'pay_to_book';
  const depositPct = detailer?.deposit_percentage || 25;
  const isScheduled = quote && (quote.status === 'scheduled' || quote.scheduled_date);
  const hasAvailability = detailer?.availability != null;
  const hasCalendly = !!(detailer?.calendly_url && detailer?.use_calendly_scheduling);
  const needsScheduling = isPaid && !isScheduled && (hasAvailability || hasCalendly) && !skipScheduling;

  // Fetch availability when scheduling is needed
  useEffect(() => {
    if (!needsScheduling || !quote?.id) return;
    setAvailabilityLoading(true);
    fetch(`/api/quotes/${quote.id}/availability?share_link=${params.shareLink}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.available && data.dates) {
          setAvailableDates(data.dates);
          // Set calendar to first available month
          if (data.dates.length > 0) {
            const first = new Date(data.dates[0].date + 'T12:00');
            setCalendarMonth(new Date(first.getFullYear(), first.getMonth(), 1));
          }
        }
        if (data?.calendly_url) setCalendlyUrl(data.calendly_url);
        if (data?.use_calendly_scheduling) setUseCalendlyScheduling(true);
      })
      .catch(console.error)
      .finally(() => setAvailabilityLoading(false));
  }, [needsScheduling, quote?.id]);

  const handleSchedule = async () => {
    if (!selectedDate) return;
    setSchedulingLoading(true);
    setSchedulingError('');
    try {
      const res = await fetch(`/api/quotes/${quote.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareLink: params.shareLink,
          scheduledDate: selectedDate,
          timePreference,
          schedulingNotes: schedulingNotes.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuote(prev => ({ ...prev, scheduled_date: data.scheduled_date, status: 'scheduled', time_preference: timePreference, scheduling_notes: schedulingNotes }));
        setJustScheduled(true);
      } else {
        const data = await res.json();
        setSchedulingError(data.error || 'Failed to schedule. Please try again.');
      }
    } catch (err) {
      setSchedulingError('Network error. Please try again.');
    } finally {
      setSchedulingLoading(false);
    }
  };

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
        const msg = data.message || PAYMENT_ERROR_MESSAGES[errorCode] || PAYMENT_ERROR_MESSAGES.default;
        console.error('[payment] Checkout failed:', data);
        setPaymentError(msg);
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('[payment] Network error:', err);
      setPaymentError(PAYMENT_ERROR_MESSAGES.default);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleDepositPayment = async () => {
    setPaymentError('');
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id, shareLink: params.shareLink, agreedToTermsAt: new Date().toISOString(), paymentType: 'deposit' }),
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
        hours: parseFloat(item.hours) || 0,
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
          <div className="w-8 h-8 border-2 border-[var(--brand-primary,#007CB1)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  // --- ERROR ---
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4">
        <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] p-10 text-center">
          <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-8" />
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.2em] uppercase mb-3">Error</p>
          <h1 className="font-heading text-2xl font-light text-[var(--brand-text,#F5F5F5)] mb-3" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>Quote Not Found</h1>
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">This quote link may be invalid or has been removed.</p>
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
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Quote</p>
            <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-6" />
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.2em] uppercase mb-6">Expired</p>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">
              This quote expired on {formatDate(quote.valid_until)}.
            </p>
          </div>

          {!requestSent ? (
            <>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm text-center mb-6">Would you like to request an updated quote?</p>
              <button
                onClick={handleRequestNewQuote}
                disabled={paymentLoading}
                className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-50 transition-colors"
              >
                {paymentLoading ? 'Requesting...' : 'Request New Quote'}
              </button>
            </>
          ) : (
            <div className="border border-[var(--brand-border-strong,#2A3A50)] p-6 text-center">
              <p className="text-[var(--brand-primary,#007CB1)] text-sm tracking-[0.15em] uppercase mb-1">Request Sent</p>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{detailer?.company || 'The detailer'} will send you an updated quote soon.</p>
            </div>
          )}

          {detailer && (
            <div className="mt-8 pt-6 border-t border-[var(--brand-border,#1A2236)] text-center">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.15em] uppercase mb-3">Or contact directly</p>
              <div className="flex justify-center gap-6 text-sm">
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.phone}</a>}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.email}</a>}
              </div>
            </div>
          )}
        </div>

        {plan !== 'enterprise' && detailer?.company && <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by {detailer.company}</p>}
      </div>
    );
  }

  // --- SCHEDULING STEP (after payment/acceptance) ---
  if (needsScheduling && !justScheduled) {
    // Calendly as primary scheduler
    const showCalendlyPrimary = hasCalendly && (useCalendlyScheduling || calendlyUrl) && detailer?.use_calendly_scheduling;
    const calendlyEmbedUrl = detailer?.calendly_url || calendlyUrl;
    const brandPrimary = (detailer?.theme_primary || '#007CB1').replace('#', '');

    if (showCalendlyPrimary && calendlyEmbedUrl) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4" style={brandFontBody ? { fontFamily: brandFontBody } : undefined}>
          <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] px-8 py-10 sm:px-10">
            <div className="text-center mb-8">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Next Step</p>
              <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-4" />
              <h2 className="text-[var(--brand-text,#F5F5F5)] text-xl font-light tracking-wide" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>Schedule Your Service</h2>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mt-2">Pick a time that works for you</p>
            </div>

            <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--brand-border,#1A2236)]">
              <div>
                <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{quote.aircraft_model || quote.aircraft_type}</p>
                {quote.tail_number && <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs font-mono">{quote.tail_number}</p>}
              </div>
              <p className="text-[var(--brand-primary,#007CB1)] text-lg font-light">{sym}{formatPrice(quote.total_price)}</p>
            </div>

            <iframe
              src={`${calendlyEmbedUrl}?hide_gdpr_banner=1&background_color=111827&text_color=F5F5F5&primary_color=${brandPrimary}`}
              width="100%"
              height="630"
              frameBorder="0"
              title="Schedule Appointment"
              className="rounded-sm"
            />

            <button
              onClick={() => setSkipScheduling(true)}
              className="w-full py-3 text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs tracking-[0.15em] uppercase hover:text-[var(--brand-text-secondary,#8A9BB0)] transition-colors mt-4"
            >
              Skip for now
            </button>
          </div>
          {plan !== 'enterprise' && detailer?.company && <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by {detailer.company}</p>}
        </div>
      );
    }

    const availableDateSet = new Set(availableDates.map(d => d.date));
    const cm = calendarMonth;
    const daysInMonth = new Date(cm.getFullYear(), cm.getMonth() + 1, 0).getDate();
    const firstDayOfWeek = new Date(cm.getFullYear(), cm.getMonth(), 1).getDay();
    const monthLabel = cm.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const calendarCells = [];
    for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${cm.getFullYear()}-${String(cm.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      calendarCells.push({ day: d, date: dateStr, available: availableDateSet.has(dateStr) });
    }

    const prevMonth = () => setCalendarMonth(new Date(cm.getFullYear(), cm.getMonth() - 1, 1));
    const nextMonth = () => setCalendarMonth(new Date(cm.getFullYear(), cm.getMonth() + 1, 1));

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4" style={brandFontBody ? { fontFamily: brandFontBody } : undefined}>
        <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] px-8 py-10 sm:px-10">
          {/* Header */}
          <div className="text-center mb-8">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Next Step</p>
            <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-4" />
            <h2 className="text-[var(--brand-text,#F5F5F5)] text-xl font-light tracking-wide" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>Schedule Your Service</h2>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mt-2">Pick a date that works for you</p>
          </div>

          {/* Aircraft summary */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--brand-border,#1A2236)]">
            <div>
              <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{quote.aircraft_model || quote.aircraft_type}</p>
              {quote.tail_number && <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs font-mono">{quote.tail_number}</p>}
            </div>
            <p className="text-[var(--brand-primary,#007CB1)] text-lg font-light">{sym}{formatPrice(quote.total_price)}</p>
          </div>

          {/* Calendar */}
          {availabilityLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[var(--brand-primary,#007CB1)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="mb-8">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="text-[var(--brand-text-secondary,#8A9BB0)] hover:text-[var(--brand-text,#F5F5F5)] p-2 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
                </button>
                <p className="text-[var(--brand-text,#F5F5F5)] text-sm tracking-[0.15em] uppercase">{monthLabel}</p>
                <button onClick={nextMonth} className="text-[var(--brand-text-secondary,#8A9BB0)] hover:text-[var(--brand-text,#F5F5F5)] p-2 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} className="text-center text-[10px] text-[var(--brand-text-secondary,#8A9BB0)]/60 uppercase tracking-wider py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell, i) => {
                  if (!cell) return <div key={`empty-${i}`} />;
                  const isSelected = selectedDate === cell.date;
                  const isToday = cell.date === new Date().toISOString().split('T')[0];
                  return (
                    <button
                      key={cell.date}
                      disabled={!cell.available}
                      onClick={() => setSelectedDate(cell.date)}
                      className={`
                        aspect-square flex items-center justify-center rounded-sm text-sm transition-all relative
                        ${isSelected
                          ? 'bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] font-medium'
                          : cell.available
                            ? 'text-[var(--brand-text,#F5F5F5)] hover:bg-[var(--brand-primary,#007CB1)]/20 border border-[var(--brand-border-strong,#2A3A50)] hover:border-[var(--brand-primary,#007CB1)]'
                            : 'text-[var(--brand-text-secondary,#8A9BB0)]/25 cursor-not-allowed'
                        }
                      `}
                    >
                      {cell.day}
                      {isToday && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--brand-primary,#007CB1)]" />}
                    </button>
                  );
                })}
              </div>

              {availableDates.length === 0 && !availabilityLoading && (
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm text-center mt-4">No available dates found. Please contact us directly.</p>
              )}
            </div>
          )}

          {/* Selected date display */}
          {selectedDate && (
            <div className="border border-[var(--brand-primary,#007CB1)]/30 bg-[var(--brand-primary,#007CB1)]/5 p-4 mb-6 text-center rounded-sm">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Selected Date</p>
              <p className="text-[var(--brand-primary,#007CB1)] text-lg font-light">
                {new Date(selectedDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}

          {/* Time preference */}
          <div className="mb-6">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Time Preference</p>
            <div className="grid grid-cols-3 gap-2">
              {['Morning', 'Afternoon', 'No preference'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setTimePreference(opt)}
                  className={`py-2.5 text-xs tracking-[0.1em] uppercase border rounded-sm transition-colors ${
                    timePreference === opt
                      ? 'border-[var(--brand-primary,#007CB1)] text-[var(--brand-primary,#007CB1)] bg-[var(--brand-primary,#007CB1)]/10'
                      : 'border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] hover:border-[#8A9BB0]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Special instructions */}
          <div className="mb-6">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Special Instructions <span className="normal-case tracking-normal">(optional)</span></p>
            <textarea
              value={schedulingNotes}
              onChange={(e) => setSchedulingNotes(e.target.value)}
              placeholder="Access details, gate codes, special requests..."
              rows={3}
              className="w-full bg-transparent border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text,#F5F5F5)] text-sm p-3 rounded-sm placeholder:text-[var(--brand-text-secondary,#8A9BB0)]/40 focus:border-[var(--brand-primary,#007CB1)] focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Error */}
          {schedulingError && (
            <div className="border border-red-500/30 bg-red-500/5 p-4 mb-4 rounded-sm">
              <p className="text-red-400 text-sm">{schedulingError}</p>
            </div>
          )}

          {/* Confirm button */}
          <button
            onClick={handleSchedule}
            disabled={!selectedDate || schedulingLoading}
            className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {schedulingLoading ? 'Scheduling...' : 'Confirm Schedule'}
          </button>

          {/* Skip */}
          <button
            onClick={() => setSkipScheduling(true)}
            className="w-full py-3 text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs tracking-[0.15em] uppercase hover:text-[var(--brand-text-secondary,#8A9BB0)] transition-colors mt-2"
          >
            Skip for now
          </button>

          {/* Calendly secondary option */}
          {calendlyEmbedUrl && !showCalendlyPrimary && (
            <div className="mt-6 pt-6 border-t border-[var(--brand-border,#1A2236)]">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-4 text-center">Or Schedule Via Calendly</p>
              <iframe
                src={`${calendlyEmbedUrl}?hide_gdpr_banner=1&background_color=111827&text_color=F5F5F5&primary_color=${brandPrimary}`}
                width="100%"
                height="630"
                frameBorder="0"
                title="Schedule Appointment"
                className="rounded-sm"
              />
            </div>
          )}

          {/* Contact */}
          {detailer && (detailer.phone || detailer.email) && (
            <div className="mt-6 pt-6 border-t border-[var(--brand-border,#1A2236)] text-center">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Need help?</p>
              <div className="flex justify-center gap-6 text-sm">
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.phone}</a>}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.email}</a>}
              </div>
            </div>
          )}
        </div>
        {plan !== 'enterprise' && detailer?.company && <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by {detailer.company}</p>}
      </div>
    );
  }

  // --- PAID / CONFIRMED ---
  if (isPaid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4">
        <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] p-10">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Quote</p>
            <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-6" />
            <p className="text-[var(--brand-primary,#007CB1)] text-xs tracking-[0.2em] uppercase">Confirmed</p>
          </div>

          {/* Company */}
          {detailer && (
            <div className="text-center mb-8">
              <h1 className="font-heading text-2xl font-light text-[var(--brand-text,#F5F5F5)]" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>{detailer.company}</h1>
            </div>
          )}

          {/* Scheduled Date */}
          {quote.scheduled_date && (
            <div className="border border-[var(--brand-primary,#007CB1)]/30 bg-[var(--brand-primary,#007CB1)]/5 p-6 mb-8 text-center rounded-sm">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Scheduled For</p>
              <p className="text-[var(--brand-primary,#007CB1)] text-xl font-light">
                {new Date(quote.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              {quote.time_preference && quote.time_preference !== 'No preference' && (
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-2">{quote.time_preference}</p>
              )}
            </div>
          )}

          {/* Aircraft */}
          <div className="mb-8">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Aircraft</p>
            <p className="text-[var(--brand-text,#F5F5F5)] text-[1.2rem]">{quote.aircraft_model || quote.aircraft_type}</p>
            {quote.tail_number && (
              <>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mt-4 mb-1">Registration</p>
                <p className="text-[var(--brand-text,#F5F5F5)] font-mono">{quote.tail_number}</p>
              </>
            )}
          </div>

          {/* Services */}
          <div className="mb-8">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Services</p>
            {(detailer?.quote_display_mode === 'package') ? (
              <div className="text-center py-4">
                <p className="text-[var(--brand-text,#F5F5F5)] text-lg font-semibold">{detailer.quote_package_name || 'Aircraft Detail Package'}</p>
                <p className="text-[var(--brand-primary,#007CB1)] text-2xl font-bold mt-2">{sym}{formatPrice(quote.total_price)}</p>
                {detailer.quote_show_breakdown && services.length > 0 && (
                  <details>
                    <summary className="text-sm cursor-pointer text-blue-400 hover:underline mt-2">View service breakdown</summary>
                    <div className="divide-y divide-[var(--brand-border,#1A2236)] mt-2 text-left">
                      {services.map((svc, i) => (
                        <div key={i} className="flex justify-between items-center py-3">
                          <div>
                            <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc.name}</span>
                            {svc.hours > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs ml-2">{svc.hours.toFixed(1)}h</span>}
                          </div>
                          {svc.amount > 0 && <span className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{sym}{formatPrice(svc.amount)}</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ) : (detailer?.quote_display_mode === 'hours_only') ? (
              <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                {services.map((svc, i) => (
                  <div key={i} className="flex justify-between items-center py-3">
                    <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc.name}</span>
                    {svc.hours > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{svc.hours.toFixed(1)}h estimated</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                {services.map((svc, i) => (
                  <div key={i} className="flex justify-between items-center py-3">
                    <div>
                      <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc.name}</span>
                      {svc.hours > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs ml-2">{svc.hours.toFixed(1)}h</span>}
                    </div>
                    {svc.amount > 0 && <span className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{sym}{formatPrice(svc.amount)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discount */}
          {quote.discount_type && parseFloat(quote.discount_value) > 0 && (
            <div className="flex justify-between items-center py-2 mb-2 text-sm">
              <span className="text-green-400">
                {quote.discount_reason || 'Discount'}
                {quote.discount_type === 'percentage' ? ` (-${quote.discount_value}%)` : ''}
              </span>
              <span className="text-green-400">
                -{sym}{formatPrice(
                  quote.discount_type === 'percentage'
                    ? (parseFloat(quote.discounted_total ? (parseFloat(quote.total_price) + (parseFloat(quote.total_price) - parseFloat(quote.discounted_total))) : quote.total_price) - parseFloat(quote.total_price))
                    : parseFloat(quote.discount_value)
                )}
              </span>
            </div>
          )}

          {/* Total */}
          <div className="border-t border-[var(--brand-border-strong,#2A3A50)] pt-6 mb-8 text-center">
            {isDepositPaid ? (
              <>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Deposit Paid</p>
                <p className="text-[var(--brand-primary,#007CB1)] text-[2.5rem] font-light">{sym}{formatPrice(quote.amount_paid || quote.deposit_amount || 0)}</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mt-2">
                  Balance due: {sym}{formatPrice(quote.balance_due || ((quote.total_price || 0) - (quote.amount_paid || quote.deposit_amount || 0)))}
                </p>
              </>
            ) : (
              <>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">{isPaid ? 'Total Paid' : 'Total'}</p>
                {quote.discount_type && parseFloat(quote.discount_value) > 0 && quote.discounted_total && (
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-lg line-through mb-1">{sym}{formatPrice(parseFloat(quote.total_price) + (parseFloat(quote.total_price) - parseFloat(quote.discounted_total)))}</p>
                )}
                <p className="text-[var(--brand-primary,#007CB1)] text-[2.5rem] font-light">{sym}{formatPrice(quote.total_price)}</p>
              </>
            )}
            {quote.paid_at && (
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-2">{formatDate(quote.paid_at)}</p>
            )}
          </div>

          {/* PDF Preview */}
          <div className="mb-4 border border-[var(--brand-border,#1A2236)] rounded overflow-hidden">
            <iframe
              src={`/api/quotes/${quote.id}/pdf?token=${params.shareLink}`}
              className="w-full border-0"
              style={{ height: '600px' }}
              title="Quote PDF"
            />
          </div>

          {/* Download PDF */}
          <a
            href={`/api/quotes/${quote.id}/pdf?token=${params.shareLink}`}
            target="_blank"
            rel="noreferrer"
            className="block w-full py-3 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.2em] uppercase text-center hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors mb-4"
          >
            Download PDF
          </a>

          {/* Create Account Prompt (guest → account) */}
          {isPaid && !localStorage.getItem('customer_token') && (
            <div className="bg-white/5 border border-[var(--brand-border,#1A2236)] rounded-lg p-4 mb-4">
              <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium mb-1">Save your aircraft on file</p>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mb-3">Create an account to view job history, recommendations, and book again faster.</p>
              <a href={`/customer/login?email=${encodeURIComponent(quote.client_email || '')}&from=quote`}
                className="block w-full py-3 text-center text-xs uppercase tracking-wider bg-[var(--brand-primary,#007CB1)] text-white rounded hover:opacity-90 transition-opacity">
                Create Account
              </a>
            </div>
          )}

          {/* Tips */}
          {!tipsSent ? (
            <button
              onClick={handleSendTips}
              disabled={paymentLoading}
              className="w-full py-4 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.2em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] disabled:opacity-50 transition-colors"
            >
              {paymentLoading ? 'Sending...' : 'Send Me Preparation Tips'}
            </button>
          ) : (
            <div className="border border-[var(--brand-border-strong,#2A3A50)] p-4 text-center">
              <p className="text-[var(--brand-primary,#007CB1)] text-sm tracking-[0.15em] uppercase">Tips sent to your email</p>
            </div>
          )}

          {/* Contact */}
          {detailer && (
            <div className="mt-8 pt-6 border-t border-[var(--brand-border,#1A2236)] text-center">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Questions</p>
              <div className="flex justify-center gap-6 text-sm">
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.phone}</a>}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.email}</a>}
              </div>
            </div>
          )}
        </div>

        {plan !== 'enterprise' && detailer?.company && <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by {detailer.company}</p>}
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
  // The CC processing fee is NOT rolled into the displayed total anymore.
  // It's disclosed as a muted line beneath the total for both 'pass' and
  // 'customer_choice' modes, and added as a separate Stripe line item at
  // checkout time. This keeps the displayed quote amount honest to what was
  // agreed, while still passing the fee through when the customer pays.
  const ccFee = (ccFeeMode === 'pass' || ccFeeMode === 'customer_choice') ? calculateCcFee(subtotalWithService) : 0;
  const displayTotal = subtotalWithService;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4" style={brandFontBody ? { fontFamily: brandFontBody } : undefined}>
      <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] px-8 py-10 sm:px-10">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Quote</p>
          <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-4" />
          <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs font-mono">{quoteNumber}</p>
        </div>

        {/* Company / Logo */}
        {detailer && (
          <div className="text-center mb-10">
            {detailer.theme_logo_url ? (
              <img src={detailer.theme_logo_url} alt={detailer.company} className="h-10 mx-auto mb-3 object-contain" />
            ) : null}
            <h1 className="font-heading text-3xl font-light text-[var(--brand-text,#F5F5F5)] mb-1" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>{detailer.company}</h1>
            {(detailer.phone || detailer.email) && (
              <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs">
                {[detailer.phone, detailer.email].filter(Boolean).join(' \u00B7 ')}
              </p>
            )}
          </div>
        )}

        {/* Aircraft + Tail */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
          <div>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Aircraft</p>
            <p className="text-[var(--brand-text,#F5F5F5)] text-[1.2rem]">{quote.aircraft_model || quote.aircraft_type}</p>
          </div>
          {quote.tail_number && (
            <div>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Registration</p>
              <p className="text-[var(--brand-text,#F5F5F5)] text-[1.2rem] font-mono">{quote.tail_number}</p>
            </div>
          )}
          {quote.airport && (
            <div>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Location</p>
              <p className="text-[var(--brand-text,#F5F5F5)] text-[1.2rem] font-mono">{quote.airport}</p>
            </div>
          )}
        </div>

        {/* Services */}
        <div className="mb-8">
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Services</p>

          {/* Display mode: package */}
          {detailer?.quote_display_mode === 'package' && (
            <div className="text-center py-4">
              <p className="text-[var(--brand-text,#F5F5F5)] text-lg font-semibold">{detailer.quote_package_name || 'Aircraft Detail Package'}</p>
              <p className="text-[var(--brand-primary,#007CB1)] text-2xl font-bold mt-2">{sym}{formatPrice(quote.total_price)}</p>
              {detailer.quote_show_breakdown && services.length > 0 && (
                <details>
                  <summary className="text-sm cursor-pointer text-blue-400 hover:underline mt-2">View service breakdown</summary>
                  <div className="divide-y divide-[var(--brand-border,#1A2236)] mt-2 text-left">
                    {services.map((svc, i) => (
                      <div key={i} className="flex justify-between items-center py-3">
                        <div>
                          <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc.name}</span>
                          {svc.hours > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs ml-2">{svc.hours.toFixed(1)}h</span>}
                        </div>
                        {svc.amount > 0 && <span className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{sym}{formatPrice(svc.amount)}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Display mode: hours_only */}
          {detailer?.quote_display_mode === 'hours_only' && services.length > 0 && (
            <div className="divide-y divide-[var(--brand-border,#1A2236)]">
              {services.map((svc, i) => (
                <div key={i} className="flex justify-between items-center py-3">
                  <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc.name}</span>
                  {svc.hours > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{svc.hours.toFixed(1)}h estimated</span>}
                </div>
              ))}
            </div>
          )}

          {/* Display mode: itemized (default) — preserves existing quote_display_preference logic */}
          {(!detailer?.quote_display_mode || detailer?.quote_display_mode === 'itemized') && (
            <>
              {/* Full breakdown */}
              {!quote.minimum_fee_applied && detailer?.quote_display_preference === 'full_breakdown' && services.length > 0 && (
                <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                  {services.map((svc, i) => (
                    <div key={i} className="flex justify-between py-3">
                      <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc.name}</span>
                      {svc.amount > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{sym}{formatPrice(svc.amount)}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Labor/products split */}
              {!quote.minimum_fee_applied && detailer?.quote_display_preference === 'labor_products' && (
                <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                  <div className="flex justify-between py-3">
                    <span className="text-[var(--brand-text,#F5F5F5)] text-sm">Labor</span>
                    <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{sym}{formatPrice(parseFloat(quote.labor_total) || basePrice * 0.7)}</span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-[var(--brand-text,#F5F5F5)] text-sm">Products & Materials</span>
                    <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{sym}{formatPrice(parseFloat(quote.products_total) || basePrice * 0.3)}</span>
                  </div>
                </div>
              )}

              {/* Default / package: service names + prices */}
              {(quote.minimum_fee_applied || !detailer?.quote_display_preference || detailer?.quote_display_preference === 'total_only' || detailer?.quote_display_preference === 'package') && services.length > 0 && (
                <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                  {services.map((svc, i) => (
                    <div key={i} className="flex justify-between items-center py-3">
                      <div>
                        <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc.name}</span>
                        {svc.hours > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs ml-2">{svc.hours.toFixed(1)}h</span>}
                      </div>
                      {svc.amount > 0 && <span className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{sym}{formatPrice(svc.amount)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Package discount */}
        {!quote.minimum_fee_applied && quote.discount_percent > 0 && (
          <div className="flex justify-between py-2 text-sm">
            <span className="text-[var(--brand-text-secondary,#8A9BB0)]">Package Discount ({quote.discount_percent}%)</span>
            <span className="text-[var(--brand-primary,#007CB1)]">Included</span>
          </div>
        )}

        {/* Add-on fees */}
        {!quote.minimum_fee_applied && quote.addon_fees && quote.addon_fees.length > 0 && (
          <div className="border-t border-[var(--brand-border,#1A2236)] pt-2 mb-2">
            {quote.addon_fees.map((fee, i) => (
              <div key={i} className="flex justify-between py-2 text-sm">
                <span className="text-[var(--brand-text-secondary,#8A9BB0)]">{fee.name}{fee.fee_type === 'percent' ? ` (${fee.amount}%)` : ''}</span>
                <span className="text-[var(--brand-text-secondary,#8A9BB0)]">+{sym}{formatPrice(fee.calculated)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Total. CC processing fee is not a line item — it's disclosed as a
            muted caption below the total and applied at checkout. */}
        <div className="border-t border-[var(--brand-border-strong,#2A3A50)] pt-8 mb-2 text-center">
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Total</p>
          <p className="text-[var(--brand-primary,#007CB1)] text-[2.5rem] font-light">{sym}{formatPrice(displayTotal)}</p>
          {ccFeeMode === 'pass' && ccFee > 0 && (
            <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs mt-2">
              Card payment adds a {sym}{formatPrice(ccFee)} processing fee
            </p>
          )}
          {ccFeeMode === 'customer_choice' && (
            <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs mt-2">
              Card payment includes +{sym}{formatPrice(ccFee)} processing fee
            </p>
          )}
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="border-l-2 border-[var(--brand-primary,#007CB1)]/40 pl-4 my-6">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm leading-relaxed">{quote.notes}</p>
          </div>
        )}

        {/* Disclaimer */}
        {detailer?.disclaimer_text && (
          <div className="border border-[var(--brand-border,#1A2236)] bg-[var(--brand-surface,#111827)]/50 p-4 mb-4 rounded">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Disclaimer</p>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)]/70 text-xs whitespace-pre-wrap leading-relaxed">
              {detailer.disclaimer_text}
            </p>
          </div>
        )}

        {/* Terms & Conditions */}
        {(detailer?.terms_text || detailer?.terms_pdf_url) && !isPaid && !isExpired && (
          <div className="border border-[var(--brand-border,#1A2236)] p-5 mb-4">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Terms & Conditions</p>
            {detailer.terms_pdf_url ? (
              <a href={detailer.terms_pdf_url} target="_blank" rel="noopener noreferrer"
                className="text-[var(--brand-primary,#007CB1)] text-sm hover:text-[var(--brand-primary,#007CB1)] transition-colors">
                View Terms & Conditions (PDF)
              </a>
            ) : detailer.terms_text ? (
              <div className="text-[var(--brand-text-secondary,#8A9BB0)]/70 text-xs max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
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
              <div className="w-5 h-5 border border-[var(--brand-border-strong,#2A3A50)] peer-checked:border-[var(--brand-primary,#007CB1)] peer-checked:bg-[var(--brand-primary,#007CB1)] transition-colors flex items-center justify-center">
                {agreedToTerms && <span className="text-[var(--brand-btn-text,#0A0E17)] text-xs font-bold">&#10003;</span>}
              </div>
            </div>
            <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm leading-snug">
              I agree to the {(detailer?.terms_text || detailer?.terms_pdf_url) ? 'above ' : ''}Terms & Conditions for this service
            </span>
          </label>
        )}

        {/* Payment Error */}
        {paymentError && (
          <div className="border border-red-500/30 bg-red-500/5 p-4 mb-4">
            <p className="text-red-400 text-sm">{paymentError}</p>
            {detailer && (
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-2">
                Contact {detailer.company}: {' '}
                {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#007CB1)]">{detailer.phone}</a>}
                {detailer.phone && detailer.email && ' or '}
                {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#007CB1)]">{detailer.email}</a>}
              </p>
            )}
          </div>
        )}

        {/* CTA Buttons */}
        {invoiceAccepted ? (
          <div className="border border-[var(--brand-border-strong,#2A3A50)] p-6 text-center">
            <p className="text-[var(--brand-primary,#007CB1)] text-sm tracking-[0.15em] uppercase mb-1">{bookingMode === 'book_later' ? 'Booking Confirmed' : 'Invoice Requested'}</p>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">
              {bookingMode === 'book_later'
                ? `${detailer?.company || 'The detailer'} will invoice you separately for this service.`
                : `${detailer?.company || 'The detailer'} has been notified and will send you an invoice.`}
            </p>
          </div>
        ) : bookingMode === 'book_later' ? (
          <div className="space-y-3">
            <button
              onClick={handleRequestInvoice}
              disabled={invoiceRequesting || !agreedToTerms}
              className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
            >
              {invoiceRequesting ? 'Submitting...' : 'Accept & Schedule'}
            </button>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-[10px] tracking-[0.1em] text-center uppercase">
              Your detailer will invoice you separately
            </p>
          </div>
        ) : bookingMode === 'deposit' && stripeConnected ? (
          <div className="space-y-3">
            <div className="border border-[var(--brand-border-strong,#2A3A50)] p-4 text-center">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">
                {depositPct}% Deposit Required
              </p>
              <p className="text-[var(--brand-primary,#007CB1)] text-2xl font-light">
                {sym}{formatPrice(Math.round((quote.total_price || 0) * depositPct) / 100)}
              </p>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs mt-1">
                Remainder of {sym}{formatPrice((quote.total_price || 0) - Math.round((quote.total_price || 0) * depositPct) / 100)} due at completion
              </p>
            </div>
            <button
              onClick={handleDepositPayment}
              disabled={paymentLoading || !agreedToTerms}
              className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
            >
              {paymentLoading ? 'Processing...' : 'Accept & Pay Deposit'}
            </button>
          </div>
        ) : stripeConnected ? (
          detailer?.cc_fee_mode === 'customer_choice' ? (
            <div className="space-y-3">
              <button
                onClick={handlePayment}
                disabled={paymentLoading || !agreedToTerms}
                className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
              >
                {paymentLoading ? 'Processing...' : 'Accept & Pay'}
              </button>
              <button
                onClick={handleRequestInvoice}
                disabled={invoiceRequesting || !agreedToTerms}
                className="w-full py-4 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.2em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] disabled:opacity-40 transition-colors"
              >
                {invoiceRequesting ? 'Submitting...' : 'Request Invoice'}
              </button>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-[10px] tracking-[0.1em] text-center uppercase">
                Card includes processing fee &middot; Invoice has no additional fees
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handlePayment}
                disabled={paymentLoading || !agreedToTerms}
                className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
              >
                {paymentLoading ? 'Processing...' : 'Accept & Pay'}
              </button>
              {detailer?.cc_fee_mode === 'pass' && (
                <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs text-center">
                  Card payments are subject to a processing fee.
                </p>
              )}
            </div>
          )
        ) : (
          <div className="border border-[var(--brand-border-strong,#2A3A50)] p-6 text-center">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.15em] uppercase mb-2">Contact {detailer?.company || 'Us'} to Arrange Payment</p>
            <div className="space-y-2">
              {detailer?.phone && (
                <a href={`tel:${detailer.phone}`} className="block text-[var(--brand-primary,#007CB1)] text-lg font-medium hover:brightness-110">{detailer.phone}</a>
              )}
              {detailer?.email && (
                <a href={`mailto:${detailer.email}`} className="block text-[var(--brand-primary,#007CB1)] text-sm hover:brightness-110">{detailer.email}</a>
              )}
              {!detailer?.phone && !detailer?.email && (
                <p className="text-[var(--brand-text-secondary,#8A9BB0)]/70 text-sm">{detailer?.company || 'The detailer'} will contact you with payment arrangements.</p>
              )}
            </div>
          </div>
        )}

        {/* Payment disclaimer */}
        {stripeConnected && !isPaid && !isExpired && (
          <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[9px] leading-relaxed mt-4 text-center">
            Payments are processed securely by Stripe. All payment disputes and refund requests
            should be directed to {detailer?.company || 'your service provider'}.
          </p>
        )}

        {/* Valid until */}
        <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.15em] uppercase text-center mt-6">
          Valid until {formatDate(quote.valid_until)}
        </p>
        <p className="text-[var(--brand-text-secondary,#8A9BB0)]/30 text-[10px] text-center mt-1">
          Dates subject to availability, confirmed upon payment.
        </p>

        {/* Questions / Contact */}
        {detailer && (detailer.phone || detailer.email) && (
          <div className="mt-8 pt-6 border-t border-[var(--brand-border,#1A2236)] text-center">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Questions about this quote?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-sm">
              {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.phone}</a>}
              {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors">{detailer.email}</a>}
            </div>
          </div>
        )}

        {/* Download PDF */}
        <div className="mt-6 text-center">
          <a
            href={`/api/quotes/${quote.id}/pdf?token=${params.shareLink}`}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-[10px] tracking-[0.15em] uppercase hover:text-[var(--brand-primary,#007CB1)] transition-colors"
          >
            Download PDF
          </a>
        </div>
      </div>

      {/* Footer — only render if we have a detailer company to attribute to */}
      {detailer?.company && (
        <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by {detailer.company}</p>
      )}
    </div>
  );
}
