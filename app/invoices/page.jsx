"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

const statusColors = {
  draft: 'bg-white/10 text-white/60',
  sent: 'bg-blue-900/30 text-blue-400',
  viewed: 'bg-purple-900/30 text-purple-400',
  paid: 'bg-green-900/30 text-green-400',
  overdue: 'bg-red-900/30 text-red-400',
};

const statusLabels = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  paid: 'Paid',
  overdue: 'Overdue',
};

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [viewInvoice, setViewInvoice] = useState(null);
  const [markPaidModal, setMarkPaidModal] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [actionLoading, setActionLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [paidQuotes, setPaidQuotes] = useState([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [error, setError] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const sym = currencySymbol();

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    try {
      const stored = localStorage.getItem('vector_user');
      const u = stored ? JSON.parse(stored) : {};
      const plan = u.plan || 'free';
      if (plan === 'free' && !u.is_admin) {
        alert('Invoicing is available on Pro and above. Upgrade in Settings.');
        router.push('/quotes');
        return;
      }
    } catch {}
    fetchInvoices(token);
  }, [router]);

  const getToken = () => localStorage.getItem('vector_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

  const fetchInvoices = async (token) => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices', {
        headers: { Authorization: `Bearer ${token || getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPaidQuotes = async () => {
    try {
      const res = await fetch('/api/quotes?status=paid&limit=100', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        const res2 = await fetch('/api/quotes?status=completed&limit=100', { headers: headers() });
        const data2 = res2.ok ? await res2.json() : { quotes: [] };
        const all = [...(data.quotes || []), ...(data2.quotes || [])];
        const invoicedQuoteIds = new Set(invoices.map(inv => inv.quote_id));
        setPaidQuotes(all.filter(q => !invoicedQuoteIds.has(q.id)));
      }
    } catch (err) {
      console.error('Failed to fetch quotes:', err);
    }
  };

  const createInvoice = async () => {
    if (!selectedQuoteId) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ quote_id: selectedQuoteId }),
      });
      const data = await res.json();
      if (res.ok) {
        setInvoices([data.invoice, ...invoices]);
        setCreateModal(false);
        setSelectedQuoteId('');
      } else {
        setError(data.error || 'Failed to create');
      }
    } catch (err) {
      setError('Failed to create');
    } finally {
      setActionLoading(false);
    }
  };

  const getDisplayStatus = (inv) => {
    if (inv.status === 'paid') return 'paid';
    if (inv.status === 'draft') return 'draft';
    if ((inv.status === 'sent' || inv.status === 'viewed' || inv.status === 'unpaid') && inv.due_date && new Date(inv.due_date) < new Date()) return 'overdue';
    if (inv.status === 'viewed') return 'viewed';
    if (inv.status === 'sent') return 'sent';
    // Legacy: unpaid maps to sent
    if (inv.status === 'unpaid') return 'sent';
    return inv.status || 'draft';
  };

  const sendInvoice = async (invoice) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        setInvoices(invoices.map(inv => inv.id === invoice.id ? { ...inv, status: 'sent', emailed_at: new Date().toISOString() } : inv));
      } else {
        // Fallback to the old email endpoint
        const res2 = await fetch(`/api/invoices/${invoice.id}`, {
          method: 'POST',
          headers: headers(),
        });
        if (res2.ok) {
          setInvoices(invoices.map(inv => inv.id === invoice.id ? { ...inv, status: 'sent', emailed_at: new Date().toISOString() } : inv));
        } else {
          const data = await res2.json();
          alert(data.error || 'Failed to send');
        }
      }
    } catch (err) {
      alert('Failed to send invoice');
    } finally {
      setActionLoading(false);
    }
  };

  const sendReminder = async (invoice) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/remind`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        alert('Reminder sent to ' + invoice.customer_email);
        setInvoices(invoices.map(inv => inv.id === invoice.id ? { ...inv, last_reminder_at: new Date().toISOString() } : inv));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send reminder');
      }
    } catch (err) {
      alert('Failed to send reminder');
    } finally {
      setActionLoading(false);
    }
  };

  const markAsPaid = async () => {
    if (!markPaidModal) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${markPaidModal.id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ status: 'paid', payment_method: paymentMethod, manual_payment_note: paymentNote || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setInvoices(invoices.map(inv => inv.id === markPaidModal.id ? data.invoice : inv));
        if (viewInvoice?.id === markPaidModal.id) setViewInvoice(data.invoice);
        setMarkPaidModal(null);
      }
    } catch (err) {
      console.error('Failed to mark as paid:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const downloadPDF = (invoice) => {
    const items = invoice.line_items || [];
    const addons = invoice.addon_fees || [];
    const lineRows = items.map(item =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee">${item.description || item.service || 'Service'}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${sym}${formatPrice(item.amount || item.price || 0)}</td></tr>`
    ).join('');
    const addonRows = addons.map(a =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">${a.name || 'Add-on'}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#666">${sym}${formatPrice(a.calculated || a.amount || 0)}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><title>Invoice ${invoice.invoice_number}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#333}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px}
.inv-num{font-size:28px;font-weight:700;color:#1e3a5f}
.status{display:inline-block;padding:4px 14px;border-radius:9999px;font-size:12px;font-weight:600;color:#fff}
.paid{background:#059669}.unpaid{background:#d97706}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;padding:16px;background:#f9fafb;border-radius:8px}
.label{font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:2px}
.name{font-weight:600;color:#1f2937}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:12px;text-transform:uppercase}
th:last-child{text-align:right}
.total-row{border-top:2px solid #1e3a5f;padding-top:12px;margin-top:12px;display:flex;justify-content:space-between;align-items:center}
.total-label{font-size:18px;font-weight:700}.total-amount{font-size:24px;font-weight:700;color:#1e3a5f}
@media print{body{margin:0;padding:20px}}</style></head>
<body>
<div class="header">
  <div><div class="inv-num">Invoice ${invoice.invoice_number}</div>
  <div style="color:#6b7280">${new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
  <span class="status ${invoice.status === 'paid' ? 'paid' : 'unpaid'}">${(invoice.status || 'unpaid').toUpperCase()}</span>
</div>
<div class="info-grid">
  <div><div class="label">From</div><div class="name">${invoice.detailer_company || invoice.detailer_name || ''}</div>
  ${invoice.detailer_email ? `<div style="color:#6b7280;font-size:14px">${invoice.detailer_email}</div>` : ''}
  ${invoice.detailer_phone ? `<div style="color:#6b7280;font-size:14px">${invoice.detailer_phone}</div>` : ''}</div>
  <div><div class="label">Bill To</div><div class="name">${invoice.customer_name || 'Customer'}</div>
  ${invoice.customer_company ? `<div style="color:#6b7280;font-size:14px">${invoice.customer_company}</div>` : ''}
  ${invoice.customer_email ? `<div style="color:#6b7280;font-size:14px">${invoice.customer_email}</div>` : ''}</div>
</div>
${invoice.aircraft ? `<p style="color:#6b7280;margin:0 0 4px">Aircraft: <strong style="color:#1f2937">${invoice.aircraft}</strong></p>` : ''}
<table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>${lineRows}${addonRows}</tbody></table>
<div class="total-row"><span class="total-label">Total</span><span class="total-amount">${sym}${formatPrice(invoice.total)}</span></div>
${invoice.status !== 'paid' && invoice.due_date ? `<p style="color:#d97706;margin-top:16px">Due by ${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
${invoice.notes ? `<div style="margin-top:16px;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
</body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  // Compute stats
  const enriched = invoices.map(inv => ({ ...inv, displayStatus: getDisplayStatus(inv) }));
  const filtered = filter === 'all' ? enriched
    : filter === 'overdue' ? enriched.filter(inv => inv.displayStatus === 'overdue')
    : enriched.filter(inv => inv.displayStatus === filter);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalOutstanding = invoices
    .filter(i => i.status !== 'paid' && i.status !== 'draft')
    .reduce((sum, i) => sum + (parseFloat(i.balance_due) || parseFloat(i.total) || 0), 0);

  const totalPaidThisMonth = invoices
    .filter(i => i.status === 'paid' && i.paid_at && new Date(i.paid_at) >= thisMonthStart)
    .reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

  const overdueCount = enriched.filter(inv => inv.displayStatus === 'overdue').length;

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'sent', label: 'Sent' },
    { key: 'viewed', label: 'Viewed' },
    { key: 'paid', label: 'Paid' },
    { key: 'overdue', label: 'Overdue' },
  ];

  return (
    <AppShell title="Invoices">
    <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
        <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>INVOICES</h1>
        <button
          onClick={() => { setCreateModal(true); fetchPaidQuotes(); }}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-v-gold text-white shadow hover:brightness-110 transition-colors"
        >
          + Create Invoice
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle">
          <p className="text-v-text-secondary text-[10px] tracking-[0.15em] uppercase mb-1">Total Outstanding</p>
          <p className="text-2xl font-bold text-v-gold">{sym}{formatPrice(totalOutstanding)}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle">
          <p className="text-v-text-secondary text-[10px] tracking-[0.15em] uppercase mb-1">Paid This Month</p>
          <p className="text-2xl font-bold text-green-400">{sym}{formatPrice(totalPaidThisMonth)}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle">
          <p className="text-v-text-secondary text-[10px] tracking-[0.15em] uppercase mb-1">Overdue</p>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-400' : 'text-v-text-primary'}`}>{overdueCount}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${
              filter === tab.key
                ? 'bg-v-gold text-white'
                : 'bg-v-surface text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light/30'
            }`}
          >
            {tab.label}
            {tab.key === 'overdue' && overdueCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full px-1">{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-white text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-v-text-secondary text-sm">Loading invoices...</p>
        </div>
      )}

      {/* Invoice Table */}
      {!loading && (
        <>
          {filtered.length === 0 ? (
            <div className="bg-v-surface rounded-lg p-8 text-center shadow border border-v-border-subtle">
              <p className="text-v-text-secondary">
                {filter === 'all' ? 'No invoices yet. Create one from a completed job.' : `No ${filter} invoices.`}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-v-surface rounded-lg shadow border border-v-border-subtle overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-v-border-subtle">
                      <th className="text-left px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Customer</th>
                      <th className="text-left px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Aircraft</th>
                      <th className="text-right px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Amount</th>
                      <th className="text-center px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Due Date</th>
                      <th className="text-right px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(inv => {
                      const ds = inv.displayStatus;
                      return (
                        <tr
                          key={inv.id}
                          className="border-b border-v-border-subtle/50 hover:bg-v-surface-light/20 transition-colors cursor-pointer"
                          onClick={() => inv.job_id ? router.push(`/jobs/${inv.job_id}`) : setViewInvoice(inv)}
                        >
                          <td className="px-4 py-3">
                            <p className="text-v-text-primary text-sm font-medium">{inv.customer_name || 'Customer'}</p>
                            <p className="text-v-text-secondary text-xs">{inv.invoice_number}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-v-text-primary text-sm">{inv.aircraft || inv.aircraft_model || '-'}</p>
                            {inv.tail_number && <p className="text-v-text-secondary text-xs font-mono">{inv.tail_number}</p>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-v-text-primary text-sm font-semibold">{sym}{formatPrice(inv.total)}</p>
                            {parseFloat(inv.balance_due) > 0 && inv.status !== 'paid' && parseFloat(inv.balance_due) !== parseFloat(inv.total) && (
                              <p className="text-red-400 text-xs">Due: {sym}{formatPrice(inv.balance_due)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[ds] || statusColors.sent}`}>
                              {statusLabels[ds] || ds}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {inv.due_date ? (
                              <p className={`text-sm ${ds === 'overdue' ? 'text-red-400 font-medium' : 'text-v-text-secondary'}`}>
                                {new Date(inv.due_date).toLocaleDateString()}
                              </p>
                            ) : (
                              <p className="text-v-text-secondary text-sm">-</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                              {ds === 'draft' && (
                                <button
                                  onClick={() => sendInvoice(inv)}
                                  disabled={!inv.customer_email || actionLoading}
                                  className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
                                >
                                  Send
                                </button>
                              )}
                              {ds === 'overdue' && (
                                <button
                                  onClick={() => sendReminder(inv)}
                                  disabled={!inv.customer_email || actionLoading}
                                  className="text-xs px-2.5 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-40 transition-colors"
                                >
                                  Remind
                                </button>
                              )}
                              {ds !== 'paid' && ds !== 'draft' && (
                                <button
                                  onClick={() => { setMarkPaidModal(inv); setPaymentMethod('cash'); setPaymentNote(''); }}
                                  className="text-xs px-2.5 py-1.5 bg-green-600/80 text-white rounded-md hover:bg-green-600 transition-colors"
                                >
                                  Mark Paid
                                </button>
                              )}
                              <button
                                onClick={() => downloadPDF(inv)}
                                className="text-xs px-2.5 py-1.5 bg-v-charcoal text-v-text-secondary rounded-md hover:text-v-text-primary transition-colors"
                              >
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map(inv => {
                  const ds = inv.displayStatus;
                  return (
                    <div
                      key={inv.id}
                      className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle"
                      onClick={() => inv.job_id ? router.push(`/jobs/${inv.job_id}`) : setViewInvoice(inv)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-v-text-primary text-sm font-medium">{inv.customer_name || 'Customer'}</p>
                          <p className="text-v-text-secondary text-xs">{inv.invoice_number}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[ds] || statusColors.sent}`}>
                          {statusLabels[ds] || ds}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-v-text-secondary text-xs">
                          {inv.aircraft || '-'}
                          {inv.due_date ? ` \u00B7 Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}
                        </div>
                        <p className="text-v-text-primary text-base font-semibold">{sym}{formatPrice(inv.total)}</p>
                      </div>
                      <div className="flex gap-1 mt-2" onClick={e => e.stopPropagation()}>
                        {ds === 'draft' && (
                          <button onClick={() => sendInvoice(inv)} disabled={!inv.customer_email || actionLoading} className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-40">Send</button>
                        )}
                        {ds === 'overdue' && (
                          <button onClick={() => sendReminder(inv)} disabled={!inv.customer_email || actionLoading} className="text-xs px-2 py-1 bg-red-600 text-white rounded disabled:opacity-40">Remind</button>
                        )}
                        {ds !== 'paid' && ds !== 'draft' && (
                          <button onClick={() => { setMarkPaidModal(inv); setPaymentMethod('cash'); setPaymentNote(''); }} className="text-xs px-2 py-1 bg-green-600/80 text-white rounded">Mark Paid</button>
                        )}
                        <button onClick={() => downloadPDF(inv)} className="text-xs px-2 py-1 bg-v-charcoal text-v-text-secondary rounded">PDF</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setViewInvoice(null)}>
          <div className="bg-v-surface rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-v-text-primary">{viewInvoice.invoice_number}</h2>
                <p className="text-sm text-v-text-secondary">{new Date(viewInvoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColors[getDisplayStatus(viewInvoice)] || statusColors.sent}`}>
                  {(statusLabels[getDisplayStatus(viewInvoice)] || viewInvoice.status || 'Sent').toUpperCase()}
                </span>
                <button onClick={() => setViewInvoice(null)} className="text-v-text-secondary hover:text-v-text-primary text-xl">&times;</button>
              </div>
            </div>

            {/* From / To */}
            <div className="grid grid-cols-2 gap-4 bg-v-charcoal rounded-lg p-3 mb-4 text-sm">
              <div>
                <p className="text-xs text-v-text-secondary uppercase">From</p>
                <p className="font-semibold text-v-text-primary">{viewInvoice.detailer_company || viewInvoice.detailer_name}</p>
                {viewInvoice.detailer_email && <p className="text-v-text-secondary">{viewInvoice.detailer_email}</p>}
              </div>
              <div>
                <p className="text-xs text-v-text-secondary uppercase">Bill To</p>
                <p className="font-semibold text-v-text-primary">{viewInvoice.customer_name || 'Customer'}</p>
                {viewInvoice.customer_email && <p className="text-v-text-secondary">{viewInvoice.customer_email}</p>}
              </div>
            </div>

            {viewInvoice.aircraft && <p className="text-sm text-v-text-secondary mb-1">Aircraft: <strong className="text-v-text-primary">{viewInvoice.aircraft}</strong>{viewInvoice.tail_number ? ` (${viewInvoice.tail_number})` : ''}</p>}

            {/* Line items */}
            {(viewInvoice.line_items || []).length > 0 && (
              <div className="border border-v-border-subtle rounded-lg overflow-hidden mb-3 mt-3">
                <table className="w-full text-sm">
                  <thead className="bg-v-charcoal">
                    <tr>
                      <th className="text-left px-3 py-2 text-v-text-secondary text-xs uppercase">Services</th>
                      <th className="text-right px-3 py-2 text-v-text-secondary text-xs uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.line_items.map((item, i) => (
                      <tr key={i} className="border-t border-v-border-subtle/50">
                        <td className="px-3 py-2 text-v-text-primary">{item.description || item.service || 'Service'}</td>
                        <td className="px-3 py-2 text-right text-v-text-primary">{sym}{formatPrice(item.amount || item.price || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Addons */}
            {(viewInvoice.addon_fees || []).length > 0 && (
              <div className="space-y-1 mb-3">
                {viewInvoice.addon_fees.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm text-v-text-secondary">
                    <span>{a.name}</span>
                    <span>{sym}{formatPrice(a.calculated || a.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Total */}
            <div className="border-t-2 border-v-border pt-3">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-v-text-primary">Total</span>
                <span className="text-2xl font-bold text-v-gold">{sym}{formatPrice(viewInvoice.total)}</span>
              </div>
              {(parseFloat(viewInvoice.amount_paid) > 0 || parseFloat(viewInvoice.deposit_amount) > 0) && viewInvoice.status !== 'paid' && (
                <div className="mt-2 pt-2 border-t border-v-border space-y-1">
                  {parseFloat(viewInvoice.amount_paid) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400">Amount Paid</span>
                      <span className="text-green-400 font-semibold">{sym}{formatPrice(viewInvoice.amount_paid)}</span>
                    </div>
                  )}
                  {parseFloat(viewInvoice.balance_due) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-400 font-semibold">Balance Due</span>
                      <span className="text-red-400 font-bold text-base">{sym}{formatPrice(viewInvoice.balance_due)}</span>
                    </div>
                  )}
                </div>
              )}
              {viewInvoice.due_date && viewInvoice.status !== 'paid' && (
                <p className={`text-sm mt-2 ${getDisplayStatus(viewInvoice) === 'overdue' ? 'text-red-400 font-semibold' : 'text-v-gold'}`}>
                  {getDisplayStatus(viewInvoice) === 'overdue' ? 'Overdue \u2014 was due' : 'Due by'} {new Date(viewInvoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>

            {viewInvoice.notes && (
              <div className="mt-3 p-3 bg-v-gold/10 rounded-lg border border-v-gold/30 text-sm text-v-gold">
                <strong>Notes:</strong> {viewInvoice.notes}
              </div>
            )}

            {viewInvoice.payment_method && (
              <p className="text-sm text-v-text-secondary mt-2">Payment method: {viewInvoice.payment_method}</p>
            )}
            {viewInvoice.manual_payment_note && (
              <p className="text-sm text-v-text-secondary mt-1">Note: {viewInvoice.manual_payment_note}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={() => downloadPDF(viewInvoice)} className="px-4 py-2 bg-v-charcoal rounded-lg text-sm font-medium text-v-text-secondary hover:text-v-text-primary transition-colors">
                Download PDF
              </button>
              {getDisplayStatus(viewInvoice) === 'draft' && (
                <button
                  onClick={() => { sendInvoice(viewInvoice); setViewInvoice(null); }}
                  disabled={!viewInvoice.customer_email || actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Send Invoice
                </button>
              )}
              {getDisplayStatus(viewInvoice) === 'overdue' && (
                <button
                  onClick={() => sendReminder(viewInvoice)}
                  disabled={!viewInvoice.customer_email || actionLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  Send Reminder
                </button>
              )}
              {viewInvoice.status !== 'paid' && getDisplayStatus(viewInvoice) !== 'draft' && (
                <button
                  onClick={() => { setMarkPaidModal(viewInvoice); setPaymentMethod('cash'); setPaymentNote(''); }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Mark as Paid
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {markPaidModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setMarkPaidModal(null)}>
          <div className="bg-v-surface rounded-xl max-w-sm w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-v-text-primary mb-3">Mark as Paid</h3>
            <p className="text-sm text-v-text-secondary mb-3">{markPaidModal.invoice_number} &mdash; {sym}{formatPrice(markPaidModal.total)}</p>
            <label className="block text-sm font-medium text-v-text-primary mb-1">Payment method</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {['cash', 'check', 'bank_transfer', 'other'].map(m => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    paymentMethod === m ? 'bg-v-gold text-white border-v-gold' : 'bg-v-surface text-v-text-secondary border-v-border hover:bg-white/5'
                  }`}
                >
                  {m === 'cash' ? 'Cash' : m === 'check' ? 'Check' : m === 'bank_transfer' ? 'Bank Transfer' : 'Other'}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium mb-1 text-v-text-secondary">Note (optional)</label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="e.g. Check #1234, Venmo confirmation..."
              className="w-full px-3 py-2 rounded-lg bg-v-charcoal border border-v-border text-v-text-primary text-sm mb-4 placeholder:text-v-text-secondary/50"
            />
            <div className="flex gap-2">
              <button onClick={() => setMarkPaidModal(null)} className="flex-1 px-4 py-2 border border-v-border rounded-lg text-v-text-secondary hover:bg-white/5 transition-colors">Cancel</button>
              <button
                onClick={markAsPaid}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Saving...' : 'Confirm Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCreateModal(false)}>
          <div className="bg-v-surface rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-v-text-primary mb-3">Create Invoice from Job</h3>
            <p className="text-sm text-v-text-secondary mb-3">Select a paid or completed job to generate an invoice.</p>
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            {paidQuotes.length === 0 ? (
              <p className="text-v-text-secondary text-center py-6">No paid jobs without invoices found.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                {paidQuotes.map(q => (
                  <label
                    key={q.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedQuoteId === q.id ? 'border-v-gold bg-v-gold-muted/20' : 'border-v-border hover:border-v-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="quote"
                        value={q.id}
                        checked={selectedQuoteId === q.id}
                        onChange={() => setSelectedQuoteId(q.id)}
                        className="accent-v-gold"
                      />
                      <div>
                        <p className="text-sm font-medium text-v-text-primary">{q.client_name || q.customer_name || 'Customer'}</p>
                        <p className="text-xs text-v-text-secondary">{q.aircraft_model || q.aircraft_type || 'Aircraft'} &middot; {new Date(q.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className="font-bold text-v-text-primary">{sym}{formatPrice(q.total_price)}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setCreateModal(false)} className="flex-1 px-4 py-2 border border-v-border rounded-lg text-v-text-secondary hover:bg-white/5 transition-colors">Cancel</button>
              <button
                onClick={createInvoice}
                disabled={!selectedQuoteId || actionLoading}
                className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Creating...' : '+ Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}
