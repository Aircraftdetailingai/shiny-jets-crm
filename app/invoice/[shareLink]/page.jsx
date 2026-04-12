"use client";
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

export default function InvoiceViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [invoice, setInvoice] = useState(null);
  const [detailer, setDetailer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setPaymentSuccess(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const res = await fetch(`/api/invoices/view/${params.shareLink}`);
        if (!res.ok) throw new Error('Invoice not found');
        const data = await res.json();
        setInvoice(data.invoice);
        setDetailer(data.detailer);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (params.shareLink) fetchInvoice();
  }, [params.shareLink]);

  // Inject detailer theme
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

  const sym = currencySymbol();

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const isOverdue = invoice && invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.status !== 'paid';
  const isPaid = invoice && invoice.status === 'paid';

  const getStatusLabel = () => {
    if (isPaid) return 'Paid';
    if (isOverdue) return 'Overdue';
    if (invoice?.status === 'viewed') return 'Viewed';
    if (invoice?.status === 'sent') return 'Sent';
    return invoice?.status || 'Sent';
  };

  const getStatusColor = () => {
    if (isPaid) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (isOverdue) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (invoice?.status === 'viewed') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  };

  const handlePayInvoice = async () => {
    setPaymentLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_link: params.shareLink }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Payment failed');
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError('Payment could not be processed. Please try again.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const getLineItems = () => {
    const items = invoice?.line_items;
    if (Array.isArray(items) && items.length > 0) return items;
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
  if (error && !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4">
        <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] p-10 text-center">
          <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-8" />
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs tracking-[0.2em] uppercase mb-3">Error</p>
          <h1 className="font-heading text-2xl font-light text-[var(--brand-text,#F5F5F5)] mb-3" style={brandFontHeading ? { fontFamily: brandFontHeading } : undefined}>Invoice Not Found</h1>
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">This invoice link may be invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const lineItems = getLineItems();
  const invoiceNumber = invoice.invoice_number || `INV-${String(invoice.id).slice(-6).toUpperCase()}`;

  // Calculate subtotal from line items
  const subtotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || parseFloat(item.price) || 0), 0);
  const total = parseFloat(invoice.total) || subtotal;

  // Net terms
  const getNetTerms = () => {
    if (invoice.net_terms) return `Net ${invoice.net_terms}`;
    if (invoice.due_date && invoice.created_at) {
      const days = Math.round((new Date(invoice.due_date) - new Date(invoice.created_at)) / (1000 * 60 * 60 * 24));
      if (days > 0) return `Net ${days}`;
    }
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--brand-bg,#0A0E17)] p-4" style={brandFontBody ? { fontFamily: brandFontBody } : undefined}>
      {/* Payment success banner */}
      {paymentSuccess && (
        <div className="w-full max-w-[640px] mb-4 border border-green-500/30 bg-green-500/10 p-4 text-center rounded-[4px]">
          <p className="text-green-400 text-sm tracking-[0.15em] uppercase font-medium">Payment Successful</p>
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm mt-1">Thank you for your payment. A receipt has been sent to your email.</p>
        </div>
      )}

      <div className="bg-[var(--brand-surface,#111827)] w-full max-w-[640px] rounded-[4px] px-8 py-10 sm:px-10">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Invoice</p>
          <div className="w-12 h-[1px] bg-[var(--brand-primary,#007CB1)] mx-auto mb-4" />
          <div className="flex items-center justify-center gap-3">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-xs font-mono">{invoiceNumber}</p>
            <span className={`text-[10px] tracking-[0.15em] uppercase px-3 py-1 border rounded-full font-medium ${getStatusColor()}`}>
              {getStatusLabel()}
            </span>
          </div>
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

        {/* Invoice details: dates & terms */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <div>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Issued</p>
            <p className="text-[var(--brand-text,#F5F5F5)] text-sm">{formatDate(invoice.created_at)}</p>
          </div>
          {invoice.due_date && (
            <div>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Due Date</p>
              <p className={`text-sm ${isOverdue ? 'text-red-400 font-medium' : 'text-[var(--brand-text,#F5F5F5)]'}`}>{formatDate(invoice.due_date)}</p>
            </div>
          )}
          {getNetTerms() && (
            <div>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Terms</p>
              <p className="text-[var(--brand-text,#F5F5F5)] text-sm">{getNetTerms()}</p>
            </div>
          )}
        </div>

        {/* Customer info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 pb-8 border-b border-[var(--brand-border,#1A2236)]">
          <div>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Bill To</p>
            <p className="text-[var(--brand-text,#F5F5F5)] text-sm font-medium">{invoice.customer_name || 'Customer'}</p>
            {invoice.customer_company && <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs">{invoice.customer_company}</p>}
            {invoice.customer_email && <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs">{invoice.customer_email}</p>}
          </div>
          {(invoice.aircraft || invoice.aircraft_model || invoice.tail_number) && (
            <div>
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-1">Aircraft</p>
              <p className="text-[var(--brand-text,#F5F5F5)] text-sm">{invoice.aircraft_model || invoice.aircraft || ''}</p>
              {invoice.tail_number && <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs font-mono">{invoice.tail_number}</p>}
            </div>
          )}
        </div>

        {/* Overdue warning */}
        {isOverdue && !isPaid && (
          <div className="border border-red-500/30 bg-red-500/5 p-4 mb-6 text-center">
            <p className="text-red-400 text-sm font-medium tracking-[0.1em] uppercase">Payment Overdue</p>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-1">
              This invoice was due on {formatDate(invoice.due_date)}. Please submit payment as soon as possible.
            </p>
          </div>
        )}

        {/* Line items — respects detailer's quote_display_mode */}
        {(() => {
          const displayMode = detailer?.quote_display_mode || 'itemized';
          const packageName = detailer?.quote_package_name || 'Aircraft Detail Package';
          const showBreakdown = detailer?.quote_show_breakdown;
          const total = parseFloat(invoice.total) || 0;

          if (displayMode === 'package' && lineItems.length > 0) {
            return (
              <div className="mb-8">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Services</p>
                <div className="flex items-center justify-between py-4 border-b border-[var(--brand-border,#1A2236)]">
                  <span className="text-[var(--brand-text,#F5F5F5)] text-base font-medium">{packageName}</span>
                  <span className="text-[var(--brand-text,#F5F5F5)] text-base font-semibold">{sym}{formatPrice(total)}</span>
                </div>
                {showBreakdown && (
                  <details className="mt-2">
                    <summary className="text-[var(--brand-primary,#007CB1)] text-xs cursor-pointer hover:underline py-1">View service breakdown</summary>
                    <div className="mt-2 divide-y divide-[var(--brand-border,#1A2236)]">
                      {lineItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-2 text-sm text-[var(--brand-text-secondary,#8A9BB0)]">
                          <span>{item.description || item.name || 'Service'}{item.hours ? ` — ${parseFloat(item.hours).toFixed(1)}h` : ''}</span>
                          <span>{sym}{formatPrice(item.amount || item.price || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          }

          if (displayMode === 'hours_only' && lineItems.length > 0) {
            return (
              <div className="mb-8">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Services</p>
                <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                  {lineItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-3">
                      <span className="text-[var(--brand-text,#F5F5F5)] text-sm">{item.description || item.name || 'Service'}</span>
                      <span className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm">
                        {item.hours ? `${parseFloat(item.hours).toFixed(1)}h estimated` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // Default: itemized
          if (lineItems.length > 0) {
            return (
              <div className="mb-8">
                <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Services</p>
                <div className="divide-y divide-[var(--brand-border,#1A2236)]">
                  <div className="flex items-center py-2 text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.2em] uppercase">
                    <span className="flex-1">Description</span>
                    {lineItems.some(item => item.hours) && <span className="w-16 text-right">Hours</span>}
                    {lineItems.some(item => item.rate) && <span className="w-20 text-right">Rate</span>}
                    <span className="w-24 text-right">Amount</span>
                  </div>
                  {lineItems.map((item, i) => (
                    <div key={i} className="flex items-center py-3">
                      <span className="flex-1 text-[var(--brand-text,#F5F5F5)] text-sm">{item.description || item.service || item.name || 'Service'}</span>
                      {lineItems.some(li => li.hours) && (
                        <span className="w-16 text-right text-[var(--brand-text-secondary,#8A9BB0)] text-sm">
                          {item.hours ? `${parseFloat(item.hours).toFixed(1)}` : ''}
                        </span>
                      )}
                      {lineItems.some(li => li.rate) && (
                        <span className="w-20 text-right text-[var(--brand-text-secondary,#8A9BB0)] text-sm">
                          {item.rate ? `${sym}${formatPrice(item.rate)}` : ''}
                        </span>
                      )}
                      <span className="w-24 text-right text-[var(--brand-text,#F5F5F5)] text-sm font-medium">
                        {sym}{formatPrice(item.amount || item.price || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Add-on fees */}
        {invoice.addon_fees && invoice.addon_fees.length > 0 && (
          <div className="border-t border-[var(--brand-border,#1A2236)] pt-2 mb-2">
            {invoice.addon_fees.map((fee, i) => (
              <div key={i} className="flex justify-between py-2 text-sm">
                <span className="text-[var(--brand-text-secondary,#8A9BB0)]">{fee.name}{fee.fee_type === 'percent' ? ` (${fee.amount}%)` : ''}</span>
                <span className="text-[var(--brand-text-secondary,#8A9BB0)]">+{sym}{formatPrice(fee.calculated || fee.amount || 0)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Subtotal & Total */}
        <div className="border-t border-[var(--brand-border-strong,#2A3A50)] pt-6 mb-2">
          {lineItems.length > 1 && (
            <div className="flex justify-between py-1 text-sm">
              <span className="text-[var(--brand-text-secondary,#8A9BB0)]">Subtotal</span>
              <span className="text-[var(--brand-text,#F5F5F5)]">{sym}{formatPrice(subtotal)}</span>
            </div>
          )}
          <div className="text-center pt-4">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Total</p>
            <p className="text-[var(--brand-primary,#007CB1)] text-[2.5rem] font-light">{sym}{formatPrice(total)}</p>
          </div>

          {/* Partial payment info */}
          {(parseFloat(invoice.amount_paid) > 0 || parseFloat(invoice.deposit_amount) > 0) && !isPaid && (
            <div className="mt-4 pt-3 border-t border-[var(--brand-border,#1A2236)] space-y-1">
              {parseFloat(invoice.amount_paid) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">Amount Paid</span>
                  <span className="text-green-400 font-medium">{sym}{formatPrice(invoice.amount_paid)}</span>
                </div>
              )}
              {parseFloat(invoice.balance_due) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-400 font-medium">Balance Due</span>
                  <span className="text-red-400 font-semibold">{sym}{formatPrice(invoice.balance_due)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Paid badge */}
        {isPaid && (
          <div className="border border-green-500/30 bg-green-500/10 p-5 my-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-green-400 text-sm tracking-[0.2em] uppercase font-medium">Paid</p>
            </div>
            {invoice.paid_at && (
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-1">
                Payment received on {formatDate(invoice.paid_at)}
              </p>
            )}
            {invoice.payment_method && (
              <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-xs mt-0.5">
                via {invoice.payment_method}
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="border-l-2 border-[var(--brand-primary,#007CB1)]/40 pl-4 my-6">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-2">Notes</p>
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-sm leading-relaxed">{invoice.notes}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border border-red-500/30 bg-red-500/5 p-4 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Pay button (only if unpaid) */}
        {!isPaid && (
          <button
            onClick={handlePayInvoice}
            disabled={paymentLoading}
            className="w-full py-4 bg-[var(--brand-primary,#007CB1)] text-[var(--brand-btn-text,#0A0E17)] text-sm tracking-[0.2em] uppercase font-medium hover:brightness-110 disabled:opacity-50 transition-colors mt-6"
          >
            {paymentLoading ? 'Processing...' : `Pay Invoice \u2014 ${sym}${formatPrice(parseFloat(invoice.balance_due) || total)}`}
          </button>
        )}

        {/* Payment disclaimer */}
        {!isPaid && (
          <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[9px] leading-relaxed mt-4 text-center">
            Payments are processed securely by Stripe. All payment disputes and refund requests
            should be directed to {detailer?.company || 'your service provider'}. Shiny Jets
            is a software platform and is not a party to this transaction.
          </p>
        )}

        {/* Questions / Contact */}
        {detailer && (detailer.phone || detailer.email) && (
          <div className="mt-8 pt-6 border-t border-[var(--brand-border,#1A2236)] text-center">
            <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Questions about this invoice?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-sm">
              {detailer.phone && <a href={`tel:${detailer.phone}`} className="text-[var(--brand-primary,#007CB1)] hover:brightness-110 transition-colors">{detailer.phone}</a>}
              {detailer.email && <a href={`mailto:${detailer.email}`} className="text-[var(--brand-primary,#007CB1)] hover:brightness-110 transition-colors">{detailer.email}</a>}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-[var(--brand-text-secondary,#8A9BB0)]/40 text-[10px] tracking-[0.3em] uppercase mt-8">Powered by Shiny Jets CRM</p>
    </div>
  );
}
