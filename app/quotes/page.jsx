"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
// DataTable removed — using custom Gmail-style list
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import ExportGate from '@/components/ExportGate';

const statusColors = {
  draft: 'border border-gray-500/40 text-gray-400',
  sent: 'border border-white/30 text-white',
  viewed: 'border border-[#C9A84C]/50 text-[#C9A84C]',
  paid: 'border border-green-500/40 text-green-400',
  approved: 'border border-green-500/40 text-green-400',
  completed: 'border border-purple-400/40 text-purple-300',
  expired: 'border border-red-500/30 text-red-400/70',
  scheduled: 'border border-indigo-400/40 text-indigo-300',
  in_progress: 'border border-cyan-400/40 text-cyan-300',
};

export default function QuotesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [completeModal, setCompleteModal] = useState(null);
  const [completionData, setCompletionData] = useState({
    actual_hours: '',
    product_cost: '',
    notes: '',
    wait_time_minutes: '',
    repositioning_needed: false,
    customer_late: false,
    issues: '',
  });
  const [serviceHours, setServiceHours] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [completing, setCompleting] = useState(false);
  const [changeOrderModal, setChangeOrderModal] = useState(null);
  const [changeOrderData, setChangeOrderData] = useState({
    services: [{ name: '', amount: '' }],
    reason: '',
  });
  const [submittingChangeOrder, setSubmittingChangeOrder] = useState(false);
  const [servicesMap, setServicesMap] = useState({});
  const [userPlan, setUserPlan] = useState('free');
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [duplicateData, setDuplicateData] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    notes: '',
  });
  const [duplicating, setDuplicating] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(null); // { action, label }
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const statusLabels = {
    draft: 'Draft',
    sent: 'Sent',
    viewed: 'Viewed',
    paid: 'Paid',
    approved: 'Approved',
    completed: 'Completed',
    expired: 'Expired',
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    const stored = localStorage.getItem('vector_user');
    if (stored) {
      try { setUserPlan(JSON.parse(stored).plan || 'free'); } catch (e) {}
    }

    const fetchQuotes = async () => {
      try {
        const res = await fetch('/api/quotes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setQuotes(data.quotes || data || []);
        }
      } catch (err) {
        console.error('Failed to fetch quotes:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchServices = async () => {
      try {
        const res = await fetch('/api/services', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const map = {};
          (data.services || []).forEach(s => { map[s.id] = s; });
          setServicesMap(map);
        }
      } catch (err) {
        console.error('Failed to fetch services:', err);
      }
    };

    fetchQuotes();
    fetchServices();
  }, [router]);

  const getProductCost = (quote) => {
    const items = quote.line_items || [];
    if (!items.length) return 0;
    return items.reduce((sum, item) => {
      // Prefer cost stored on line item (historical), fall back to current service cost
      const costPerHour = parseFloat(item.product_cost_per_hour) || parseFloat(servicesMap[item.service_id]?.product_cost_per_hour) || 0;
      const hours = parseFloat(item.hours) || 0;
      return sum + (costPerHour * hours);
    }, 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatus = (quote) => {
    if (quote.status === 'completed') return 'completed';
    if (quote.status === 'paid' || quote.status === 'approved') return 'paid';
    if (quote.valid_until && new Date() > new Date(quote.valid_until)) return 'expired';
    return quote.status || 'draft';
  };

  const openCompleteModal = (quote) => {
    setCompleteModal(quote);
    setCompletionData({
      actual_hours: quote.total_hours?.toString() || '',
      product_cost: '',
      notes: '',
      wait_time_minutes: '',
      repositioning_needed: false,
      customer_late: false,
      issues: '',
    });
    // Pre-fill per-service hours from line items
    const items = quote.line_items || [];
    if (items.length > 0) {
      setServiceHours(items.map(item => ({
        service_name: item.description || item.service || '',
        hours_field: item.hours_field || '',
        quoted_hours: parseFloat(item.hours) || 0,
        actual_hours: parseFloat(item.hours) || 0,
      })));
    } else {
      setServiceHours([]);
    }
    // Fetch inventory products for selection
    setSelectedProducts([]);
    const token = localStorage.getItem('vector_token');
    if (token) {
      fetch('/api/products', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.products) setInventoryProducts(data.products); })
        .catch(() => {});
    }
  };

  const openChangeOrderModal = (quote) => {
    setChangeOrderModal(quote);
    setChangeOrderData({
      services: [{ name: '', amount: '' }],
      reason: '',
    });
  };

  const addChangeOrderService = () => {
    setChangeOrderData({
      ...changeOrderData,
      services: [...changeOrderData.services, { name: '', amount: '' }],
    });
  };

  const updateChangeOrderService = (index, field, value) => {
    const updated = [...changeOrderData.services];
    updated[index][field] = value;
    setChangeOrderData({ ...changeOrderData, services: updated });
  };

  const removeChangeOrderService = (index) => {
    if (changeOrderData.services.length === 1) return;
    const updated = changeOrderData.services.filter((_, i) => i !== index);
    setChangeOrderData({ ...changeOrderData, services: updated });
  };

  const submitChangeOrder = async () => {
    const validServices = changeOrderData.services.filter(s => s.name && s.amount);
    if (validServices.length === 0) {
      alert('Please add at least one service');
      return;
    }

    setSubmittingChangeOrder(true);
    try {
      const token = localStorage.getItem('vector_token');
      const amount = validServices.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

      const res = await fetch('/api/change-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quote_id: changeOrderModal.id,
          services: validServices.map(s => ({
            name: s.name,
            amount: parseFloat(s.amount),
          })),
          amount,
          reason: changeOrderData.reason,
        }),
      });

      if (res.ok) {
        alert('Change order sent to customer!');
        setChangeOrderModal(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create change order');
      }
    } catch (err) {
      alert('Failed to create change order');
    } finally {
      setSubmittingChangeOrder(false);
    }
  };

  const openDuplicateModal = (quote) => {
    setDuplicateModal(quote);
    setDuplicateData({
      client_name: quote.client_name || '',
      client_email: quote.client_email || '',
      client_phone: quote.client_phone || '',
      notes: quote.notes || '',
    });
  };

  const submitDuplicate = async () => {
    if (!duplicateModal) return;
    setDuplicating(true);
    try {
      const token = localStorage.getItem('vector_token');
      const src = duplicateModal;
      const payload = {
        aircraft_type: src.aircraft_type,
        aircraft_model: src.aircraft_model,
        aircraft_id: src.aircraft_id || null,
        surface_area_sqft: src.surface_area_sqft || null,
        services: src.services || {},
        selected_services: src.selected_services || [],
        selected_package_id: src.selected_package_id || null,
        selected_package_name: src.selected_package_name || null,
        base_hours: src.base_hours || 0,
        total_hours: src.total_hours || 0,
        total_price: src.total_price || 0,
        notes: duplicateData.notes,
        line_items: src.line_items || [],
        labor_total: src.labor_total || 0,
        products_total: src.products_total || 0,
        efficiency_factor: src.efficiency_factor || 1.0,
        access_difficulty: src.access_difficulty || 1.0,
        job_location: src.job_location || null,
        minimum_fee_applied: src.minimum_fee_applied || false,
        calculated_price: src.calculated_price || src.total_price || 0,
        package_savings: src.package_savings || 0,
        discount_percent: src.discount_percent || 0,
        addon_fees: src.addon_fees || [],
        addon_total: src.addon_total || 0,
        product_estimates: src.product_estimates || [],
        airport: src.airport || null,
        // Editable customer fields from modal
        client_name: duplicateData.client_name || null,
        client_email: duplicateData.client_email || null,
        customer_phone: duplicateData.client_phone || null,
      };

      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || data.message || 'Failed to duplicate quote');
        return;
      }

      const newQuote = await res.json();
      setQuotes(prev => [{ ...newQuote, aircraft_name: newQuote.aircraft_model ? `${newQuote.aircraft_type || ''} ${newQuote.aircraft_model}`.trim() : newQuote.aircraft_type || 'Unknown Aircraft' }, ...prev]);
      setDuplicateModal(null);
    } catch (err) {
      alert('Failed to duplicate quote');
    } finally {
      setDuplicating(false);
    }
  };

  const completeJob = async () => {
    if (!completionData.actual_hours || !completeModal) return;
    setCompleting(true);

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quote_id: completeModal.id,
          actual_hours: parseFloat(completionData.actual_hours),
          service_hours: serviceHours.length > 0 ? serviceHours : undefined,
          products_used: selectedProducts.filter(sp => sp.product_id && sp.amount).map(sp => ({
            product_id: sp.product_id,
            amount: parseFloat(sp.amount) || 0,
          })),
          product_cost: parseFloat(completionData.product_cost) || 0,
          notes: completionData.notes,
          wait_time_minutes: parseInt(completionData.wait_time_minutes) || 0,
          repositioning_needed: completionData.repositioning_needed,
          customer_late: completionData.customer_late,
          issues: completionData.issues,
          product_estimates: completeModal.product_estimates || [],
        }),
      });

      if (res.ok) {
        setQuotes(quotes.map(q =>
          q.id === completeModal.id ? { ...q, status: 'completed' } : q
        ));
        setCompleteModal(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to complete job');
      }
    } catch (err) {
      alert('Failed to complete job');
    } finally {
      setCompleting(false);
    }
  };

  const filteredQuotes = useMemo(() => quotes.filter((q) => {
    const status = getStatus(q);
    if (filter === 'all') return true;
    if (filter === 'active') return ['sent', 'viewed'].includes(status);
    if (filter === 'paid') return status === 'paid';
    if (filter === 'completed') return status === 'completed';
    if (filter === 'expired') return status === 'expired';
    return true;
  }), [quotes, filter]);

  // Bulk selection helpers
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredQuotes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQuotes.map(q => q.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());
  const hasSelection = selectedIds.size > 0;

  const executeBulkAction = async (action) => {
    setBulkProcessing(true);
    try {
      const token = localStorage.getItem('vector_token');

      if (action === 'export') {
        // Client-side CSV export
        const selected = quotes.filter(q => selectedIds.has(q.id));
        const escCSV = (v) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
        const rows = selected.map(q => [
          q.created_at ? new Date(q.created_at).toISOString().split('T')[0] : '',
          q.client_name || '',
          q.client_email || '',
          q.aircraft_model || q.aircraft_type || '',
          q.tail_number || '',
          (q.line_items || []).map(li => li.description || li.service).join('; '),
          q.total_price?.toFixed(2) || '0.00',
          getStatus(q),
          q.sent_at ? new Date(q.sent_at).toISOString().split('T')[0] : '',
          q.paid_at ? new Date(q.paid_at).toISOString().split('T')[0] : '',
          q.notes || '',
        ]);
        const csv = [
          'date,customer,email,aircraft,registration,services,amount,status,sent_date,paid_date,notes',
          ...rows.map(r => r.map(escCSV).join(',')),
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `quotes-selected-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        clearSelection();
        setBulkConfirm(null);
        return;
      }

      const res = await fetch('/api/quotes/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ids: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Bulk action failed');
        return;
      }

      // Update local state
      if (action === 'delete') {
        setQuotes(prev => prev.filter(q => !selectedIds.has(q.id)));
      } else if (action === 'expire') {
        setQuotes(prev => prev.map(q => selectedIds.has(q.id) ? { ...q, status: 'expired' } : q));
      } else if (action === 'send') {
        setQuotes(prev => prev.map(q => selectedIds.has(q.id) && ['draft', 'sent'].includes(q.status) && q.client_email ? { ...q, status: 'sent' } : q));
        if (data.emailsSent !== undefined) {
          alert(`Sent ${data.emailsSent} email${data.emailsSent !== 1 ? 's' : ''} (${data.updated} quotes updated)`);
        }
      }

      clearSelection();
    } catch (err) {
      console.error('Bulk action error:', err);
      alert('Bulk action failed');
    } finally {
      setBulkProcessing(false);
      setBulkConfirm(null);
    }
  };

  // Column definitions removed — using custom row renderer below

  const stats = {
    total: quotes.length,
    active: quotes.filter(q => ['sent', 'viewed'].includes(getStatus(q))).length,
    paid: quotes.filter(q => getStatus(q) === 'paid').length,
    completed: quotes.filter(q => getStatus(q) === 'completed').length,
    revenue: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + (q.total_price || 0), 0),
    productCost: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + getProductCost(q), 0),
  };

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-8 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-lg hover:text-[#C9A84C] transition-colors">&#8592;</a>
          <h1 className="text-2xl sm:text-3xl font-normal tracking-[0.25em] uppercase" style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}>Quotes</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <ExportGate plan={userPlan}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (quotes.length === 0) return;
                  const escCSV = (v) => { const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
                  const rows = quotes.map(q => [
                    q.created_at ? new Date(q.created_at).toISOString().split('T')[0] : '',
                    q.client_name || '', q.aircraft_model || q.aircraft_type || '',
                    q.total_price?.toFixed(2) || '0.00', q.status || 'draft',
                  ]);
                  const csv = ['date,customer,aircraft,amount,status', ...rows.map(r => r.map(escCSV).join(','))].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                  a.download = `quotes-export-${new Date().toISOString().split('T')[0]}.csv`;
                  a.click(); URL.revokeObjectURL(a.href);
                }}
                disabled={quotes.length === 0}
                className="text-gray-400 hover:text-white hover:underline text-sm transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={async () => {
                  const token = localStorage.getItem('vector_token');
                  const res = await fetch('/api/customers/export', { headers: { Authorization: `Bearer ${token}` } });
                  if (res.ok) {
                    const blob = await res.blob();
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                    a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
                    a.click(); URL.revokeObjectURL(a.href);
                  }
                }}
                className="text-gray-400 hover:text-white hover:underline text-sm transition-colors"
              >
                Export Customers
              </button>
            </div>
          </ExportGate>
          <a
            href="/dashboard"
            className="px-5 py-2 bg-[#C9A84C] text-[#0D1B2A] text-sm font-medium uppercase tracking-widest hover:bg-[#b8993f] transition-colors"
          >
            New Quote
          </a>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-px bg-v-border/30 mb-8">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Active', value: stats.active, color: 'text-[#C9A84C]' },
          { label: 'Paid', value: stats.paid, color: 'text-green-400' },
          { label: 'Completed', value: stats.completed, color: 'text-purple-300' },
          { label: 'Revenue', value: `${currencySymbol()}${formatPriceWhole(stats.revenue)}`, color: 'text-white' },
          { label: 'Gross Profit', value: `${currencySymbol()}${formatPriceWhole(stats.revenue - stats.productCost)}`, color: 'text-green-400', sub: stats.revenue > 0 ? `${((1 - stats.productCost / stats.revenue) * 100).toFixed(0)}%` : null },
        ].map((s, i) => (
          <div key={i} className="bg-v-charcoal p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider">{s.label}</p>
            <p className={`text-xl font-light mt-1 ${s.color}`}>{s.value}</p>
            {s.sub && <p className="text-xs text-gray-500 mt-0.5">{s.sub} margin</p>}
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="sticky top-0 z-30 bg-v-charcoal pt-2 pb-0 -mx-4 px-4">
      <div className="flex space-x-6 border-b border-v-border/30 overflow-x-auto">
        {['all', 'active', 'paid', 'completed', 'expired'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`pb-2 text-sm tracking-wide transition-colors ${
              filter === f
                ? 'text-[#C9A84C] border-b-2 border-[#C9A84C]'
                : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
            }`}
          >
            {f === 'all' ? 'All' :
             f === 'active' ? 'Active' :
             f === 'paid' ? 'Paid' :
             f === 'completed' ? 'Completed' :
             'Expired'}
          </button>
        ))}
      </div>
      </div>

      {/* Gmail-style Toolbar */}
      {hasSelection && (
        <div className="bg-v-surface border border-v-border/30 px-4 py-2.5 hidden sm:flex items-center gap-1 relative z-10">
          <input
            type="checkbox"
            checked={selectedIds.size === filteredQuotes.length}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-v-border accent-amber-500 cursor-pointer mr-3"
          />
          <span className="text-sm font-medium text-v-text-primary">{selectedIds.size} selected</span>
          <button type="button" onClick={clearSelection} className="ml-1 mr-2 text-v-text-secondary hover:text-v-text-primary cursor-pointer" title="Clear selection">
            <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex items-center gap-0.5 border-l border-v-border/30 pl-2">
            <button type="button" onClick={() => setBulkConfirm({ action: 'send', label: `Send ${selectedIds.size} quote(s)?`, description: 'Quotes with a customer email in draft/sent status will be emailed.' })} disabled={bulkProcessing} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors disabled:opacity-50 cursor-pointer" title="Send">
              <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="hidden lg:inline">Send</span>
            </button>
            <button type="button" onClick={() => setBulkConfirm({ action: 'expire', label: `Mark ${selectedIds.size} quote(s) as expired?`, description: 'This will change their status to expired.' })} disabled={bulkProcessing} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors disabled:opacity-50 cursor-pointer" title="Archive/Expire">
              <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-2-3H6L4 7m16 0v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0H4m8 4v6m0 0l-3-3m3 3l3-3" /></svg>
              <span className="hidden lg:inline">Archive</span>
            </button>
            <button type="button" onClick={() => setBulkConfirm({ action: 'delete', label: `Delete ${selectedIds.size} quote(s) permanently?`, description: 'This cannot be undone.' })} disabled={bulkProcessing} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50 cursor-pointer" title="Delete">
              <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              <span className="hidden lg:inline">Delete</span>
            </button>
            <ExportGate plan={userPlan}>
              <button type="button" onClick={() => executeBulkAction('export')} disabled={bulkProcessing} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors disabled:opacity-50 cursor-pointer" title="Export CSV">
                <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                <span className="hidden lg:inline">Export</span>
              </button>
            </ExportGate>
          </div>
        </div>
      )}

      {/* Mobile bulk bar */}
      {hasSelection && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-v-surface border-t border-v-border px-4 py-3 z-40 flex items-center justify-between">
          <span className="text-sm text-v-text-primary font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setBulkConfirm({ action: 'send', label: `Send ${selectedIds.size} quote(s)?`, description: 'Quotes with a customer email will be emailed.' })} className="text-v-text-secondary hover:text-v-text-primary"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></button>
            <button type="button" onClick={() => setBulkConfirm({ action: 'expire', label: `Archive ${selectedIds.size} quote(s)?`, description: 'Status will be set to expired.' })} className="text-v-text-secondary hover:text-v-text-primary"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-2-3H6L4 7m16 0v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0H4m8 4v6m0 0l-3-3m3 3l3-3" /></svg></button>
            <button type="button" onClick={() => setBulkConfirm({ action: 'delete', label: `Delete ${selectedIds.size} quote(s)?`, description: 'This cannot be undone.' })} className="text-red-400/70 hover:text-red-400"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            <button type="button" onClick={clearSelection} className="text-v-text-secondary hover:text-v-text-primary"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>
      )}

      {/* Quote List */}
      <div className={`bg-v-surface ${hasSelection ? '' : ''} overflow-hidden`}>
        {/* Column headers */}
        {!hasSelection && (
          <div className="border-b border-v-border/30 px-4 py-2.5 hidden sm:grid sm:grid-cols-12 gap-4 items-center">
            <div className="col-span-1" />
            <div className="col-span-3 text-[10px] uppercase tracking-widest text-gray-500">Customer</div>
            <div className="col-span-2 text-[10px] uppercase tracking-widest text-gray-500">Services</div>
            <div className="col-span-2 text-[10px] uppercase tracking-widest text-gray-500 text-right">Total</div>
            <div className="col-span-2 text-[10px] uppercase tracking-widest text-gray-500">Status</div>
            <div className="col-span-2 text-[10px] uppercase tracking-widest text-gray-500 text-right">Date</div>
          </div>
        )}

        {filteredQuotes.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">No quotes found</div>
        ) : (
          filteredQuotes.map((quote) => {
            const status = getStatus(quote);
            const isSelected = selectedIds.has(quote.id);
            const services = quote.line_items && Array.isArray(quote.line_items) ? quote.line_items.map(i => i.description || i.service) : [];
            const displayName = quote.customer_company || quote.client_name || 'Unnamed';
            const aircraftLine = [quote.aircraft_type, quote.aircraft_model].filter(Boolean).join(' ');
            return (
              <div key={quote.id} className="group">
                {/* Desktop row */}
                <div
                  className="hidden sm:grid sm:grid-cols-12 gap-4 items-center px-4 border-b border-v-border/10 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  style={{ minHeight: '56px' }}
                  onClick={() => quote.share_link ? window.open(`/q/${quote.share_link}`, '_blank') : null}
                >
                  {/* Checkbox */}
                  <div className="col-span-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(quote.id)}
                      className={`w-4 h-4 rounded border-v-border accent-amber-500 cursor-pointer transition-opacity duration-150 ${
                        hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  </div>
                  {/* Customer + Aircraft */}
                  <div className="col-span-3 min-w-0">
                    <p className="font-medium text-v-text-primary text-sm truncate">{displayName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {aircraftLine || 'No aircraft'}
                      {quote.tail_number ? ` · ${quote.tail_number}` : ''}
                    </p>
                  </div>
                  {/* Services */}
                  <div className="col-span-2 min-w-0">
                    <p className="text-xs text-gray-400 truncate" title={services.join(', ')}>
                      {services.length > 0 ? (services.length <= 2 ? services.join(', ') : `${services.length} services`) : '-'}
                    </p>
                  </div>
                  {/* Total */}
                  <div className="col-span-2 text-right">
                    <span className="text-[#C9A84C] font-mono text-sm">{currencySymbol()}{formatPrice(quote.total_price)}</span>
                  </div>
                  {/* Status */}
                  <div className="col-span-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase ${statusColors[status] || 'border border-gray-500/40 text-gray-400'}`}>
                      {statusLabels[status] || status}
                    </span>
                  </div>
                  {/* Date */}
                  <div className="col-span-2 text-right">
                    <span className="text-xs text-gray-500">{formatDate(quote.created_at)}</span>
                  </div>
                </div>
                {/* Mobile row */}
                <div className="sm:hidden flex items-start gap-3 px-4 py-3 border-b border-v-border/10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(quote.id)}
                    className="w-4 h-4 mt-1 accent-amber-500 flex-shrink-0"
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => quote.share_link ? window.open(`/q/${quote.share_link}`, '_blank') : null}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-v-text-primary text-sm truncate">{displayName}</p>
                      <span className="text-[#C9A84C] font-mono text-sm flex-shrink-0">{currencySymbol()}{formatPrice(quote.total_price)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {aircraftLine || 'No aircraft'}
                      {quote.tail_number ? ` · ${quote.tail_number}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase ${statusColors[status] || 'border border-gray-500/40 text-gray-400'}`}>
                        {statusLabels[status] || status}
                      </span>
                      <span className="text-[10px] text-gray-500">{formatDate(quote.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Complete Job Modal */}
      {completeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Complete Job</h3>
            <p className="text-gray-600 mb-4">
              {completeModal.aircraft_model || completeModal.aircraft_type}
              {completeModal.client_name && ` - ${completeModal.client_name}`}
            </p>

            {/* Contact Info */}
            {(completeModal.poc_name || completeModal.emergency_contact_name) && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm space-y-2">
                {completeModal.poc_name && (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{completeModal.poc_name}</span>
                      {completeModal.poc_role && <span className="text-gray-500 ml-1">({completeModal.poc_role})</span>}
                    </div>
                    {completeModal.poc_phone && (
                      <a href={`tel:${completeModal.poc_phone}`} className="text-blue-600 hover:underline">{completeModal.poc_phone}</a>
                    )}
                  </div>
                )}
                {completeModal.emergency_contact_name && (
                  <div className="flex items-center justify-between pt-1 border-t">
                    <div>
                      <span className="text-xs text-red-600 font-semibold uppercase">Emergency: </span>
                      <span className="font-medium">{completeModal.emergency_contact_name}</span>
                    </div>
                    {completeModal.emergency_contact_phone && (
                      <a href={`tel:${completeModal.emergency_contact_phone}`} className="text-blue-600 hover:underline">{completeModal.emergency_contact_phone}</a>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {/* Per-Service Hours Breakdown */}
              {serviceHours.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium mb-2">Actual Hours Per Service</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {serviceHours.map((sh, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-gray-900 truncate">{sh.service_name}</p>
                          <p className="text-xs text-gray-400">{`Quoted: ${sh.quoted_hours.toFixed(1)}h`}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.25"
                            value={sh.actual_hours}
                            onChange={(e) => {
                              const updated = [...serviceHours];
                              updated[idx] = { ...updated[idx], actual_hours: parseFloat(e.target.value) || 0 };
                              setServiceHours(updated);
                              // Auto-update total
                              const total = updated.reduce((sum, s) => sum + (parseFloat(s.actual_hours) || 0), 0);
                              setCompletionData(prev => ({ ...prev, actual_hours: total.toString() }));
                            }}
                            className="w-20 border rounded px-2 py-1.5 text-sm text-right"
                          />
                          <span className="text-xs text-gray-500">h</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t">
                    <span className="text-sm font-medium text-gray-700">Total Hours</span>
                    <span className="text-lg font-bold text-gray-900">{parseFloat(completionData.actual_hours || 0).toFixed(1)}h</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {`Quote estimate: ${completeModal.total_hours?.toFixed(1) || "0"} hours`}
                    {completeModal.total_hours && parseFloat(completionData.actual_hours) !== completeModal.total_hours && (
                      <span className={parseFloat(completionData.actual_hours) > completeModal.total_hours ? ' text-red-500' : ' text-green-500'}>
                         ({parseFloat(completionData.actual_hours) > completeModal.total_hours ? '+' : ''}
                        {(parseFloat(completionData.actual_hours) - completeModal.total_hours).toFixed(1)}h)
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">Actual Hours Worked</label>
                  <input
                    type="number"
                    step="0.25"
                    value={completionData.actual_hours}
                    onChange={(e) => setCompletionData({ ...completionData, actual_hours: e.target.value })}
                    placeholder={`Estimated: ${completeModal.total_hours?.toFixed(1) || "0"}`}
                    className="w-full border rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {`Quote estimate: ${completeModal.total_hours?.toFixed(1) || "0"} hours`}
                  </p>
                </div>
              )}

              {/* Product estimates from quote */}
              {completeModal.product_estimates && completeModal.product_estimates.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800 mb-1">Estimated Products (from quote)</p>
                  <div className="space-y-0.5">
                    {completeModal.product_estimates.map((e, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-blue-700">{e.product_name}</span>
                        <span className="font-medium text-blue-900">{e.amount}{e.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Products Used</label>
                {inventoryProducts.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedProducts.map((sp, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <select
                          value={sp.product_id}
                          onChange={(e) => {
                            const updated = [...selectedProducts];
                            updated[idx] = { ...updated[idx], product_id: e.target.value };
                            setSelectedProducts(updated);
                          }}
                          className="flex-1 border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">Select product...</option>
                          {inventoryProducts.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.current_quantity} {p.unit})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.1"
                          value={sp.amount}
                          onChange={(e) => {
                            const updated = [...selectedProducts];
                            updated[idx] = { ...updated[idx], amount: e.target.value };
                            setSelectedProducts(updated);
                            // Auto-calculate total product cost
                            let totalCost = 0;
                            updated.forEach(s => {
                              const prod = inventoryProducts.find(p => p.id === s.product_id);
                              if (prod) totalCost += (parseFloat(s.amount) || 0) * (prod.cost_per_unit || 0);
                            });
                            setCompletionData(prev => ({ ...prev, product_cost: totalCost.toFixed(2) }));
                          }}
                          placeholder="Qty"
                          className="w-20 border rounded px-2 py-1.5 text-sm text-right"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedProducts(selectedProducts.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 text-lg"
                        >&times;</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedProducts([...selectedProducts, { product_id: '', amount: '' }])}
                      className="text-sm text-amber-600 hover:underline"
                    >Add Product</button>
                    {selectedProducts.length > 0 && completionData.product_cost && (
                      <p className="text-xs text-gray-500 mt-1">Estimated material cost: {currencySymbol()}{completionData.product_cost}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{currencySymbol()}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={completionData.product_cost}
                      onChange={(e) => setCompletionData({ ...completionData, product_cost: e.target.value })}
                      placeholder="0.00"
                      className="w-32 border rounded px-3 py-2"
                    />
                    <a href="/products" className="text-xs text-amber-600 hover:underline">Add products to track inventory</a>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <textarea
                  value={completionData.notes}
                  onChange={(e) => setCompletionData({ ...completionData, notes: e.target.value })}
                  placeholder="Any notes about this job..."
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                />
              </div>

              {/* Smart Tracking Section */}
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <span>Track Hidden Costs</span>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">+Points</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Wait Time (min)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={completionData.wait_time_minutes}
                        onChange={(e) => setCompletionData({ ...completionData, wait_time_minutes: e.target.value })}
                        placeholder="0"
                        className="w-20 border rounded px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-gray-500">mins</span>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={completionData.repositioning_needed}
                        onChange={(e) => setCompletionData({ ...completionData, repositioning_needed: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">Repositioning needed</span>
                    </label>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={completionData.customer_late}
                        onChange={(e) => setCompletionData({ ...completionData, customer_late: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">Customer was late</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm text-gray-600 mb-1">Issues (optional)</label>
                  <textarea
                    value={completionData.issues}
                    onChange={(e) => setCompletionData({ ...completionData, issues: e.target.value })}
                    placeholder="Access problems, condition notes, etc..."
                    className="w-full border rounded px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>

                <p className="text-xs text-gray-400 mt-2">
                  Tracking this data earns points and helps identify problem customers.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setCompleteModal(null)}
                className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={completeJob}
                disabled={!completionData.actual_hours || completing}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {completing ? 'Saving...' : 'Complete Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Order Modal */}
      {/* Bulk Confirm Modal */}
      {bulkConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{bulkConfirm.label}</h3>
            <p className="text-sm text-gray-600 mb-6">{bulkConfirm.description}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBulkConfirm(null)}
                disabled={bulkProcessing}
                className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => executeBulkAction(bulkConfirm.action)}
                disabled={bulkProcessing}
                className={`px-4 py-2 text-white rounded disabled:opacity-50 ${
                  bulkConfirm.action === 'delete' ? 'bg-red-600 hover:bg-red-700' :
                  bulkConfirm.action === 'expire' ? 'bg-amber-500 hover:bg-amber-600' :
                  'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {bulkProcessing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Quote Modal */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Duplicate Quote</h3>
            <p className="text-gray-600 mb-4">
              Create a copy of this quote with new customer details.
            </p>

            {/* Source quote summary */}
            <div className="bg-gray-50 p-3 rounded-lg mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {duplicateModal.aircraft_model || duplicateModal.aircraft_type || 'Aircraft'}
                </span>
                <span className="font-bold text-[#C9A84C]">{currencySymbol()}{formatPrice(duplicateModal.total_price)}</span>
              </div>
              {duplicateModal.line_items && duplicateModal.line_items.length > 0 && (
                <div className="mt-1">
                  {duplicateModal.line_items.slice(0, 4).map((li, i) => (
                    <span key={i} className="text-xs text-gray-500">
                      {li.description || li.service}{i < Math.min(duplicateModal.line_items.length, 4) - 1 ? ', ' : ''}
                    </span>
                  ))}
                  {duplicateModal.line_items.length > 4 && (
                    <span className="text-xs text-gray-400"> {`+${duplicateModal.line_items.length - 4} more`}</span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                <input
                  type="text"
                  value={duplicateData.client_name}
                  onChange={(e) => setDuplicateData({ ...duplicateData, client_name: e.target.value })}
                  placeholder="Client Name"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Email</label>
                <input
                  type="email"
                  value={duplicateData.client_email}
                  onChange={(e) => setDuplicateData({ ...duplicateData, client_email: e.target.value })}
                  placeholder="customer@email.com"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={duplicateData.client_phone}
                  onChange={(e) => setDuplicateData({ ...duplicateData, client_phone: e.target.value })}
                  placeholder="(555) 123-4567"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={duplicateData.notes}
                  onChange={(e) => setDuplicateData({ ...duplicateData, notes: e.target.value })}
                  placeholder="Add notes for this quote..."
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-5">
              <button
                onClick={() => setDuplicateModal(null)}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitDuplicate}
                disabled={duplicating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {duplicating ? 'Creating...' : 'Duplicate Quote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {changeOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-5 sm:p-6 w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Change Order</h3>
            <p className="text-gray-600 mb-4">
              {changeOrderModal.aircraft_model || changeOrderModal.aircraft_type}
              {changeOrderModal.client_name && ` - ${changeOrderModal.client_name}`}
            </p>

            <div className="bg-gray-50 p-3 rounded mb-4">
              <p className="text-sm text-gray-600">
                <strong>Current Quote Total:</strong> {currencySymbol()}{formatPrice(changeOrderModal.total_price)}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">Additional Services</label>
                  <button
                    type="button"
                    onClick={addChangeOrderService}
                    className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                  >
                    + Add Service
                  </button>
                </div>
                {changeOrderData.services.map((service, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={service.name}
                      onChange={(e) => updateChangeOrderService(idx, 'name', e.target.value)}
                      placeholder="Service name"
                      className="flex-1 border rounded px-3 py-2"
                    />
                    <div className="flex items-center">
                      <span className="mr-1">{currencySymbol()}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={service.amount}
                        onChange={(e) => updateChangeOrderService(idx, 'amount', e.target.value)}
                        placeholder="0.00"
                        className="w-24 border rounded px-3 py-2"
                      />
                    </div>
                    {changeOrderData.services.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChangeOrderService(idx)}
                        className="text-red-500 hover:text-red-700 px-2"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Reason / Note for Customer</label>
                <textarea
                  value={changeOrderData.reason}
                  onChange={(e) => setChangeOrderData({ ...changeOrderData, reason: e.target.value })}
                  placeholder="Explain why these additional services are needed..."
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>

              {/* Summary */}
              <div className="bg-amber-50 border border-amber-200 p-3 rounded">
                <div className="flex justify-between text-sm mb-1">
                  <span>Additional Amount:</span>
                  <span className="font-semibold">
                    {currencySymbol()}{formatPrice(changeOrderData.services
                      .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0))}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>New Total:</span>
                  <span>
                    {currencySymbol()}{formatPrice((parseFloat(changeOrderModal.total_price) || 0) +
                      changeOrderData.services.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0))}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setChangeOrderModal(null)}
                className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitChangeOrder}
                disabled={submittingChangeOrder}
                className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
              >
                {submittingChangeOrder ? 'Sending...' : 'Send to Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
