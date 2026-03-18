"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const statusColors = {
  paid: 'bg-green-900/30 text-green-400',
  unpaid: 'bg-v-gold-muted/30 text-v-gold',
  partially_paid: 'bg-blue-900/30 text-blue-400',
  overdue: 'bg-red-900/30 text-red-400',
  void: 'bg-v-charcoal text-v-text-secondary',
};

const statusLabels = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  overdue: 'Overdue',
  void: 'Void',
};

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

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

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
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
        // Also get completed quotes
        const res2 = await fetch('/api/quotes?status=completed&limit=100', { headers: headers() });
        const data2 = res2.ok ? await res2.json() : { quotes: [] };
        const all = [...(data.quotes || []), ...(data2.quotes || [])];
        // Filter out quotes that already have invoices
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
    if (inv.status === 'partially_paid') return 'partially_paid';
    if ((inv.status === 'unpaid' || inv.status === 'partially_paid') && inv.due_date && new Date(inv.due_date) < new Date()) return 'overdue';
    return inv.status || 'unpaid';
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

  const emailInvoice = async (invoice) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        alert('Invoice emailed to' + ' ' + invoice.customer_email);
        setInvoices(invoices.map(inv => inv.id === invoice.id ? { ...inv, emailed_at: new Date().toISOString() } : inv));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send');
      }
    } catch (err) {
      alert('Failed to send');
    } finally {
      setActionLoading(false);
    }
  };

  const downloadPDF = (invoice) => {
    // Generate a printable HTML invoice and trigger print/save as PDF
    const items = invoice.line_items || [];
    const addons = invoice.addon_fees || [];

    const lineRows = items.map(item =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee">${item.description || item.service || 'Service'}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(item.amount || item.price || 0)}</td></tr>`
    ).join('');

    const addonRows = addons.map(a =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">${a.name || 'Add-on'}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#666">${formatCurrency(a.calculated || a.amount || 0)}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><title>${'Invoice'} ${invoice.invoice_number}</title>
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
  <div><div class="inv-num">${'Invoice'} ${invoice.invoice_number}</div>
  <div style="color:#6b7280">${new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
  <span class="status ${invoice.status === 'paid' ? 'paid' : 'unpaid'}">${(invoice.status || 'unpaid').toUpperCase()}</span>
</div>
<div class="info-grid">
  <div><div class="label">${'From'}</div><div class="name">${invoice.detailer_company || invoice.detailer_name || ''}</div>
  ${invoice.detailer_email ? `<div style="color:#6b7280;font-size:14px">${invoice.detailer_email}</div>` : ''}
  ${invoice.detailer_phone ? `<div style="color:#6b7280;font-size:14px">${invoice.detailer_phone}</div>` : ''}</div>
  <div><div class="label">${'Bill To'}</div><div class="name">${invoice.customer_name || 'Customer'}</div>
  ${invoice.customer_company ? `<div style="color:#6b7280;font-size:14px">${invoice.customer_company}</div>` : ''}
  ${invoice.customer_email ? `<div style="color:#6b7280;font-size:14px">${invoice.customer_email}</div>` : ''}</div>
</div>
${invoice.aircraft ? `<p style="color:#6b7280;margin:0 0 4px">${'Aircraft'}: <strong style="color:#1f2937">${invoice.aircraft}</strong></p>` : ''}
${invoice.airport ? `<p style="color:#6b7280;margin:0 0 16px">${'Airport'}: <strong style="color:#1f2937">${invoice.airport}</strong></p>` : ''}
<table><thead><tr><th>${'Description'}</th><th>${'Amount'}</th></tr></thead><tbody>${lineRows}${addonRows}</tbody></table>
${invoice.platform_fee > 0 ? `<div style="color:#9ca3af;font-size:13px;text-align:right">${'Platform fee'} (${(invoice.platform_fee_rate * 100).toFixed(0)}%): ${formatCurrency(invoice.platform_fee)}</div>` : ''}
<div class="total-row"><span class="total-label">${'Total'}</span><span class="total-amount">${formatCurrency(invoice.total)}</span></div>
${invoice.status !== 'paid' && invoice.due_date ? `<p style="color:#d97706;margin-top:16px">${'Due by'} ${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
${invoice.notes ? `<div style="margin-top:16px;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a"><strong>${'Notes'}:</strong> ${invoice.notes}</div>` : ''}
${invoice.payment_method ? `<p style="margin-top:12px;color:#6b7280;font-size:14px">${'Payment method'}: ${invoice.payment_method}</p>` : ''}
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const enriched = invoices.map(inv => ({ ...inv, displayStatus: getDisplayStatus(inv) }));
  const filtered = filter === 'all' ? enriched
    : filter === 'overdue' ? enriched.filter(inv => inv.displayStatus === 'overdue')
    : enriched.filter(inv => inv.status === filter);

  const totalUnpaid = invoices.filter(i => i.status === 'unpaid' || i.status === 'partially_paid').reduce((sum, i) => sum + (parseFloat(i.balance_due) || parseFloat(i.total) || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

  const filterLabels = {
    all: 'All',
    unpaid: 'Unpaid',
    partially_paid: 'Partial',
    paid: 'Paid',
    overdue: 'Overdue',
  };

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-white text-2xl hover:opacity-70">&larr;</a>
          <h1 className="text-2xl font-bold text-white">{'Invoices'}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'unpaid', 'partially_paid', 'paid', 'overdue'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? 'bg-v-gold text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
          <button
            onClick={() => { setCreateModal(true); fetchPaidQuotes(); }}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-v-gold text-white shadow"
          >
            {'+ Create Invoice'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-v-surface rounded-lg p-3 shadow">
          <p className="text-v-text-secondary text-xs">{'Total Invoices'}</p>
          <p className="text-xl font-bold text-v-text-primary">{invoices.length}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-3 shadow">
          <p className="text-v-text-secondary text-xs">{'Outstanding'}</p>
          <p className="text-xl font-bold text-v-gold-dim">{formatCurrency(totalUnpaid)}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-3 shadow">
          <p className="text-v-text-secondary text-xs">{'Collected'}</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-white text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
          <p>{'Loading invoices...'}</p>
        </div>
      )}

      {/* Invoice List */}
      {!loading && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-v-surface rounded-lg p-8 text-center shadow">
              <p className="text-v-text-secondary">{'No invoices yet. Create one from a completed job.'}</p>
            </div>
          ) : (
            filtered.map(inv => {
              const ds = inv.displayStatus || inv.status || 'unpaid';
              return (
              <div
                key={inv.id}
                className="bg-v-surface rounded-lg p-4 shadow hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setViewInvoice(inv)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-v-text-primary">{inv.invoice_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[ds] || statusColors.unpaid}`}>
                        {statusLabels[ds] || ds}
                      </span>
                    </div>
                    <p className="text-sm text-v-text-secondary mt-0.5">
                      {inv.customer_name || 'Customer'}
                      {inv.aircraft ? ` \u00B7 ${inv.aircraft}` : ''}
                    </p>
                    <p className="text-xs text-v-text-secondary">
                      {new Date(inv.created_at).toLocaleDateString()}
                      {inv.due_date ? ` \u00B7 Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}
                      {inv.emailed_at ? ` \u00B7 Emailed` : ''}
                      {inv.payment_method ? ` \u00B7 ${inv.payment_method}` : ''}
                    </p>
                    {(parseFloat(inv.amount_paid) > 0 || parseFloat(inv.balance_due) > 0) && inv.status !== 'paid' && (
                      <p className="text-xs mt-0.5">
                        {parseFloat(inv.amount_paid) > 0 && <span className="text-green-400">Paid {formatCurrency(inv.amount_paid)}</span>}
                        {parseFloat(inv.balance_due) > 0 && <span className="text-red-400 ml-2">Due {formatCurrency(inv.balance_due)}</span>}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-v-text-primary">{formatCurrency(inv.total)}</p>
                    <div className="flex gap-1 mt-1 flex-wrap justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadPDF(inv); }}
                        className="text-xs px-2 py-1 bg-v-charcoal rounded hover:bg-v-charcoal text-v-text-secondary"
                        title="Download PDF"
                      >
                        PDF
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); emailInvoice(inv); }}
                        disabled={!inv.customer_email || actionLoading}
                        className="text-xs px-2 py-1 bg-blue-100 rounded hover:bg-blue-200 text-blue-700 disabled:opacity-40"
                        title="Email Invoice"
                      >
                        Email
                      </button>
                      {ds === 'overdue' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); sendReminder(inv); }}
                          disabled={!inv.customer_email || actionLoading}
                          className="text-xs px-2 py-1 bg-red-100 rounded hover:bg-red-200 text-red-700 disabled:opacity-40"
                          title="Send Payment Reminder"
                        >
                          Remind
                        </button>
                      )}
                      {inv.status !== 'paid' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setMarkPaidModal(inv); setPaymentMethod('cash'); setPaymentNote(''); }}
                          className="text-xs px-2 py-1 bg-green-100 rounded hover:bg-green-200 text-green-700"
                          title="Mark as Paid"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
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
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColors[getDisplayStatus(viewInvoice)] || statusColors.unpaid}`}>
                  {(statusLabels[getDisplayStatus(viewInvoice)] || viewInvoice.status || 'Unpaid').toUpperCase()}
                </span>
                <button onClick={() => setViewInvoice(null)} className="text-v-text-secondary hover:text-v-text-secondary text-xl">&times;</button>
              </div>
            </div>

            {/* From / To */}
            <div className="grid grid-cols-2 gap-4 bg-v-charcoal rounded-lg p-3 mb-4 text-sm">
              <div>
                <p className="text-xs text-v-text-secondary uppercase">{'From'}</p>
                <p className="font-semibold">{viewInvoice.detailer_company || viewInvoice.detailer_name}</p>
                {viewInvoice.detailer_email && <p className="text-v-text-secondary">{viewInvoice.detailer_email}</p>}
                {viewInvoice.detailer_phone && <p className="text-v-text-secondary">{viewInvoice.detailer_phone}</p>}
              </div>
              <div>
                <p className="text-xs text-v-text-secondary uppercase">{'Bill To'}</p>
                <p className="font-semibold">{viewInvoice.customer_name || 'Customer'}</p>
                {viewInvoice.customer_company && <p className="text-v-text-secondary">{viewInvoice.customer_company}</p>}
                {viewInvoice.customer_email && <p className="text-v-text-secondary">{viewInvoice.customer_email}</p>}
              </div>
            </div>

            {viewInvoice.aircraft && <p className="text-sm text-v-text-secondary mb-1">{'Aircraft'}: <strong>{viewInvoice.aircraft}</strong>{viewInvoice.tail_number ? ` (${viewInvoice.tail_number})` : ''}</p>}
            {viewInvoice.airport && <p className="text-sm text-v-text-secondary mb-3">{'Airport'}: <strong>{viewInvoice.airport}</strong></p>}

            {/* Line items */}
            {(viewInvoice.line_items || []).length > 0 && (
              <div className="border rounded-lg overflow-hidden mb-3">
                <table className="w-full text-sm">
                  <thead className="bg-v-charcoal">
                    <tr>
                      <th className="text-left px-3 py-2 text-v-text-secondary text-xs uppercase">{'Services'}</th>
                      <th className="text-right px-3 py-2 text-v-text-secondary text-xs uppercase">{'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.line_items.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{item.description || item.service || 'Service'}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.amount || item.price || 0)}</td>
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
                    <span>{formatCurrency(a.calculated || a.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Fee + Total */}
            <div className="border-t-2 border-v-border pt-3">
              {viewInvoice.platform_fee > 0 && (
                <div className="flex justify-between text-sm text-v-text-secondary mb-1">
                  <span>{'Platform fee'} ({(viewInvoice.platform_fee_rate * 100).toFixed(0)}%)</span>
                  <span>{formatCurrency(viewInvoice.platform_fee)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">Total</span>
                <span className="text-2xl font-bold text-v-gold">{formatCurrency(viewInvoice.total)}</span>
              </div>
              {(parseFloat(viewInvoice.amount_paid) > 0 || parseFloat(viewInvoice.deposit_amount) > 0) && viewInvoice.status !== 'paid' && (
                <div className="mt-2 pt-2 border-t border-v-border space-y-1">
                  {parseFloat(viewInvoice.deposit_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400">Deposit Paid</span>
                      <span className="text-green-400 font-semibold">{formatCurrency(viewInvoice.deposit_amount)}</span>
                    </div>
                  )}
                  {parseFloat(viewInvoice.amount_paid) > 0 && !parseFloat(viewInvoice.deposit_amount) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400">Amount Paid</span>
                      <span className="text-green-400 font-semibold">{formatCurrency(viewInvoice.amount_paid)}</span>
                    </div>
                  )}
                  {parseFloat(viewInvoice.balance_due) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-400 font-semibold">Balance Due</span>
                      <span className="text-red-400 font-bold text-base">{formatCurrency(viewInvoice.balance_due)}</span>
                    </div>
                  )}
                </div>
              )}
              {viewInvoice.due_date && viewInvoice.status !== 'paid' && (
                <p className={`text-sm mt-2 ${getDisplayStatus(viewInvoice) === 'overdue' ? 'text-red-400 font-semibold' : 'text-v-gold'}`}>
                  {getDisplayStatus(viewInvoice) === 'overdue' ? 'Overdue — was due' : 'Due by'} {new Date(viewInvoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>

            {viewInvoice.notes && (
              <div className="mt-3 p-3 bg-v-gold/10 rounded-lg border border-v-gold/30 text-sm text-v-gold">
                <strong>{'Notes'}:</strong> {viewInvoice.notes}
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
              <button onClick={() => downloadPDF(viewInvoice)} className="px-4 py-2 bg-v-charcoal rounded-lg text-sm font-medium hover:bg-v-charcoal">
                Download PDF
              </button>
              <button
                onClick={() => emailInvoice(viewInvoice)}
                disabled={!viewInvoice.customer_email || actionLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {actionLoading ? 'Sending...' : 'Email Invoice'}
              </button>
              {viewInvoice.status !== 'paid' && getDisplayStatus(viewInvoice) === 'overdue' && (
                <button
                  onClick={() => sendReminder(viewInvoice)}
                  disabled={!viewInvoice.customer_email || actionLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40"
                >
                  Send Reminder
                </button>
              )}
              {viewInvoice.status !== 'paid' && (
                <button
                  onClick={() => { setMarkPaidModal(viewInvoice); setPaymentMethod('cash'); setPaymentNote(''); }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
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
            <h3 className="text-lg font-bold mb-3">{'Mark as Paid'}</h3>
            <p className="text-sm text-v-text-secondary mb-3">{markPaidModal.invoice_number} &mdash; {formatCurrency(markPaidModal.total)}</p>
            <label className="block text-sm font-medium mb-1">{'Payment method'}</label>
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
              <button onClick={() => setMarkPaidModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-v-text-secondary hover:bg-white/5">{'Cancel'}</button>
              <button
                onClick={markAsPaid}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
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
            <h3 className="text-lg font-bold mb-3">{'Create Invoice from Job'}</h3>
            <p className="text-sm text-v-text-secondary mb-3">Select a paid or completed job to generate an invoice.</p>
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            {paidQuotes.length === 0 ? (
              <p className="text-v-text-secondary text-center py-6">{'No paid jobs without invoices found.'}</p>
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
                        <p className="text-sm font-medium">{q.client_name || q.customer_name || 'Customer'}</p>
                        <p className="text-xs text-v-text-secondary">{q.aircraft_model || q.aircraft_type || 'Aircraft'} &middot; {new Date(q.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className="font-bold text-v-text-primary">{formatCurrency(q.total_price)}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setCreateModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-v-text-secondary hover:bg-white/5">{'Cancel'}</button>
              <button
                onClick={createInvoice}
                disabled={!selectedQuoteId || actionLoading}
                className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg font-medium disabled:opacity-50"
              >
                {actionLoading ? 'Creating...' : '+ Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
