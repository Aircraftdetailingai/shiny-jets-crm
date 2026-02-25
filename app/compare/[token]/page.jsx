"use client";
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';
import { formatPrice } from '@/lib/formatPrice';
import { getCurrencySymbol } from '@/lib/currency';

const STATUS_LABELS = {
  sent: 'Pending',
  viewed: 'Viewed',
  paid: 'Paid',
  approved: 'Approved',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const STATUS_COLORS = {
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  approved: 'bg-green-100 text-green-700',
  scheduled: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

const SERVICE_LABELS = {
  exterior: 'Exterior Wash & Detail',
  interior: 'Interior Detail',
  brightwork: 'Brightwork Polish',
  ceramic: 'Ceramic Coating',
  engine: 'Engine Detail',
  decon: 'Decontamination',
  polish: 'Paint Correction',
  wax: 'Wax / Sealant',
  carpet: 'Carpet Cleaning',
  leather: 'Leather Treatment',
  lavatory: 'Lavatory Detail',
  galley: 'Galley Detail',
  windows: 'Window Treatment',
  landing_gear: 'Landing Gear',
  belly: 'Belly Wash',
  dry_wash: 'Dry Wash',
  ext_wash: 'Exterior Wash',
};

function getServiceList(services) {
  if (!services) return [];
  if (Array.isArray(services)) return services;
  return Object.entries(services)
    .filter(([, v]) => v === true)
    .map(([k]) => SERVICE_LABELS[k] || k);
}

function getAllServices(quotes) {
  const all = new Set();
  for (const q of quotes) {
    for (const svc of getServiceList(q.services)) {
      all.add(svc);
    }
    if (q.line_items && Array.isArray(q.line_items)) {
      for (const li of q.line_items) {
        if (li.description) all.add(li.description);
      }
    }
  }
  return Array.from(all);
}

function quoteHasService(quote, serviceName) {
  const services = getServiceList(quote.services);
  if (services.some(s => s === serviceName)) return true;
  if (quote.line_items && Array.isArray(quote.line_items)) {
    return quote.line_items.some(li => li.description === serviceName);
  }
  return false;
}

function getLineItemPrice(quote, serviceName) {
  if (!quote.line_items || !Array.isArray(quote.line_items)) return null;
  const item = quote.line_items.find(li => li.description === serviceName);
  return item ? item.amount : null;
}

export default function CompareQuotesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token;
  const idsParam = searchParams.get('ids');

  const [quotes, setQuotes] = useState([]);
  const [primaryId, setPrimaryId] = useState(null);
  const [detailer, setDetailer] = useState(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    if (!token) return;
    const fetchData = async () => {
      try {
        let url = `/api/portal/compare?token=${token}`;
        if (idsParam) url += `&ids=${idsParam}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not load quotes');
        const data = await res.json();
        setQuotes(data.quotes || []);
        setPrimaryId(data.primary_quote_id);
        setDetailer(data.detailer);
        setStripeConnected(data.stripe_connected);
        // Pre-select the primary quote
        setSelected(data.primary_quote_id);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, idsParam]);

  const sym = getCurrencySymbol(detailer?.currency || 'USD');
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';

  const handlePayment = async (quoteId) => {
    setPaymentError('');
    setPaymentLoading(true);
    try {
      const selectedQuote = quotes.find(q => q.id === quoteId);
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, shareLink: selectedQuote?.share_link }),
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">Loading quotes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-3">!</div>
          <h2 className="text-lg font-semibold mb-2">Unable to Load Quotes</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (quotes.length < 2) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">&#128203;</div>
          <h2 className="text-lg font-semibold mb-2">Only One Quote Available</h2>
          <p className="text-gray-600 mb-4">There is only one quote to review.</p>
          <a
            href={`/portal/${token}`}
            className="inline-block px-6 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium hover:opacity-90"
          >
            View Quote
          </a>
        </div>
      </div>
    );
  }

  // Sort: unpaid first, then by price ascending
  const sortedQuotes = [...quotes].sort((a, b) => {
    const aPaid = ['paid', 'approved', 'completed'].includes(a.status) ? 1 : 0;
    const bPaid = ['paid', 'approved', 'completed'].includes(b.status) ? 1 : 0;
    if (aPaid !== bPaid) return aPaid - bPaid;
    return (a.total_price || 0) - (b.total_price || 0);
  });

  const allServices = getAllServices(sortedQuotes);
  const prices = sortedQuotes.map(q => q.total_price || 0);
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);

  // Recommend: most services for the price (best value)
  const scored = sortedQuotes.map(q => {
    const serviceCount = getServiceList(q.services).length + (q.line_items?.length || 0);
    const price = q.total_price || 1;
    const isPaid = ['paid', 'approved', 'completed'].includes(q.status);
    return { id: q.id, score: isPaid ? -1 : serviceCount / price };
  });
  const recommendedId = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)[0]?.id;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <a href={`/portal/${token}`} className="text-white/60 text-sm hover:text-white/90 flex items-center gap-1 mb-1">
                &#8592; Back to Portal
              </a>
              <h1 className="text-xl font-bold">Compare Quotes</h1>
              <p className="text-white/70 text-sm">{companyName} &middot; {sortedQuotes.length} options</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {paymentError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-700 text-sm">{paymentError}</p>
          </div>
        )}

        {/* === MOBILE VIEW: Cards === */}
        <div className="md:hidden space-y-4">
          {sortedQuotes.map((q, idx) => {
            const isPaid = ['paid', 'approved', 'completed'].includes(q.status);
            const isExpired = !isPaid && q.valid_until && new Date() > new Date(q.valid_until);
            const canPay = !isPaid && !isExpired && stripeConnected && ['sent', 'viewed'].includes(q.status);
            const isLowest = q.total_price === lowestPrice && sortedQuotes.length > 1;
            const isRecommended = q.id === recommendedId;
            const isSelected = selected === q.id;
            const services = getServiceList(q.services);
            const lineItems = Array.isArray(q.line_items) ? q.line_items.filter(li => li.description && li.amount > 0) : [];

            return (
              <div
                key={q.id}
                onClick={() => !isPaid && setSelected(q.id)}
                className={`bg-white rounded-xl shadow-sm border-2 p-5 transition-all cursor-pointer ${
                  isSelected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {isRecommended && !isPaid && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">Best Value</span>
                  )}
                  {isLowest && !isPaid && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Lowest Price</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABELS[q.status] || q.status}
                  </span>
                </div>

                {/* Aircraft + Price */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-[#1e3a5f] text-lg">{q.aircraft_model || q.aircraft_type || 'Aircraft'}</h3>
                    {q.tail_number && <p className="text-xs text-gray-400">{q.tail_number}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${isLowest && !isPaid ? 'text-green-600' : 'text-[#1e3a5f]'}`}>
                      {sym}{formatPrice(q.total_price)}
                    </p>
                  </div>
                </div>

                {/* Services */}
                <div className="space-y-1.5 mb-4">
                  {services.map((svc, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-green-500 text-xs">&#10003;</span>
                      <span className="text-gray-700">{svc}</span>
                    </div>
                  ))}
                  {lineItems.map((li, i) => (
                    <div key={`li-${i}`} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-green-500 text-xs">&#10003;</span>
                        <span className="text-gray-700">{li.description}</span>
                      </div>
                      <span className="text-gray-500">{sym}{formatPrice(li.amount)}</span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {q.notes && (
                  <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r p-2 mb-3">
                    <p className="text-xs text-blue-800">{q.notes}</p>
                  </div>
                )}

                {/* Valid until */}
                {q.valid_until && !isPaid && (
                  <p className="text-xs text-gray-400 mb-3">
                    {isExpired ? 'Expired' : `Valid until ${new Date(q.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </p>
                )}

                {/* Action */}
                {isPaid && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-green-700 font-semibold text-sm">&#10003; Paid</p>
                  </div>
                )}
                {canPay && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePayment(q.id); }}
                    disabled={paymentLoading}
                    className="w-full py-3 rounded-lg text-white font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 disabled:opacity-50"
                  >
                    {paymentLoading ? 'Processing...' : `Select & Pay ${sym}${formatPrice(q.total_price)}`}
                  </button>
                )}
                {isExpired && (
                  <p className="text-center text-sm text-red-500 font-medium">Quote Expired</p>
                )}
              </div>
            );
          })}
        </div>

        {/* === DESKTOP VIEW: Table comparison === */}
        <div className="hidden md:block">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                {/* Header row with quote cards */}
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 text-sm font-semibold text-gray-600 w-48 min-w-[180px]">
                      Service / Feature
                    </th>
                    {sortedQuotes.map((q) => {
                      const isPaid = ['paid', 'approved', 'completed'].includes(q.status);
                      const isLowest = q.total_price === lowestPrice && sortedQuotes.length > 1;
                      const isRecommended = q.id === recommendedId;
                      const isSelected = selected === q.id;

                      return (
                        <th
                          key={q.id}
                          onClick={() => !isPaid && setSelected(q.id)}
                          className={`text-center p-4 min-w-[200px] cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-50' : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            {isRecommended && !isPaid && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">BEST VALUE</span>
                            )}
                            {isLowest && !isPaid && !isRecommended && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">LOWEST</span>
                            )}
                            <span className="font-bold text-[#1e3a5f]">{q.aircraft_model || q.aircraft_type || 'Option'}</span>
                            {q.tail_number && <span className="text-[10px] text-gray-400">{q.tail_number}</span>}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-700'}`}>
                              {STATUS_LABELS[q.status] || q.status}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Services comparison rows */}
                  {allServices.map((svc, idx) => (
                    <tr key={svc} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="p-3 text-sm text-gray-700 font-medium border-r">{svc}</td>
                      {sortedQuotes.map((q) => {
                        const has = quoteHasService(q, svc);
                        const price = getLineItemPrice(q, svc);
                        const isSelected = selected === q.id;
                        return (
                          <td
                            key={q.id}
                            className={`p-3 text-center text-sm ${isSelected ? 'bg-amber-50/50' : ''}`}
                          >
                            {has ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-green-500 font-bold">&#10003;</span>
                                {price != null && <span className="text-gray-500">{sym}{formatPrice(price)}</span>}
                              </div>
                            ) : (
                              <span className="text-gray-300">&mdash;</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Notes row */}
                  <tr className="border-t">
                    <td className="p-3 text-sm text-gray-700 font-medium border-r">Notes</td>
                    {sortedQuotes.map((q) => (
                      <td key={q.id} className={`p-3 text-center text-xs text-gray-500 ${selected === q.id ? 'bg-amber-50/50' : ''}`}>
                        {q.notes || <span className="text-gray-300">&mdash;</span>}
                      </td>
                    ))}
                  </tr>

                  {/* Valid until row */}
                  <tr>
                    <td className="p-3 text-sm text-gray-700 font-medium border-r">Valid Until</td>
                    {sortedQuotes.map((q) => {
                      const isPaid = ['paid', 'approved', 'completed'].includes(q.status);
                      const isExpired = !isPaid && q.valid_until && new Date() > new Date(q.valid_until);
                      return (
                        <td key={q.id} className={`p-3 text-center text-xs ${selected === q.id ? 'bg-amber-50/50' : ''}`}>
                          {isPaid ? (
                            <span className="text-green-600 font-medium">Paid</span>
                          ) : isExpired ? (
                            <span className="text-red-500 font-medium">Expired</span>
                          ) : q.valid_until ? (
                            <span className="text-gray-500">
                              {new Date(q.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          ) : (
                            <span className="text-gray-300">&mdash;</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Total price row */}
                  <tr className="border-t-2 border-[#1e3a5f]/20 bg-[#1e3a5f]/5">
                    <td className="p-4 text-sm font-bold text-[#1e3a5f] border-r">Total Price</td>
                    {sortedQuotes.map((q) => {
                      const isLowest = q.total_price === lowestPrice && sortedQuotes.length > 1;
                      const isHighest = q.total_price === highestPrice && sortedQuotes.length > 1;
                      const isSelected = selected === q.id;
                      return (
                        <td key={q.id} className={`p-4 text-center ${isSelected ? 'bg-amber-50' : ''}`}>
                          <span className={`text-xl font-bold ${
                            isLowest ? 'text-green-600' : isHighest ? 'text-red-500' : 'text-[#1e3a5f]'
                          }`}>
                            {sym}{formatPrice(q.total_price)}
                          </span>
                          {isLowest && <p className="text-[10px] text-green-600 font-medium mt-0.5">Savings: {sym}{formatPrice(highestPrice - lowestPrice)}</p>}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Action row */}
                  <tr className="border-t">
                    <td className="p-4 border-r"></td>
                    {sortedQuotes.map((q) => {
                      const isPaid = ['paid', 'approved', 'completed'].includes(q.status);
                      const isExpired = !isPaid && q.valid_until && new Date() > new Date(q.valid_until);
                      const canPay = !isPaid && !isExpired && stripeConnected && ['sent', 'viewed'].includes(q.status);
                      return (
                        <td key={q.id} className={`p-4 text-center ${selected === q.id ? 'bg-amber-50/30' : ''}`}>
                          {isPaid ? (
                            <span className="inline-block px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
                              &#10003; Paid
                            </span>
                          ) : canPay ? (
                            <button
                              onClick={() => handlePayment(q.id)}
                              disabled={paymentLoading}
                              className="px-6 py-2.5 rounded-lg text-white font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 disabled:opacity-50 text-sm"
                            >
                              {paymentLoading ? '...' : 'Select & Pay'}
                            </button>
                          ) : isExpired ? (
                            <span className="text-sm text-red-500 font-medium">Expired</span>
                          ) : (
                            <span className="text-sm text-gray-400">Unavailable</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailer Contact */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-[#1e3a5f] mb-3">Questions? Contact {companyName}</h3>
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

        {/* Footer */}
        <div className="text-center mt-8 pb-8">
          <p className="text-xs text-gray-400">Powered by <a href="https://vectorav.ai" className="underline">Vector</a></p>
        </div>
      </div>
    </div>
  );
}
