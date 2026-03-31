"use client";
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';
import { formatPrice } from '@/lib/formatPrice';
import { getCurrencySymbol } from '@/lib/currency';
import { calculateCcFee } from '@/lib/cc-fee';
import { t, detectBrowserLanguage, SUPPORTED_LANGUAGES } from '@/lib/translations';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

const FLEET_SERVICES = [
  'Exterior Wash',
  'Interior Detail',
  'Leather Conditioning',
  'Carpet Cleaning',
  'Wax',
  'Ceramic Coating',
];

function SetupForm({ token, stripeCustomerId, onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError('');

    const { error: submitErr, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });

    if (submitErr) {
      setError(submitErr.message);
      setProcessing(false);
      return;
    }

    if (setupIntent?.payment_method) {
      const res = await fetch('/api/portal/payment-methods/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          payment_method_id: setupIntent.payment_method,
          stripe_customer_id: stripeCustomerId,
        }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError('Failed to save payment method');
      }
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <div className="flex gap-3 mt-6">
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 py-3 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-bg,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
        >
          {processing ? 'Saving...' : 'Save Card'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.15em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Pending',
  viewed: 'Viewed',
  paid: 'Paid',
  approved: 'Approved',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_COLORS = {
  draft: 'bg-[var(--brand-border,#1A2236)] text-[var(--brand-text-secondary,#8A9BB0)]',
  sent: 'bg-[var(--brand-border,#1A2236)] text-[var(--brand-primary,#007CB1)]',
  viewed: 'bg-[var(--brand-border,#1A2236)] text-[var(--brand-primary,#007CB1)]',
  paid: 'bg-v-gold/10 text-[var(--brand-primary,#007CB1)]',
  approved: 'bg-v-gold/10 text-[var(--brand-primary,#007CB1)]',
  scheduled: 'bg-[var(--brand-border,#1A2236)] text-[var(--brand-text-secondary,#8A9BB0)]',
  in_progress: 'bg-[var(--brand-border,#1A2236)] text-[var(--brand-text-secondary,#8A9BB0)]',
  completed: 'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-red-500/10 text-red-400',
  refunded: 'bg-red-500/10 text-red-400',
};

export default function PortalPage() {
  const params = useParams();
  const token = params.token;

  const [quote, setQuote] = useState(null);
  const [detailer, setDetailer] = useState(null);
  const [history, setHistory] = useState([]);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [rebookLoading, setRebookLoading] = useState(false);
  const [rebookSuccess, setRebookSuccess] = useState(false);
  const [tab, setTab] = useState('quote');
  const [lang, setLang] = useState('en');
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [invoiceRequesting, setInvoiceRequesting] = useState(false);
  const [invoiceAccepted, setInvoiceAccepted] = useState(false);
  const [customerId, setCustomerId] = useState(null);

  // Fleet state
  const [fleet, setFleet] = useState([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetModal, setFleetModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', aircraft: {...} }
  const [fleetForm, setFleetForm] = useState({ tail_number: '', make: '', model: '', home_airport: '', nickname: '' });
  const [fleetSaving, setFleetSaving] = useState(false);
  const [requestModal, setRequestModal] = useState(null); // null | fleet aircraft object
  const [requestForm, setRequestForm] = useState({ services: [], preferred_date: '', notes: '' });
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestResult, setRequestResult] = useState(null);

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [pmLoading, setPmLoading] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [addingPM, setAddingPM] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('vector_portal_lang');
    if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved)) {
      setLang(saved);
    } else {
      setLang(detectBrowserLanguage());
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/portal?token=${token}`);
        if (!res.ok) throw new Error('Quote not found');
        const data = await res.json();
        setQuote(data.quote);
        setDetailer(data.detailer);
        setHistory(data.history || []);
        setStripeConnected(data.stripe_connected);
        if (data.customer_id) setCustomerId(data.customer_id);
        if (data.customer_language && SUPPORTED_LANGUAGES.some(l => l.code === data.customer_language)) {
          setLang(data.customer_language);
          localStorage.setItem('vector_portal_lang', data.customer_language);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const changeLanguage = async (newLang) => {
    setLang(newLang);
    setLangMenuOpen(false);
    localStorage.setItem('vector_portal_lang', newLang);
    fetch('/api/portal/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, language: newLang }),
    }).catch(() => {});
  };

  const T = (key, replacements) => t(lang, key, replacements);

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

  const isPaid = quote && ['paid', 'approved', 'accepted', 'scheduled', 'in_progress', 'completed'].includes(quote.status);
  const isExpired = quote && !isPaid && new Date() > new Date(quote.valid_until);
  const canPay = quote && !isPaid && !isExpired && stripeConnected && ['sent', 'viewed'].includes(quote.status);
  const companyName = detailer?.company || detailer?.name || 'your detailing professional';
  const sym = getCurrencySymbol(detailer?.preferred_currency || 'USD');
  const comparableQuotes = history.filter(h => ['sent', 'viewed'].includes(h.status));
  const hasComparableQuotes = comparableQuotes.length > 0 && !isPaid;

  const handlePayment = async () => {
    setPaymentError('');
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id, shareLink: quote.share_link, agreedToTermsAt: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaymentError(data.error || 'Payment could not be processed');
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setPaymentError('Payment failed. Please try again.');
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
        body: JSON.stringify({ shareLink: quote.share_link }),
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

  const handleRebook = async () => {
    setRebookLoading(true);
    try {
      const res = await fetch('/api/quotes/request-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalQuoteId: quote.id, shareLink: quote.share_link }),
      });
      if (res.ok) setRebookSuccess(true);
    } catch (err) {
      // ignore
    } finally {
      setRebookLoading(false);
    }
  };

  // Fleet functions
  const fetchFleet = useCallback(async () => {
    if (!token) return;
    setFleetLoading(true);
    try {
      const res = await fetch(`/api/portal/fleet?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setFleet(data.fleet || []);
      }
    } catch (e) { /* ignore */ }
    setFleetLoading(false);
  }, [token]);

  const saveFleetAircraft = async () => {
    setFleetSaving(true);
    try {
      const isEdit = fleetModal?.mode === 'edit';
      const res = await fetch('/api/portal/fleet', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          ...(isEdit ? { id: fleetModal.aircraft.id } : {}),
          ...fleetForm,
        }),
      });
      if (res.ok) {
        setFleetModal(null);
        fetchFleet();
      }
    } catch (e) { /* ignore */ }
    setFleetSaving(false);
  };

  const deleteFleetAircraft = async (id) => {
    if (!confirm('Remove this aircraft from your fleet?')) return;
    await fetch(`/api/portal/fleet?token=${token}&id=${id}`, { method: 'DELETE' });
    fetchFleet();
  };

  const submitServiceRequest = async () => {
    setRequestSaving(true);
    setRequestResult(null);
    try {
      const res = await fetch('/api/portal/fleet/request-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          fleet_aircraft_id: requestModal.id,
          services: requestForm.services,
          preferred_date: requestForm.preferred_date || null,
          notes: requestForm.notes || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequestResult(data);
      }
    } catch (e) { /* ignore */ }
    setRequestSaving(false);
  };

  // Payment methods functions
  const fetchPaymentMethods = useCallback(async () => {
    if (!token) return;
    setPmLoading(true);
    try {
      const res = await fetch(`/api/portal/payment-methods?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.payment_methods || []);
      }
    } catch (e) { /* ignore */ }
    setPmLoading(false);
  }, [token]);

  const startAddPaymentMethod = async () => {
    setAddingPM(true);
    try {
      const res = await fetch('/api/portal/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const data = await res.json();
        setSetupClientSecret(data.client_secret);
        setStripeCustomerId(data.stripe_customer_id);
      }
    } catch (e) { /* ignore */ }
    setAddingPM(false);
  };

  const setDefaultPM = async (id) => {
    await fetch('/api/portal/payment-methods', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, payment_method_id: id }),
    });
    fetchPaymentMethods();
  };

  const removePM = async (id) => {
    if (!confirm('Remove this payment method?')) return;
    await fetch(`/api/portal/payment-methods?token=${token}&id=${id}`, { method: 'DELETE' });
    fetchPaymentMethods();
  };

  // Load fleet/payments when switching to those tabs
  useEffect(() => {
    if (tab === 'fleet' && fleet.length === 0 && !fleetLoading) fetchFleet();
    if (tab === 'payments' && paymentMethods.length === 0 && !pmLoading) fetchPaymentMethods();
  }, [tab, fleet.length, fleetLoading, fetchFleet, paymentMethods.length, pmLoading, fetchPaymentMethods]);

  const currentLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === lang)?.label || 'English';

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--brand-bg,#0A0E17)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--brand-primary,#007CB1)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-widest uppercase">{T('loadingQuote')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--brand-bg,#0A0E17)] flex items-center justify-center p-4">
        <div className="bg-[var(--brand-surface,#111827)] rounded-[4px] p-10 max-w-[640px] w-full text-center">
          <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-6" />
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.2em] uppercase mb-3">Error</p>
          <h2 className="font-heading text-xl font-light text-[var(--brand-text,#F5F5F5)] mb-2" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>{T('quoteNotFound')}</h2>
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{T('linkExpiredOrInvalid')}</p>
        </div>
      </div>
    );
  }

  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const rawLineItems = Array.isArray(quote.line_items) && quote.line_items.length > 0
    ? quote.line_items
    : Array.isArray(quote.metadata?.line_items) && quote.metadata.line_items.length > 0
      ? quote.metadata.line_items
      : Array.isArray(quote.selected_services) && quote.selected_services.length > 0
        ? quote.selected_services.map(svc => ({ description: svc.name || svc.description, amount: 0 }))
        : Array.isArray(quote.metadata?.selected_services) && quote.metadata.selected_services.length > 0
          ? quote.metadata.selected_services.map(svc => ({ description: svc.name || svc.description, amount: 0 }))
          : [];
  const lineItems = rawLineItems.filter(li => li.description || li.service || li.name).map(li => ({
    description: li.description || li.service || li.name || 'Service',
    amount: li.amount || 0,
  }));
  const completedJobs = history.filter(h => h.status === 'completed').length;
  const totalSpent = history.filter(h => ['paid', 'approved', 'completed'].includes(h.status)).reduce((sum, h) => sum + (h.total_price || 0), 0) + (isPaid ? (quote.total_price || 0) : 0);

  return (
    <div className="min-h-screen bg-[var(--brand-bg,#0A0E17)]" style={brandFontBody ? { fontFamily: brandFontBody } : undefined}>
      {/* Header */}
      <div className="bg-[var(--brand-surface,#111827)] border-b border-[var(--brand-border,#1A2236)]">
        <div className="max-w-[640px] mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">{T('quoteFrom')}</p>
              {detailer?.theme_logo_url ? (
                <img src={detailer.theme_logo_url} alt={companyName} className="h-8 object-contain" />
              ) : (
                <h1 className="font-heading text-xl font-light text-[var(--brand-text,#F5F5F5)]" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>{companyName}</h1>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 text-[10px] tracking-[0.15em] uppercase font-medium ${STATUS_COLORS[quote.status] || 'bg-[var(--brand-border,#1A2236)] text-[var(--brand-text-secondary,#8A9BB0)]'}`}>
                {STATUS_LABELS[quote.status] || quote.status}
              </span>
              {/* Language selector */}
              <div className="relative">
                <button
                  onClick={() => setLangMenuOpen(prev => !prev)}
                  className="flex items-center gap-1 px-2 py-1 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-xs hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
                  title={T('language')}
                >
                  <span className="text-xs">&#127760;</span>
                  <span className="hidden sm:inline">{currentLangLabel}</span>
                </button>
                {langMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-[var(--brand-surface,#111827)] border border-[var(--brand-border-strong,#2A3A50)] py-1 z-50 min-w-[140px]">
                    {SUPPORTED_LANGUAGES.map(l => (
                      <button
                        key={l.code}
                        onClick={() => changeLanguage(l.code)}
                        className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                          lang === l.code ? 'bg-v-gold/10 text-[var(--brand-primary,#007CB1)]' : 'text-[var(--brand-text-secondary,#8A9BB0)] hover:bg-[var(--brand-border,#1A2236)] hover:text-[var(--brand-text,#F5F5F5)]'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[var(--brand-surface,#111827)] border-b border-[var(--brand-border,#1A2236)] sticky top-0 z-10">
        <div className="max-w-[640px] mx-auto px-6 flex">
          {[
            { key: 'quote', label: T('currentQuote') },
            { key: 'fleet', label: 'My Fleet' },
            { key: 'payments', label: 'Payment' },
            { key: 'history', label: `${T('history')} (${history.length})` },
            { key: 'receipts', label: T('receipts') },
          ].map(tabItem => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`px-4 py-3 text-xs tracking-[0.15em] uppercase font-medium border-b-2 transition-colors ${
                tab === tabItem.key ? 'border-[var(--brand-primary,#007CB1)] text-[var(--brand-primary,#007CB1)]' : 'border-transparent text-[var(--brand-text-secondary,#8A9BB0)] hover:text-[var(--brand-text,#F5F5F5)]'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[640px] mx-auto px-6 py-8">
        {/* === QUOTE TAB === */}
        {tab === 'quote' && (
          <div className="space-y-6">
            {/* Payment CTA */}
            {canPay && (
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border-strong,#2A3A50)] p-8 text-center">
                {(() => {
                  const ccMode = detailer?.cc_fee_mode || 'absorb';
                  const basePrice = parseFloat(quote.total_price) || 0;
                  const ccFee = (ccMode === 'pass') ? calculateCcFee(basePrice) : 0;
                  return (
                    <>
                      <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Total</p>
                      <p className="text-[var(--brand-primary,#007CB1)] text-[2.5rem] font-light mb-1">{sym}{formatPrice(basePrice + ccFee)}</p>
                      {ccFee > 0 && <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs mb-1">Includes {sym}{formatPrice(ccFee)} processing fee</p>}
                    </>
                  );
                })()}
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mb-6">{aircraftDisplay} {T('detail')}</p>

                {paymentError && (
                  <div className="border border-red-500/30 bg-red-500/5 p-3 mb-4 text-left">
                    <p className="text-red-400 text-sm">{paymentError}</p>
                  </div>
                )}

                {/* Terms */}
                {(detailer?.terms_text || detailer?.terms_pdf_url) && (
                  <div className="mb-4 border border-[var(--brand-border,#1A2236)] p-4 text-left">
                    <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Terms & Conditions</p>
                    {detailer.terms_pdf_url ? (
                      <a href={detailer.terms_pdf_url} target="_blank" rel="noopener noreferrer"
                        className="text-[var(--brand-primary,#007CB1)] text-sm hover:text-[#D4B85A] transition-colors">
                        View Terms & Conditions (PDF)
                      </a>
                    ) : (
                      <div className="text-[var(--brand-text-secondary,#8A9BB0)]/70 text-xs max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {detailer.terms_text}
                      </div>
                    )}
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

                {/* Terms checkbox */}
                <label htmlFor="agreePortalTerms" className="flex items-start gap-3 mb-6 cursor-pointer text-left">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      id="agreePortalTerms"
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

                {/* Buttons */}
                {invoiceAccepted ? (
                  <div className="border border-[var(--brand-border-strong,#2A3A50)] p-4">
                    <p className="text-[var(--brand-primary,#007CB1)] text-sm tracking-[0.15em] uppercase mb-1">Invoice Requested</p>
                    <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{detailer?.company || 'The detailer'} will send you an invoice.</p>
                  </div>
                ) : detailer?.cc_fee_mode === 'customer_choice' ? (
                  <div className="space-y-3">
                    <button
                      onClick={handlePayment}
                      disabled={paymentLoading || !agreedToTerms}
                      className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-bg,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
                    >
                      {paymentLoading ? T('processing') : 'Accept & Pay by Card'}
                    </button>
                    <button
                      onClick={handleRequestInvoice}
                      disabled={invoiceRequesting || !agreedToTerms}
                      className="w-full py-4 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.2em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] disabled:opacity-40 transition-colors"
                    >
                      {invoiceRequesting ? 'Submitting...' : 'Request Invoice'}
                    </button>
                    <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-[10px] tracking-[0.1em] uppercase">
                      Card includes processing fee &middot; Invoice has no additional fees
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handlePayment}
                    disabled={paymentLoading || !agreedToTerms}
                    className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-bg,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
                  >
                    {paymentLoading ? T('processing') : T('approveAndPay')}
                  </button>
                )}
              </div>
            )}

            {/* Compare Quotes */}
            {hasComparableQuotes && (
              <a
                href={`/compare/${token}`}
                className="block border border-[var(--brand-border-strong,#2A3A50)] p-5 hover:border-[var(--brand-primary,#007CB1)] transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium group-hover:text-[var(--brand-primary,#007CB1)] transition-colors">{T('compareQuotes')}</p>
                    <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs">{comparableQuotes.length + 1} {T('optionsAvailable')} &middot; {T('seeSideBySide')}</p>
                  </div>
                  <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-xl group-hover:text-[var(--brand-primary,#007CB1)] transition-colors">&#8250;</span>
                </div>
              </a>
            )}

            {/* Paid confirmation */}
            {isPaid && (
              <div className="border border-[var(--brand-border-strong,#2A3A50)] p-8 text-center">
                <p className="text-[var(--brand-primary,#007CB1)] text-[10px] tracking-[0.3em] uppercase mb-4">Confirmed</p>
                <p className="text-[var(--brand-primary,#007CB1)] text-[2.5rem] font-light">{sym}{formatPrice(quote.total_price)}</p>
                {quote.paid_at && (
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-2">
                    {new Date(quote.paid_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}

            {/* Expired */}
            {isExpired && (
              <div className="border border-red-500/20 p-6 text-center">
                <p className="text-red-400 text-sm tracking-[0.15em] uppercase">{T('quoteExpired')}</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mt-1">{T('contactForUpdated', { company: companyName })}</p>
              </div>
            )}

            {/* Quote Details */}
            <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-6">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-6">{T('serviceDetails')}</p>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase">Aircraft</span>
                  <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{aircraftDisplay}</span>
                </div>
                {quote.tail_number && (
                  <div className="flex justify-between">
                    <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase">{T('registration')}</span>
                    <span className="text-[var(--brand-text,#F5F5F5)] text-sm font-mono">{quote.tail_number}</span>
                  </div>
                )}
                {quote.airport && (
                  <div className="flex justify-between">
                    <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase">{T('location')}</span>
                    <span className="text-[var(--brand-text,#F5F5F5)] text-sm font-mono">{quote.airport}</span>
                  </div>
                )}
                {quote.scheduled_date && (
                  <div className="flex justify-between">
                    <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase">{T('scheduled')}</span>
                    <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{new Date(quote.scheduled_date).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                )}
              </div>

              {/* Line items */}
              {lineItems.length > 0 && (
                <div className="border-t border-[var(--brand-border,#1A2236)] pt-4">
                  <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                    {lineItems.map((li, i) => (
                      <div key={i} className="flex justify-between py-3">
                        <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{li.description}</span>
                        {li.amount > 0 && <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{sym}{formatPrice(li.amount)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="border-t border-[var(--brand-border-strong,#2A3A50)] pt-6 mt-4 text-center">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">{T('total')}</p>
                <p className="text-[var(--brand-primary,#007CB1)] text-[2rem] font-light">{sym}{formatPrice(quote.total_price)}</p>
              </div>

              {/* Notes */}
              {quote.notes && (
                <div className="mt-6 border-l-2 border-[var(--brand-primary,#007CB1)]/40 pl-4">
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm leading-relaxed">{quote.notes}</p>
                </div>
              )}
            </div>

            {/* Download Quote PDF */}
            {quote && (
              <a
                href={`/api/quotes/${quote.id}/pdf?token=${token}`}
                target="_blank"
                rel="noreferrer"
                className="block border border-[var(--brand-border-strong,#2A3A50)] p-4 text-center hover:border-[var(--brand-primary,#007CB1)] transition-colors group"
              >
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.15em] uppercase group-hover:text-[var(--brand-primary,#007CB1)] transition-colors">{T('downloadQuotePdf')}</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] mt-1">{T('printSavePdf')}</p>
              </a>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4">
              {isPaid && !rebookSuccess && (
                <button
                  onClick={handleRebook}
                  disabled={rebookLoading}
                  className="border border-[var(--brand-border-strong,#2A3A50)] p-5 text-center hover:border-[var(--brand-primary,#007CB1)] disabled:opacity-50 transition-colors group"
                >
                  <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium group-hover:text-[var(--brand-primary,#007CB1)] transition-colors">{rebookLoading ? T('requesting') : T('bookAgain')}</p>
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-[10px] tracking-[0.1em] uppercase mt-1">{T('sameService')}</p>
                </button>
              )}
              {rebookSuccess && (
                <div className="border border-[var(--brand-border-strong,#2A3A50)] p-5 text-center">
                  <p className="text-[var(--brand-primary,#007CB1)] text-sm tracking-[0.15em] uppercase">{T('requestSent')}</p>
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-1">{T('willSendNewQuote', { company: companyName })}</p>
                </div>
              )}
              {isPaid && (
                <a
                  href={`/api/portal/invoice?id=${quote.id}&token=${token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[var(--brand-border-strong,#2A3A50)] p-5 text-center hover:border-[var(--brand-primary,#007CB1)] transition-colors group block"
                >
                  <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium group-hover:text-[var(--brand-primary,#007CB1)] transition-colors">{T('downloadReceipt')}</p>
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-[10px] tracking-[0.1em] uppercase mt-1">{T('printPdf')}</p>
                </a>
              )}
            </div>

            {/* Detailer Contact */}
            <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-6">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-4">{T('contact')} {companyName}</p>
              <div className="flex flex-wrap gap-4">
                {detailer?.email && (
                  <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#007CB1)] text-sm hover:text-[#D4B85A] transition-colors">
                    {detailer.email}
                  </a>
                )}
                {detailer?.phone && (
                  <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#007CB1)] text-sm hover:text-[#D4B85A] transition-colors">
                    {detailer.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* === FLEET TAB === */}
        {tab === 'fleet' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase">Your Fleet</p>
              <button
                onClick={() => {
                  setFleetForm({ tail_number: '', make: '', model: '', home_airport: '', nickname: '' });
                  setFleetModal({ mode: 'add' });
                }}
                className="px-4 py-2 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-bg,#0A0E17)] text-xs tracking-[0.2em] uppercase font-medium hover:brightness-110 transition-colors"
              >
                Add Aircraft
              </button>
            </div>

            {fleetLoading ? (
              <div className="text-center py-10">
                <div className="w-6 h-6 border-2 border-[var(--brand-primary,#007CB1)] border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : fleet.length === 0 ? (
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-10 text-center">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mb-1">No aircraft in your fleet yet</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-xs">Add aircraft to quickly request service</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fleet.map(ac => (
                  <div key={ac.id} className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-[var(--brand-text,#F5F5F5)] text-lg font-mono">{ac.tail_number}</p>
                        <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{ac.make} {ac.model}{ac.nickname ? ` — ${ac.nickname}` : ''}</p>
                        {ac.home_airport && (
                          <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-xs mt-1 font-mono">{ac.home_airport}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setFleetForm({
                              tail_number: ac.tail_number,
                              make: ac.make || '',
                              model: ac.model || '',
                              home_airport: ac.home_airport || '',
                              nickname: ac.nickname || '',
                            });
                            setFleetModal({ mode: 'edit', aircraft: ac });
                          }}
                          className="text-[var(--brand-text-secondary,#8A9BB0)] hover:text-[var(--brand-primary,#007CB1)] text-xs tracking-[0.15em] uppercase transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteFleetAircraft(ac.id)}
                          className="text-[var(--brand-text-secondary,#8A9BB0)] hover:text-red-400 text-xs tracking-[0.15em] uppercase transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setRequestForm({ services: [], preferred_date: '', notes: '' });
                        setRequestResult(null);
                        setRequestModal(ac);
                      }}
                      className="w-full py-3 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.2em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
                    >
                      Request Service
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Fleet Add/Edit Modal */}
            {fleetModal && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setFleetModal(null)}>
                <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border-strong,#2A3A50)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-6">
                    {fleetModal.mode === 'edit' ? 'Edit Aircraft' : 'Add Aircraft'}
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-1">Tail Number *</label>
                      <input
                        value={fleetForm.tail_number}
                        onChange={e => setFleetForm(f => ({ ...f, tail_number: e.target.value }))}
                        className="w-full bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] px-3 py-2 text-[var(--brand-text,#F5F5F5)] text-sm font-mono focus:border-[var(--brand-primary,#007CB1)] outline-none"
                        placeholder="N12345"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-1">Make</label>
                        <input
                          value={fleetForm.make}
                          onChange={e => setFleetForm(f => ({ ...f, make: e.target.value }))}
                          className="w-full bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] px-3 py-2 text-[var(--brand-text,#F5F5F5)] text-sm focus:border-[var(--brand-primary,#007CB1)] outline-none"
                          placeholder="Gulfstream"
                        />
                      </div>
                      <div>
                        <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-1">Model</label>
                        <input
                          value={fleetForm.model}
                          onChange={e => setFleetForm(f => ({ ...f, model: e.target.value }))}
                          className="w-full bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] px-3 py-2 text-[var(--brand-text,#F5F5F5)] text-sm focus:border-[var(--brand-primary,#007CB1)] outline-none"
                          placeholder="G650"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-1">Home Airport (ICAO)</label>
                        <input
                          value={fleetForm.home_airport}
                          onChange={e => setFleetForm(f => ({ ...f, home_airport: e.target.value }))}
                          className="w-full bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] px-3 py-2 text-[var(--brand-text,#F5F5F5)] text-sm font-mono focus:border-[var(--brand-primary,#007CB1)] outline-none"
                          placeholder="KTEB"
                          maxLength={4}
                        />
                      </div>
                      <div>
                        <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-1">Nickname</label>
                        <input
                          value={fleetForm.nickname}
                          onChange={e => setFleetForm(f => ({ ...f, nickname: e.target.value }))}
                          className="w-full bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] px-3 py-2 text-[var(--brand-text,#F5F5F5)] text-sm focus:border-[var(--brand-primary,#007CB1)] outline-none"
                          placeholder="The Boss"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={saveFleetAircraft}
                      disabled={!fleetForm.tail_number || fleetSaving}
                      className="flex-1 py-3 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-bg,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
                    >
                      {fleetSaving ? 'Saving...' : fleetModal.mode === 'edit' ? 'Update' : 'Add Aircraft'}
                    </button>
                    <button
                      onClick={() => setFleetModal(null)}
                      className="px-6 py-3 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.15em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Request Service Modal */}
            {requestModal && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRequestModal(null)}>
                <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border-strong,#2A3A50)] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                  <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Request Service</p>
                  <p className="text-[var(--brand-text,#F5F5F5)] text-sm mb-6">
                    {requestModal.make} {requestModal.model} — <span className="font-mono">{requestModal.tail_number}</span>
                  </p>

                  {requestResult ? (
                    <div className="text-center py-4">
                      <p className="text-[var(--brand-primary,#007CB1)] text-sm tracking-[0.15em] uppercase mb-2">Request Submitted</p>
                      <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">
                        {requestResult.routed_to === 'detailer'
                          ? `Your request has been sent to ${requestResult.detailer_name}. They'll contact you with a quote.`
                          : 'Your request has been received. Our team will find a detailer near you.'}
                      </p>
                      <button
                        onClick={() => setRequestModal(null)}
                        className="mt-6 px-6 py-3 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.15em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div>
                          <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-2">Services</label>
                          <div className="space-y-2">
                            {FLEET_SERVICES.map(svc => (
                              <label key={svc} className="flex items-center gap-3 cursor-pointer">
                                <div className="relative flex-shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={requestForm.services.includes(svc)}
                                    onChange={() => {
                                      setRequestForm(f => ({
                                        ...f,
                                        services: f.services.includes(svc)
                                          ? f.services.filter(s => s !== svc)
                                          : [...f.services, svc],
                                      }));
                                    }}
                                    className="sr-only peer"
                                  />
                                  <div className="w-4 h-4 border border-[var(--brand-border-strong,#2A3A50)] peer-checked:border-[var(--brand-primary,#007CB1)] peer-checked:bg-[var(--brand-primary,#007CB1)] transition-colors flex items-center justify-center">
                                    {requestForm.services.includes(svc) && <span className="text-[var(--brand-bg,#0A0E17)] text-[10px] font-bold">&#10003;</span>}
                                  </div>
                                </div>
                                <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{svc}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-1">Preferred Date</label>
                          <input
                            type="date"
                            value={requestForm.preferred_date}
                            onChange={e => setRequestForm(f => ({ ...f, preferred_date: e.target.value }))}
                            className="w-full bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] px-3 py-2 text-[var(--brand-text,#F5F5F5)] text-sm focus:border-[var(--brand-primary,#007CB1)] outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase block mb-1">Notes</label>
                          <textarea
                            value={requestForm.notes}
                            onChange={e => setRequestForm(f => ({ ...f, notes: e.target.value }))}
                            rows={3}
                            className="w-full bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] px-3 py-2 text-[var(--brand-text,#F5F5F5)] text-sm focus:border-[var(--brand-primary,#007CB1)] outline-none resize-none"
                            placeholder="Any special instructions..."
                          />
                        </div>
                      </div>
                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={submitServiceRequest}
                          disabled={requestForm.services.length === 0 || requestSaving}
                          className="flex-1 py-3 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-bg,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
                        >
                          {requestSaving ? 'Submitting...' : 'Submit Request'}
                        </button>
                        <button
                          onClick={() => setRequestModal(null)}
                          className="px-6 py-3 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-sm tracking-[0.15em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === PAYMENT METHODS TAB === */}
        {tab === 'payments' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase">Payment Methods</p>
              {!setupClientSecret && (
                <button
                  onClick={startAddPaymentMethod}
                  disabled={addingPM}
                  className="px-4 py-2 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-bg,#0A0E17)] text-xs tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
                >
                  {addingPM ? 'Loading...' : 'Add Card'}
                </button>
              )}
            </div>

            {/* Stripe Elements form */}
            {setupClientSecret && (
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border-strong,#2A3A50)] p-6">
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: setupClientSecret,
                    appearance: {
                      theme: 'night',
                      variables: {
                        colorPrimary: '#007CB1',
                        colorBackground: '#0A0E17',
                        colorText: '#F5F5F5',
                        colorDanger: '#ef4444',
                        borderRadius: '0px',
                      },
                    },
                  }}
                >
                  <SetupForm
                    token={token}
                    stripeCustomerId={stripeCustomerId}
                    onSuccess={() => {
                      setSetupClientSecret(null);
                      fetchPaymentMethods();
                    }}
                    onCancel={() => setSetupClientSecret(null)}
                  />
                </Elements>
              </div>
            )}

            {pmLoading ? (
              <div className="text-center py-10">
                <div className="w-6 h-6 border-2 border-[var(--brand-primary,#007CB1)] border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : paymentMethods.length === 0 && !setupClientSecret ? (
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-10 text-center">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mb-1">No payment methods saved</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-xs">Save a card for faster checkout</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map(pm => (
                  <div key={pm.id} className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-7 bg-[var(--brand-bg,#0A0E17)] border border-[var(--brand-border-strong,#2A3A50)] flex items-center justify-center">
                          <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] uppercase">{pm.brand || pm.type}</span>
                        </div>
                        <div>
                          <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-mono">
                            •••• {pm.last4}
                            {pm.is_default && (
                              <span className="ml-2 text-[var(--brand-primary,#007CB1)] text-[10px] tracking-[0.1em] uppercase font-medium">Default</span>
                            )}
                          </p>
                          {pm.exp_month && pm.exp_year && (
                            <p className="text-[var(--brand-text-secondary,#8A9BB0)]/50 text-xs">Exp {String(pm.exp_month).padStart(2, '0')}/{pm.exp_year}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!pm.is_default && (
                          <button
                            onClick={() => setDefaultPM(pm.id)}
                            className="text-[var(--brand-text-secondary,#8A9BB0)] hover:text-[var(--brand-primary,#007CB1)] text-xs tracking-[0.15em] uppercase transition-colors"
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => removePM(pm.id)}
                          className="text-[var(--brand-text-secondary,#8A9BB0)] hover:text-red-400 text-xs tracking-[0.15em] uppercase transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === HISTORY TAB === */}
        {tab === 'history' && (
          <div className="space-y-6">
            {/* Customer stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5 text-center">
                <p className="text-[var(--brand-primary,#007CB1)] text-2xl font-light">{history.length + 1}</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.15em] uppercase mt-1">{T('totalQuotes')}</p>
              </div>
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5 text-center">
                <p className="text-emerald-400 text-2xl font-light">{completedJobs}</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.15em] uppercase mt-1">{T('completed')}</p>
              </div>
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5 text-center">
                <p className="text-[var(--brand-primary,#007CB1)] text-2xl font-light">{sym}{formatPrice(totalSpent)}</p>
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.15em] uppercase mt-1">{T('totalSpent')}</p>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-10 text-center">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{T('firstQuote', { company: companyName })}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map(h => (
                  <a
                    key={h.id}
                    href={`/portal/${h.share_link}`}
                    className="block bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5 hover:border-[var(--brand-primary,#007CB1)] transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{h.aircraft_model || h.aircraft_type || 'Aircraft'}</p>
                        <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs mt-1">
                          {new Date(h.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{sym}{formatPrice(h.total_price)}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase font-medium ${STATUS_COLORS[h.status] || 'bg-[var(--brand-border,#1A2236)] text-[var(--brand-text-secondary,#8A9BB0)]'}`}>
                          {STATUS_LABELS[h.status] || h.status}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === RECEIPTS TAB === */}
        {tab === 'receipts' && (
          <div className="space-y-4">
            {isPaid && (
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{aircraftDisplay}</p>
                    <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs mt-1">
                      {quote.paid_at && new Date(quote.paid_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="text-[var(--brand-text,#F5F5F5)] font-medium">{sym}{formatPrice(quote.total_price)}</p>
                      <span className="text-[var(--brand-primary,#007CB1)] text-[10px] tracking-[0.1em] uppercase">{T('paid')}</span>
                    </div>
                    <a
                      href={`/api/portal/invoice?id=${quote.id}&token=${token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.15em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
                    >
                      PDF
                    </a>
                  </div>
                </div>
              </div>
            )}

            {history.filter(h => ['paid', 'approved', 'completed'].includes(h.status)).map(h => (
              <div key={h.id} className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{h.aircraft_model || h.aircraft_type || 'Aircraft'}</p>
                    <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs mt-1">
                      {h.paid_at ? new Date(h.paid_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' }) : new Date(h.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="text-[var(--brand-text,#F5F5F5)] font-medium">{sym}{formatPrice(h.total_price)}</p>
                      <span className="text-[var(--brand-primary,#007CB1)] text-[10px] tracking-[0.1em] uppercase">{STATUS_LABELS[h.status]}</span>
                    </div>
                    <a
                      href={`/api/portal/invoice?id=${h.id}&token=${token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 border border-[var(--brand-border-strong,#2A3A50)] text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.15em] uppercase hover:border-[var(--brand-primary,#007CB1)] hover:text-[var(--brand-primary,#007CB1)] transition-colors"
                    >
                      PDF
                    </a>
                  </div>
                </div>
              </div>
            ))}

            {!isPaid && history.filter(h => ['paid', 'approved', 'completed'].includes(h.status)).length === 0 && (
              <div className="bg-[var(--brand-surface,#111827)] border border-[var(--brand-border,#1A2236)] p-10 text-center">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">{T('noReceipts')}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-10 pb-8">
          <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.3em] uppercase">Powered by <a href="https://shinyjets.com" className="hover:text-[var(--brand-primary,#007CB1)] transition-colors">Shiny Jets</a></p>
        </div>
      </div>
    </div>
  );
}
