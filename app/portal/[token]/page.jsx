"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';
import { formatPrice } from '@/lib/formatPrice';
import { getCurrencySymbol } from '@/lib/currency';
import { t, detectBrowserLanguage, SUPPORTED_LANGUAGES } from '@/lib/translations';

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
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  approved: 'bg-green-100 text-green-700',
  scheduled: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-red-100 text-red-700',
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

  // Detect browser language on mount
  useEffect(() => {
    const saved = localStorage.getItem('vector_portal_lang');
    if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved)) {
      setLang(saved);
    } else {
      setLang(detectBrowserLanguage());
    }
  }, []);

  // Also set lang from API response if customer has a saved preference
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
        // If customer has a saved language preference, use it
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
    // Save to server (fire-and-forget)
    fetch('/api/portal/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, language: newLang }),
    }).catch(() => {});
  };

  const T = (key, replacements) => t(lang, key, replacements);

  const isPaid = quote && ['paid', 'approved', 'scheduled', 'in_progress', 'completed'].includes(quote.status);
  const isExpired = quote && !isPaid && new Date() > new Date(quote.valid_until);
  const canPay = quote && !isPaid && !isExpired && stripeConnected && ['sent', 'viewed'].includes(quote.status);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const sym = getCurrencySymbol(detailer?.currency || 'USD');
  const comparableQuotes = history.filter(h => ['sent', 'viewed'].includes(h.status));
  const hasComparableQuotes = comparableQuotes.length > 0 && !isPaid;

  const handlePayment = async () => {
    setPaymentError('');
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id, shareLink: quote.share_link }),
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

  const handleRebook = async () => {
    setRebookLoading(true);
    try {
      const res = await fetch('/api/quotes/request-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalQuoteId: quote.id, shareLink: quote.share_link }),
      });
      if (res.ok) {
        setRebookSuccess(true);
      }
    } catch (err) {
      // ignore
    } finally {
      setRebookLoading(false);
    }
  };

  const currentLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === lang)?.label || 'English';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">{T('loadingQuote')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-3">!</div>
          <h2 className="text-lg font-semibold mb-2">{T('quoteNotFound')}</h2>
          <p className="text-gray-600">{T('linkExpiredOrInvalid')}</p>
        </div>
      </div>
    );
  }

  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const lineItems = Array.isArray(quote.line_items) ? quote.line_items.filter(li => li.description && li.amount > 0) : [];
  const completedJobs = history.filter(h => h.status === 'completed').length;
  const totalSpent = history.filter(h => ['paid', 'approved', 'completed'].includes(h.status)).reduce((sum, h) => sum + (h.total_price || 0), 0) + (isPaid ? (quote.total_price || 0) : 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm">{T('quoteFrom')}</p>
              <h1 className="text-xl font-bold">{companyName}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[quote.status] || 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABELS[quote.status] || quote.status}
              </span>
              {/* Language selector */}
              <div className="relative">
                <button
                  onClick={() => setLangMenuOpen(prev => !prev)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs transition-colors"
                  title={T('language')}
                >
                  <span>&#127760;</span>
                  <span className="hidden sm:inline">{currentLangLabel}</span>
                </button>
                {langMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border py-1 z-50 min-w-[140px]">
                    {SUPPORTED_LANGUAGES.map(l => (
                      <button
                        key={l.code}
                        onClick={() => changeLanguage(l.code)}
                        className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                          lang === l.code ? 'bg-[#1e3a5f] text-white' : 'text-gray-700 hover:bg-gray-100'
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
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 flex">
          {[
            { key: 'quote', label: T('currentQuote') },
            { key: 'history', label: `${T('history')} (${history.length})` },
            { key: 'receipts', label: T('receipts') },
          ].map(tabItem => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === tabItem.key ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* === QUOTE TAB === */}
        {tab === 'quote' && (
          <div className="space-y-4">
            {/* Payment CTA */}
            {canPay && (
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl p-5 text-white text-center">
                <p className="text-2xl font-bold mb-1">{sym}{formatPrice(quote.total_price)}</p>
                <p className="text-white/80 text-sm mb-4">{aircraftDisplay} {T('detail')}</p>
                {paymentError && <p className="text-white bg-red-600/30 rounded p-2 mb-3 text-sm">{paymentError}</p>}
                <button
                  onClick={handlePayment}
                  disabled={paymentLoading}
                  className="bg-white text-amber-600 font-semibold px-8 py-3 rounded-lg hover:bg-amber-50 disabled:opacity-50 transition-colors"
                >
                  {paymentLoading ? T('processing') : T('approveAndPay')}
                </button>
              </div>
            )}

            {/* Compare Quotes banner */}
            {hasComparableQuotes && (
              <a
                href={`/compare/${token}`}
                className="block bg-white border-2 border-[#1e3a5f] rounded-xl p-4 hover:bg-[#1e3a5f]/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center text-lg">&#9878;</div>
                    <div>
                      <p className="font-semibold text-[#1e3a5f]">{T('compareQuotes')}</p>
                      <p className="text-xs text-gray-500">{comparableQuotes.length + 1} {T('optionsAvailable')} &middot; {T('seeSideBySide')}</p>
                    </div>
                  </div>
                  <span className="text-[#1e3a5f] text-xl">&#8250;</span>
                </div>
              </a>
            )}

            {/* Paid confirmation */}
            {isPaid && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <div className="text-green-600 text-3xl mb-2">&#10003;</div>
                <p className="font-semibold text-green-800 text-lg">{T('paymentConfirmed')}</p>
                <p className="text-green-700 text-2xl font-bold mt-1">{sym}{formatPrice(quote.total_price)}</p>
                {quote.paid_at && (
                  <p className="text-green-600 text-sm mt-1">
                    {new Date(quote.paid_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}

            {/* Expired */}
            {isExpired && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
                <p className="font-semibold text-red-800">{T('quoteExpired')}</p>
                <p className="text-red-600 text-sm mt-1">{T('contactForUpdated', { company: companyName })}</p>
              </div>
            )}

            {/* Quote Details */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-[#1e3a5f] mb-4">{T('serviceDetails')}</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">{T('aircraft')}</span>
                  <span className="font-semibold">{aircraftDisplay}</span>
                </div>
                {quote.tail_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{T('registration')}</span>
                    <span className="font-medium">{quote.tail_number}</span>
                  </div>
                )}
                {quote.airport && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{T('location')}</span>
                    <span className="font-medium">{quote.airport}</span>
                  </div>
                )}
                {quote.scheduled_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{T('scheduled')}</span>
                    <span className="font-medium">{new Date(quote.scheduled_date).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                )}
              </div>

              {/* Line items */}
              {lineItems.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  {lineItems.map((li, i) => (
                    <div key={i} className="flex justify-between py-2">
                      <span className="text-gray-700">{li.description}</span>
                      <span className="font-medium">{sym}{formatPrice(li.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 mt-2 border-t-2 border-[#1e3a5f]">
                    <span className="font-semibold text-[#1e3a5f] text-lg">{T('total')}</span>
                    <span className="font-bold text-[#1e3a5f] text-lg">{sym}{formatPrice(quote.total_price)}</span>
                  </div>
                </div>
              )}

              {lineItems.length === 0 && (
                <div className="flex justify-between pt-4 mt-4 border-t-2 border-[#1e3a5f]">
                  <span className="font-semibold text-[#1e3a5f] text-lg">{T('total')}</span>
                  <span className="font-bold text-[#1e3a5f] text-lg">{sym}{formatPrice(quote.total_price)}</span>
                </div>
              )}

              {quote.notes && (
                <div className="mt-4 p-3 bg-amber-50 border-l-4 border-amber-400 rounded-r text-sm text-amber-800">
                  <strong>{T('note')}:</strong> {quote.notes}
                </div>
              )}
            </div>

            {/* Download Quote PDF */}
            {quote && (
              <a
                href={`/api/quotes/${quote.id}/pdf?token=${token}`}
                target="_blank"
                rel="noreferrer"
                className="block bg-white border-2 border-gray-200 text-gray-700 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors"
              >
                <div className="text-2xl mb-1">&#128196;</div>
                <p className="font-semibold text-sm">{T('downloadQuotePdf')}</p>
                <p className="text-xs text-gray-500">{T('printSavePdf')}</p>
              </a>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              {/* Rebook */}
              {isPaid && !rebookSuccess && (
                <button
                  onClick={handleRebook}
                  disabled={rebookLoading}
                  className="bg-white border-2 border-[#1e3a5f] text-[#1e3a5f] rounded-xl p-4 text-center hover:bg-[#1e3a5f]/5 disabled:opacity-50 transition-colors"
                >
                  <div className="text-2xl mb-1">&#128260;</div>
                  <p className="font-semibold text-sm">{rebookLoading ? T('requesting') : T('bookAgain')}</p>
                  <p className="text-xs text-gray-500">{T('sameService')}</p>
                </button>
              )}
              {rebookSuccess && (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">&#10003;</div>
                  <p className="font-semibold text-sm text-green-700">{T('requestSent')}</p>
                  <p className="text-xs text-green-600">{T('willSendNewQuote', { company: companyName })}</p>
                </div>
              )}

              {/* Download Receipt */}
              {isPaid && (
                <a
                  href={`/api/portal/invoice?id=${quote.id}&token=${token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-white border-2 border-gray-200 text-gray-700 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors block"
                >
                  <div className="text-2xl mb-1">&#128196;</div>
                  <p className="font-semibold text-sm">{T('downloadReceipt')}</p>
                  <p className="text-xs text-gray-500">{T('printPdf')}</p>
                </a>
              )}
            </div>

            {/* Detailer Contact */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h3 className="font-semibold text-[#1e3a5f] mb-3">{T('contact')} {companyName}</h3>
              <div className="flex flex-wrap gap-3">
                {detailer?.email && (
                  <a href={`mailto:${detailer.email}`} className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                    <span>&#9993;</span> {detailer.email}
                  </a>
                )}
                {detailer?.phone && (
                  <a href={`tel:${detailer.phone}`} className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                    <span>&#128222;</span> {detailer.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* === HISTORY TAB === */}
        {tab === 'history' && (
          <div className="space-y-4">
            {/* Customer stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                <p className="text-2xl font-bold text-[#1e3a5f]">{history.length + 1}</p>
                <p className="text-xs text-gray-500">{T('totalQuotes')}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{completedJobs}</p>
                <p className="text-xs text-gray-500">{T('completed')}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                <p className="text-2xl font-bold text-[#1e3a5f]">{sym}{formatPrice(totalSpent)}</p>
                <p className="text-xs text-gray-500">{T('totalSpent')}</p>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                <p className="text-gray-500">{T('firstQuote', { company: companyName })}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map(h => (
                  <a
                    key={h.id}
                    href={`/portal/${h.share_link}`}
                    className="block bg-white rounded-xl shadow-sm border p-4 hover:border-[#1e3a5f]/30 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{h.aircraft_model || h.aircraft_type || 'Aircraft'}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(h.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{sym}{formatPrice(h.total_price)}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[h.status] || 'bg-gray-100 text-gray-700'}`}>
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
            {/* Current quote receipt */}
            {isPaid && (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{aircraftDisplay}</p>
                    <p className="text-sm text-gray-500">
                      {quote.paid_at && new Date(quote.paid_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="font-bold text-lg">{sym}{formatPrice(quote.total_price)}</p>
                      <span className="text-xs text-green-600 font-medium">{T('paid')}</span>
                    </div>
                    <a
                      href={`/api/portal/invoice?id=${quote.id}&token=${token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      PDF
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Past receipts */}
            {history.filter(h => ['paid', 'approved', 'completed'].includes(h.status)).map(h => (
              <div key={h.id} className="bg-white rounded-xl shadow-sm border p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{h.aircraft_model || h.aircraft_type || 'Aircraft'}</p>
                    <p className="text-sm text-gray-500">
                      {h.paid_at ? new Date(h.paid_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' }) : new Date(h.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : lang, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="font-bold text-lg">{sym}{formatPrice(h.total_price)}</p>
                      <span className="text-xs text-green-600 font-medium">{STATUS_LABELS[h.status]}</span>
                    </div>
                    <a
                      href={`/api/portal/invoice?id=${h.id}&token=${token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      PDF
                    </a>
                  </div>
                </div>
              </div>
            ))}

            {!isPaid && history.filter(h => ['paid', 'approved', 'completed'].includes(h.status)).length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                <p className="text-gray-500">{T('noReceipts')}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 pb-8">
          <p className="text-xs text-gray-400">{T('poweredBy')} <a href="https://vectorav.ai" className="underline">Vector</a></p>
        </div>
      </div>
    </div>
  );
}
