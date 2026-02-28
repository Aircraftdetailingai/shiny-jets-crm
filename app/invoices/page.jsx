"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const statusColors = {
  paid: 'bg-green-100 text-green-700',
  unpaid: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  void: 'bg-gray-100 text-gray-500',
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

  const markAsPaid = async () => {
    if (!markPaidModal) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${markPaidModal.id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ status: 'paid', payment_method: paymentMethod }),
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

  const filtered = filter === 'all' ? invoices : invoices.filter(inv => inv.status === filter);

  const totalUnpaid = invoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

  const filterLabels = {
    all: 'All',
    unpaid: 'Unpaid',
    paid: 'Paid',
  };

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-white text-2xl hover:opacity-70">&larr;</a>
          <h1 className="text-2xl font-bold text-white">{'Invoices'}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'unpaid', 'paid'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
          <button
            onClick={() => { setCreateModal(true); fetchPaidQuotes(); }}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-90 shadow"
          >
            {'+ Create Invoice'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{'Total Invoices'}</p>
          <p className="text-xl font-bold text-gray-900">{invoices.length}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{'Outstanding'}</p>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(totalUnpaid)}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{'Collected'}</p>
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
            <div className="bg-white rounded-lg p-8 text-center shadow">
              <p className="text-gray-500">{'No invoices yet. Create one from a completed job.'}</p>
            </div>
          ) : (
            filtered.map(inv => (
              <div
                key={inv.id}
                className="bg-white rounded-lg p-4 shadow hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setViewInvoice(inv)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">{inv.invoice_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[inv.status] || statusColors.unpaid}`}>
                        {inv.status || 'Unpaid'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {inv.customer_name || 'Customer'}
                      {inv.aircraft ? ` \u00B7 ${inv.aircraft}` : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(inv.created_at).toLocaleDateString()}
                      {inv.emailed_at ? ` \u00B7 ${'Emailed'}` : ''}
                      {inv.payment_method ? ` \u00B7 ${inv.payment_method}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(inv.total)}</p>
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadPDF(inv); }}
                        className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-gray-600"
                        title={'Download PDF'}
                      >
                        {'PDF'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); emailInvoice(inv); }}
                        disabled={!inv.customer_email || actionLoading}
                        className="text-xs px-2 py-1 bg-blue-100 rounded hover:bg-blue-200 text-blue-700 disabled:opacity-40"
                        title={'Email Invoice'}
                      >
                        {'Email'}
                      </button>
                      {inv.status !== 'paid' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setMarkPaidModal(inv); setPaymentMethod('cash'); }}
                          className="text-xs px-2 py-1 bg-green-100 rounded hover:bg-green-200 text-green-700"
                          title={'Mark as Paid'}
                        >
                          {'Mark as Paid'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setViewInvoice(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{viewInvoice.invoice_number}</h2>
                <p className="text-sm text-gray-500">{new Date(viewInvoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColors[viewInvoice.status] || statusColors.unpaid}`}>
                  {(viewInvoice.status || 'Unpaid').toUpperCase()}
                </span>
                <button onClick={() => setViewInvoice(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
            </div>

            {/* From / To */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase">{'From'}</p>
                <p className="font-semibold">{viewInvoice.detailer_company || viewInvoice.detailer_name}</p>
                {viewInvoice.detailer_email && <p className="text-gray-500">{viewInvoice.detailer_email}</p>}
                {viewInvoice.detailer_phone && <p className="text-gray-500">{viewInvoice.detailer_phone}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">{'Bill To'}</p>
                <p className="font-semibold">{viewInvoice.customer_name || 'Customer'}</p>
                {viewInvoice.customer_company && <p className="text-gray-500">{viewInvoice.customer_company}</p>}
                {viewInvoice.customer_email && <p className="text-gray-500">{viewInvoice.customer_email}</p>}
              </div>
            </div>

            {viewInvoice.aircraft && <p className="text-sm text-gray-600 mb-1">{'Aircraft'}: <strong>{viewInvoice.aircraft}</strong>{viewInvoice.tail_number ? ` (${viewInvoice.tail_number})` : ''}</p>}
            {viewInvoice.airport && <p className="text-sm text-gray-600 mb-3">{'Airport'}: <strong>{viewInvoice.airport}</strong></p>}

            {/* Line items */}
            {(viewInvoice.line_items || []).length > 0 && (
              <div className="border rounded-lg overflow-hidden mb-3">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500 text-xs uppercase">{'Services'}</th>
                      <th className="text-right px-3 py-2 text-gray-500 text-xs uppercase">{'Amount'}</th>
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
                  <div key={i} className="flex justify-between text-sm text-gray-500">
                    <span>{a.name}</span>
                    <span>{formatCurrency(a.calculated || a.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Fee + Total */}
            <div className="border-t-2 border-[#1e3a5f] pt-3">
              {viewInvoice.platform_fee > 0 && (
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                  <span>{'Platform fee'} ({(viewInvoice.platform_fee_rate * 100).toFixed(0)}%)</span>
                  <span>{formatCurrency(viewInvoice.platform_fee)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">{'Total'}</span>
                <span className="text-2xl font-bold text-[#1e3a5f]">{formatCurrency(viewInvoice.total)}</span>
              </div>
            </div>

            {viewInvoice.notes && (
              <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
                <strong>{'Notes'}:</strong> {viewInvoice.notes}
              </div>
            )}

            {viewInvoice.payment_method && (
              <p className="text-sm text-gray-500 mt-2">{'Payment method'}: {viewInvoice.payment_method}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={() => downloadPDF(viewInvoice)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200">
                {'Download PDF'}
              </button>
              <button
                onClick={() => emailInvoice(viewInvoice)}
                disabled={!viewInvoice.customer_email || actionLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {actionLoading ? 'Sending...' : 'Email Invoice'}
              </button>
              {viewInvoice.status !== 'paid' && (
                <button
                  onClick={() => { setMarkPaidModal(viewInvoice); setPaymentMethod('cash'); }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  {'Mark as Paid'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {markPaidModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setMarkPaidModal(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">{'Mark as Paid'}</h3>
            <p className="text-sm text-gray-600 mb-3">{markPaidModal.invoice_number} &mdash; {formatCurrency(markPaidModal.total)}</p>
            <label className="block text-sm font-medium mb-1">{'Payment method'}</label>
            <div className="flex gap-2 mb-4">
              {['cash', 'check', 'wire', 'other'].map(m => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    paymentMethod === m ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {m === 'cash' ? 'Cash' : m === 'check' ? 'Check' : m === 'wire' ? 'Wire' : 'Other'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMarkPaidModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">{'Cancel'}</button>
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
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">{'Create Invoice from Job'}</h3>
            <p className="text-sm text-gray-600 mb-3">Select a paid or completed job to generate an invoice.</p>
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            {paidQuotes.length === 0 ? (
              <p className="text-gray-400 text-center py-6">{'No paid jobs without invoices found.'}</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                {paidQuotes.map(q => (
                  <label
                    key={q.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedQuoteId === q.id ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="quote"
                        value={q.id}
                        checked={selectedQuoteId === q.id}
                        onChange={() => setSelectedQuoteId(q.id)}
                        className="accent-amber-500"
                      />
                      <div>
                        <p className="text-sm font-medium">{q.client_name || q.customer_name || 'Customer'}</p>
                        <p className="text-xs text-gray-500">{q.aircraft_model || q.aircraft_type || 'Aircraft'} &middot; {new Date(q.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className="font-bold text-gray-900">{formatCurrency(q.total_price)}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setCreateModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">{'Cancel'}</button>
              <button
                onClick={createInvoice}
                disabled={!selectedQuoteId || actionLoading}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
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
