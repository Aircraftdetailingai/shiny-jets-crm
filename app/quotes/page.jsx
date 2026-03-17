"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import ExportGate from '@/components/ExportGate';
import AppShell from '@/components/AppShell';

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
  const [search, setSearch] = useState('');
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
  const [bulkConfirm, setBulkConfirm] = useState(null);
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
    setChangeOrderData({ services: [{ name: '', amount: '' }], reason: '' });
  };

  const addChangeOrderService = () => {
    setChangeOrderData({ ...changeOrderData, services: [...changeOrderData.services, { name: '', amount: '' }] });
  };

  const updateChangeOrderService = (index, field, value) => {
    const updated = [...changeOrderData.services];
    updated[index][field] = value;
    setChangeOrderData({ ...changeOrderData, services: updated });
  };

  const removeChangeOrderService = (index) => {
    if (changeOrderData.services.length === 1) return;
    setChangeOrderData({ ...changeOrderData, services: changeOrderData.services.filter((_, i) => i !== index) });
  };

  const submitChangeOrder = async () => {
    const validServices = changeOrderData.services.filter(s => s.name && s.amount);
    if (validServices.length === 0) { alert('Please add at least one service'); return; }
    setSubmittingChangeOrder(true);
    try {
      const token = localStorage.getItem('vector_token');
      const amount = validServices.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
      const res = await fetch('/api/change-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quote_id: changeOrderModal.id, services: validServices.map(s => ({ name: s.name, amount: parseFloat(s.amount) })), amount, reason: changeOrderData.reason }),
      });
      if (res.ok) { alert('Change order sent to customer!'); setChangeOrderModal(null); }
      else { const data = await res.json(); alert(data.error || 'Failed to create change order'); }
    } catch (err) { alert('Failed to create change order'); }
    finally { setSubmittingChangeOrder(false); }
  };

  const openDuplicateModal = (quote) => {
    setDuplicateModal(quote);
    setDuplicateData({ client_name: quote.client_name || '', client_email: quote.client_email || '', client_phone: quote.client_phone || '', notes: quote.notes || '' });
  };

  const submitDuplicate = async () => {
    if (!duplicateModal) return;
    setDuplicating(true);
    try {
      const token = localStorage.getItem('vector_token');
      const src = duplicateModal;
      const payload = {
        aircraft_type: src.aircraft_type, aircraft_model: src.aircraft_model, aircraft_id: src.aircraft_id || null,
        surface_area_sqft: src.surface_area_sqft || null, services: src.services || {}, selected_services: src.selected_services || [],
        selected_package_id: src.selected_package_id || null, selected_package_name: src.selected_package_name || null,
        base_hours: src.base_hours || 0, total_hours: src.total_hours || 0, total_price: src.total_price || 0, notes: duplicateData.notes,
        line_items: src.line_items || [], labor_total: src.labor_total || 0, products_total: src.products_total || 0,
        efficiency_factor: src.efficiency_factor || 1.0, access_difficulty: src.access_difficulty || 1.0, job_location: src.job_location || null,
        minimum_fee_applied: src.minimum_fee_applied || false, calculated_price: src.calculated_price || src.total_price || 0,
        package_savings: src.package_savings || 0, discount_percent: src.discount_percent || 0, addon_fees: src.addon_fees || [],
        addon_total: src.addon_total || 0, product_estimates: src.product_estimates || [], airport: src.airport || null,
        client_name: duplicateData.client_name || null, client_email: duplicateData.client_email || null, customer_phone: duplicateData.client_phone || null,
      };
      const res = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json(); alert(data.error || data.message || 'Failed to duplicate quote'); return; }
      const newQuote = await res.json();
      setQuotes(prev => [{ ...newQuote, aircraft_name: newQuote.aircraft_model ? `${newQuote.aircraft_type || ''} ${newQuote.aircraft_model}`.trim() : newQuote.aircraft_type || 'Unknown Aircraft' }, ...prev]);
      setDuplicateModal(null);
    } catch (err) { alert('Failed to duplicate quote'); }
    finally { setDuplicating(false); }
  };

  const completeJob = async () => {
    if (!completionData.actual_hours || !completeModal) return;
    setCompleting(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/jobs/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          quote_id: completeModal.id, actual_hours: parseFloat(completionData.actual_hours),
          service_hours: serviceHours.length > 0 ? serviceHours : undefined,
          products_used: selectedProducts.filter(sp => sp.product_id && sp.amount).map(sp => ({ product_id: sp.product_id, amount: parseFloat(sp.amount) || 0 })),
          product_cost: parseFloat(completionData.product_cost) || 0, notes: completionData.notes,
          wait_time_minutes: parseInt(completionData.wait_time_minutes) || 0,
          repositioning_needed: completionData.repositioning_needed, customer_late: completionData.customer_late,
          issues: completionData.issues, product_estimates: completeModal.product_estimates || [],
        }),
      });
      if (res.ok) { setQuotes(quotes.map(q => q.id === completeModal.id ? { ...q, status: 'completed' } : q)); setCompleteModal(null); }
      else { const data = await res.json(); alert(data.error || 'Failed to complete job'); }
    } catch (err) { alert('Failed to complete job'); }
    finally { setCompleting(false); }
  };

  // Filter + search
  const filteredQuotes = useMemo(() => {
    let result = quotes.filter((q) => {
      const status = getStatus(q);
      if (filter === 'all') return true;
      if (filter === 'active') return ['sent', 'viewed'].includes(status);
      if (filter === 'paid') return status === 'paid';
      if (filter === 'completed') return status === 'completed';
      if (filter === 'expired') return status === 'expired';
      return true;
    });
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(q =>
        (q.customer_company || '').toLowerCase().includes(term) ||
        (q.client_name || '').toLowerCase().includes(term) ||
        (q.aircraft_model || '').toLowerCase().includes(term) ||
        (q.aircraft_type || '').toLowerCase().includes(term) ||
        (q.tail_number || '').toLowerCase().includes(term) ||
        (q.client_email || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [quotes, filter, search]);

  // Bulk selection helpers
  const toggleSelect = (id, e) => {
    e?.stopPropagation();
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredQuotes.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredQuotes.map(q => q.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const executeBulkAction = async (action) => {
    setBulkProcessing(true);
    try {
      const token = localStorage.getItem('vector_token');
      if (action === 'export') {
        const selected = quotes.filter(q => selectedIds.has(q.id));
        const escCSV = (v) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
        const rows = selected.map(q => [
          q.created_at ? new Date(q.created_at).toISOString().split('T')[0] : '', q.customer_company || q.client_name || '', q.client_email || '',
          q.aircraft_model || q.aircraft_type || '', q.tail_number || '',
          (q.line_items || []).map(li => li.description || li.service).join('; '),
          q.total_price?.toFixed(2) || '0.00', getStatus(q),
          q.sent_at ? new Date(q.sent_at).toISOString().split('T')[0] : '', q.paid_at ? new Date(q.paid_at).toISOString().split('T')[0] : '', q.notes || '',
        ]);
        const csv = ['date,customer,email,aircraft,registration,services,amount,status,sent_date,paid_date,notes', ...rows.map(r => r.map(escCSV).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `quotes-selected-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(a.href);
        clearSelection(); setBulkConfirm(null); return;
      }
      const res = await fetch('/api/quotes/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ids: Array.from(selectedIds) }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Bulk action failed'); return; }
      if (action === 'delete') setQuotes(prev => prev.filter(q => !selectedIds.has(q.id)));
      else if (action === 'expire') setQuotes(prev => prev.map(q => selectedIds.has(q.id) ? { ...q, status: 'expired' } : q));
      else if (action === 'send') {
        setQuotes(prev => prev.map(q => selectedIds.has(q.id) && ['draft', 'sent'].includes(q.status) && q.client_email ? { ...q, status: 'sent' } : q));
        if (data.emailsSent !== undefined) alert(`Sent ${data.emailsSent} email${data.emailsSent !== 1 ? 's' : ''} (${data.updated} quotes updated)`);
      }
      clearSelection();
    } catch (err) { console.error('Bulk action error:', err); alert('Bulk action failed'); }
    finally { setBulkProcessing(false); setBulkConfirm(null); }
  };

  // Helpers
  const getDisplayName = (q) => q.customer_company || q.client_name || 'No name';
  const getAircraftLabel = (q) => q.aircraft_model || q.aircraft_type || '-';
  const getServicesLabel = (q) => {
    const items = q.line_items || [];
    if (!items.length) return '-';
    const names = items.map(i => i.description || i.service).filter(Boolean);
    if (names.length <= 2) return names.join(', ');
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  };

  const stats = {
    total: quotes.length,
    active: quotes.filter(q => ['sent', 'viewed'].includes(getStatus(q))).length,
    paid: quotes.filter(q => getStatus(q) === 'paid').length,
    completed: quotes.filter(q => getStatus(q) === 'completed').length,
    revenue: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + (q.total_price || 0), 0),
    productCost: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + getProductCost(q), 0),
  };

  if (loading) return <LoadingSpinner message="Loading..." />;

  return (
    <AppShell title="Quotes">
      <div className="page-transition min-h-screen bg-v-charcoal">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 bg-v-charcoal/95 backdrop-blur-sm border-b border-[#1A2236]">
          <div className="px-6 pt-5 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h1 className="text-[1.75rem] font-light tracking-[0.2em] uppercase text-white" style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}>Quotes</h1>
            <div className="flex items-center gap-3 flex-wrap">
              <ExportGate plan={userPlan}>
                <button
                  onClick={() => {
                    if (quotes.length === 0) return;
                    const escCSV = (v) => { const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
                    const rows = quotes.map(q => [q.created_at ? new Date(q.created_at).toISOString().split('T')[0] : '', q.customer_company || q.client_name || '', q.aircraft_model || q.aircraft_type || '', q.total_price?.toFixed(2) || '0.00', q.status || 'draft']);
                    const csv = ['date,customer,aircraft,amount,status', ...rows.map(r => r.map(escCSV).join(','))].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `quotes-export-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(a.href);
                  }}
                  disabled={quotes.length === 0}
                  className="text-[#8A9BB0] hover:text-white text-xs uppercase tracking-widest transition-colors"
                >Export</button>
              </ExportGate>
              <a href="/quotes/new" className="px-5 py-2 bg-[#C9A84C] text-[#0D1B2A] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#b8993f] transition-colors">New Quote</a>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="px-6 pb-3 flex items-center gap-6 overflow-x-auto">
            <div className="relative flex-shrink-0">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8A9BB0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotes..." className="bg-transparent border border-[#1A2236] text-white placeholder-[#8A9BB0] text-sm pl-9 pr-4 py-1.5 w-56 focus:outline-none focus:border-[#C9A84C]/40 transition-colors" />
            </div>
            <div className="flex items-center gap-5">
              {['all', 'active', 'paid', 'completed', 'expired'].map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`text-xs uppercase tracking-[0.15em] pb-2 transition-colors whitespace-nowrap ${filter === f ? 'text-[#C9A84C] border-b border-[#C9A84C]' : 'text-[#8A9BB0] hover:text-white border-b border-transparent'}`}>
                  {f === 'all' ? `All (${stats.total})` : f === 'active' ? `Active (${stats.active})` : f === 'paid' ? `Paid (${stats.paid})` : f === 'completed' ? `Done (${stats.completed})` : 'Expired'}
                </button>
              ))}
            </div>
          </div>

          {/* Gmail-style Bulk Toolbar */}
          {selectedIds.size > 0 && (
            <div className="px-6 py-2.5 bg-[#1A2236] border-t border-[#2A3A50] flex items-center gap-4">
              <span className="text-white text-sm font-medium">{selectedIds.size} selected</span>
              <button onClick={clearSelection} className="text-[#8A9BB0] hover:text-white text-xs uppercase tracking-wider transition-colors">Clear</button>
              <div className="w-px h-4 bg-[#2A3A50]" />
              <button onClick={() => setBulkConfirm({ action: 'send', label: `Send ${selectedIds.size} quote(s)?`, description: 'Quotes with a customer email in draft/sent status will be emailed.' })} disabled={bulkProcessing} className="text-[#8A9BB0] hover:text-white text-xs uppercase tracking-wider transition-colors disabled:opacity-40">Send</button>
              <button onClick={() => setBulkConfirm({ action: 'expire', label: `Expire ${selectedIds.size} quote(s)?`, description: 'This will change their status to expired.' })} disabled={bulkProcessing} className="text-[#8A9BB0] hover:text-white text-xs uppercase tracking-wider transition-colors disabled:opacity-40">Archive</button>
              <ExportGate plan={userPlan}><button onClick={() => executeBulkAction('export')} disabled={bulkProcessing} className="text-[#8A9BB0] hover:text-white text-xs uppercase tracking-wider transition-colors disabled:opacity-40">Export</button></ExportGate>
              <button onClick={() => setBulkConfirm({ action: 'delete', label: `Delete ${selectedIds.size} quote(s)?`, description: 'This cannot be undone.' })} disabled={bulkProcessing} className="text-red-400/70 hover:text-red-400 text-xs uppercase tracking-wider transition-colors disabled:opacity-40">Delete</button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="px-6 py-5 grid grid-cols-3 sm:grid-cols-6 gap-8 border-b border-[#1A2236]">
          {[
            { label: 'Total', value: stats.total, color: 'text-white' },
            { label: 'Active', value: stats.active, color: 'text-[#C9A84C]' },
            { label: 'Paid', value: stats.paid, color: 'text-green-400' },
            { label: 'Completed', value: stats.completed, color: 'text-purple-300' },
            { label: 'Revenue', value: `${currencySymbol()}${formatPriceWhole(stats.revenue)}`, color: 'text-white' },
            { label: 'Profit', value: `${currencySymbol()}${formatPriceWhole(stats.revenue - stats.productCost)}`, color: 'text-green-400' },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-[#8A9BB0] text-[10px] uppercase tracking-[0.2em]">{s.label}</p>
              <p className={`text-lg font-light mt-0.5 font-data ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[40px_1fr_1fr_1fr_120px_100px_100px] min-w-[800px] px-6 py-3 border-b border-[#1A2236] text-[10px] uppercase tracking-[0.2em] text-[#8A9BB0]">
            <div className="flex items-center justify-center">
              <input type="checkbox" checked={filteredQuotes.length > 0 && selectedIds.size === filteredQuotes.length} onChange={toggleSelectAll} className="w-3.5 h-3.5 rounded-sm border-[#2A3A50] bg-transparent accent-[#C9A84C] cursor-pointer" onClick={(e) => e.stopPropagation()} />
            </div>
            <div>Customer</div>
            <div>Aircraft</div>
            <div>Services</div>
            <div className="text-right">Total</div>
            <div className="text-center">Status</div>
            <div className="text-right">Date</div>
          </div>

          {filteredQuotes.length === 0 ? (
            <div className="px-6 py-16 text-center text-[#8A9BB0] text-sm">{search ? 'No quotes match your search' : 'No quotes yet'}</div>
          ) : (
            filteredQuotes.map((q) => {
              const status = getStatus(q);
              const isSelected = selectedIds.has(q.id);
              return (
                <div key={q.id} onClick={() => { if (q.share_link) window.open(`/q/${q.share_link}`, '_blank'); }}
                  className={`group grid grid-cols-[40px_1fr_1fr_1fr_120px_100px_100px] min-w-[800px] px-6 items-center border-b border-[#1A2236] transition-colors cursor-pointer ${isSelected ? 'bg-[#C9A84C]/[0.04]' : 'hover:bg-white/[0.02]'}`}
                  style={{ height: '56px' }}>
                  <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={(e) => toggleSelect(q.id, e)} className={`w-3.5 h-3.5 rounded-sm border-[#2A3A50] bg-transparent accent-[#C9A84C] cursor-pointer transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                  </div>
                  <div className="truncate pr-4">
                    <span className="text-white text-sm">{getDisplayName(q)}</span>
                    {q.customer_company && q.client_name && q.customer_company !== q.client_name && <span className="text-[#8A9BB0] text-xs ml-2">{q.client_name}</span>}
                  </div>
                  <div className="truncate pr-4">
                    <span className="text-[#8A9BB0] text-sm">{getAircraftLabel(q)}</span>
                    {q.tail_number && <span className="text-[#8A9BB0]/60 text-xs ml-2">{q.tail_number}</span>}
                  </div>
                  <div className="truncate pr-4">
                    <span className="text-[#8A9BB0] text-sm" title={(q.line_items || []).map(i => i.description || i.service).join(', ')}>{getServicesLabel(q)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#C9A84C] text-sm font-data">{currencySymbol()}{formatPrice(q.total_price)}</span>
                  </div>
                  <div className="flex justify-center">
                    <span className={`px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${statusColors[status] || 'border border-gray-500/30 text-gray-400'}`}>{statusLabels[status] || status}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#8A9BB0] text-xs">{formatDate(q.created_at)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 border-t border-[#1A2236] text-[#8A9BB0] text-xs">{filteredQuotes.length} of {quotes.length} quotes{search && ' (filtered)'}</div>

        {/* Complete Job Modal */}
        {completeModal && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-v-surface border border-v-border rounded-sm p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4 text-white">Complete Job</h3>
              <p className="text-[#8A9BB0] mb-4">{completeModal.aircraft_model || completeModal.aircraft_type}{completeModal.client_name && ` - ${completeModal.client_name}`}</p>
              {(completeModal.poc_name || completeModal.emergency_contact_name) && (
                <div className="mb-4 p-3 bg-[#0F1117] border border-[#1A2236] text-sm space-y-2">
                  {completeModal.poc_name && (
                    <div className="flex items-center justify-between">
                      <div><span className="font-medium text-white">{completeModal.poc_name}</span>{completeModal.poc_role && <span className="text-[#8A9BB0] ml-1">({completeModal.poc_role})</span>}</div>
                      {completeModal.poc_phone && <a href={`tel:${completeModal.poc_phone}`} className="text-[#C9A84C] hover:underline">{completeModal.poc_phone}</a>}
                    </div>
                  )}
                  {completeModal.emergency_contact_name && (
                    <div className="flex items-center justify-between pt-1 border-t border-[#1A2236]">
                      <div><span className="text-xs text-red-400 font-semibold uppercase">Emergency: </span><span className="font-medium text-white">{completeModal.emergency_contact_name}</span></div>
                      {completeModal.emergency_contact_phone && <a href={`tel:${completeModal.emergency_contact_phone}`} className="text-[#C9A84C] hover:underline">{completeModal.emergency_contact_phone}</a>}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-4">
                {serviceHours.length > 0 ? (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white">Actual Hours Per Service</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {serviceHours.map((sh, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-[#0F1117] border border-[#1A2236]">
                          <div className="flex-1 min-w-0 mr-3"><p className="text-sm font-medium text-white truncate">{sh.service_name}</p><p className="text-xs text-[#8A9BB0]">{`Quoted: ${sh.quoted_hours.toFixed(1)}h`}</p></div>
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.25" value={sh.actual_hours} onChange={(e) => { const updated = [...serviceHours]; updated[idx] = { ...updated[idx], actual_hours: parseFloat(e.target.value) || 0 }; setServiceHours(updated); const total = updated.reduce((sum, s) => sum + (parseFloat(s.actual_hours) || 0), 0); setCompletionData(prev => ({ ...prev, actual_hours: total.toString() })); }} className="w-20 bg-[#0D1B2A] border border-[#2A3A50] text-white px-2 py-1.5 text-sm text-right" />
                            <span className="text-xs text-[#8A9BB0]">h</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#1A2236]">
                      <span className="text-sm font-medium text-white">Total Hours</span>
                      <span className="text-lg font-bold text-[#C9A84C] font-data">{parseFloat(completionData.actual_hours || 0).toFixed(1)}h</span>
                    </div>
                    <p className="text-xs text-[#8A9BB0] mt-1">{`Quote estimate: ${completeModal.total_hours?.toFixed(1) || "0"} hours`}{completeModal.total_hours && parseFloat(completionData.actual_hours) !== completeModal.total_hours && <span className={parseFloat(completionData.actual_hours) > completeModal.total_hours ? ' text-red-400' : ' text-green-400'}> ({parseFloat(completionData.actual_hours) > completeModal.total_hours ? '+' : ''}{(parseFloat(completionData.actual_hours) - completeModal.total_hours).toFixed(1)}h)</span>}</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white">Actual Hours Worked</label>
                    <input type="number" step="0.25" value={completionData.actual_hours} onChange={(e) => setCompletionData({ ...completionData, actual_hours: e.target.value })} placeholder={`Estimated: ${completeModal.total_hours?.toFixed(1) || "0"}`} className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2" />
                    <p className="text-xs text-[#8A9BB0] mt-1">{`Quote estimate: ${completeModal.total_hours?.toFixed(1) || "0"} hours`}</p>
                  </div>
                )}
                {completeModal.product_estimates && completeModal.product_estimates.length > 0 && (
                  <div className="bg-[#0D1B2A] border border-[#2A3A50] p-3">
                    <p className="text-sm font-medium text-[#C9A84C] mb-1">Estimated Products (from quote)</p>
                    <div className="space-y-0.5">{completeModal.product_estimates.map((e, i) => (<div key={i} className="flex justify-between text-sm"><span className="text-[#8A9BB0]">{e.product_name}</span><span className="font-medium text-white">{e.amount}{e.unit}</span></div>))}</div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1 text-white">Products Used</label>
                  {inventoryProducts.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {selectedProducts.map((sp, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-[#0F1117] border border-[#1A2236]">
                          <select value={sp.product_id} onChange={(e) => { const updated = [...selectedProducts]; updated[idx] = { ...updated[idx], product_id: e.target.value }; setSelectedProducts(updated); }} className="flex-1 bg-[#0D1B2A] border border-[#2A3A50] text-white px-2 py-1.5 text-sm">
                            <option value="">Select product...</option>
                            {inventoryProducts.map(p => (<option key={p.id} value={p.id}>{p.name} ({p.current_quantity} {p.unit})</option>))}
                          </select>
                          <input type="number" step="0.1" value={sp.amount} onChange={(e) => { const updated = [...selectedProducts]; updated[idx] = { ...updated[idx], amount: e.target.value }; setSelectedProducts(updated); let totalCost = 0; updated.forEach(s => { const prod = inventoryProducts.find(p => p.id === s.product_id); if (prod) totalCost += (parseFloat(s.amount) || 0) * (prod.cost_per_unit || 0); }); setCompletionData(prev => ({ ...prev, product_cost: totalCost.toFixed(2) })); }} placeholder="Qty" className="w-20 bg-[#0D1B2A] border border-[#2A3A50] text-white px-2 py-1.5 text-sm text-right" />
                          <button type="button" onClick={() => setSelectedProducts(selectedProducts.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-lg">&times;</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setSelectedProducts([...selectedProducts, { product_id: '', amount: '' }])} className="text-sm text-[#C9A84C] hover:underline">Add Product</button>
                      {selectedProducts.length > 0 && completionData.product_cost && <p className="text-xs text-[#8A9BB0] mt-1">Estimated material cost: {currencySymbol()}{completionData.product_cost}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[#8A9BB0]">{currencySymbol()}</span>
                      <input type="number" step="0.01" value={completionData.product_cost} onChange={(e) => setCompletionData({ ...completionData, product_cost: e.target.value })} placeholder="0.00" className="w-32 bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2" />
                      <a href="/products" className="text-xs text-[#C9A84C] hover:underline">Add products to track inventory</a>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-white">Notes (optional)</label>
                  <textarea value={completionData.notes} onChange={(e) => setCompletionData({ ...completionData, notes: e.target.value })} placeholder="Any notes about this job..." className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2" rows={2} />
                </div>
                <div className="border-t border-[#1A2236] pt-4 mt-4">
                  <p className="text-sm font-medium text-white mb-3 flex items-center gap-2"><span>Track Hidden Costs</span><span className="text-[10px] bg-[#C9A84C]/10 text-[#C9A84C] px-2 py-0.5">+Points</span></p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="block text-sm text-[#8A9BB0] mb-1">Wait Time (min)</label><div className="flex items-center gap-2"><input type="number" value={completionData.wait_time_minutes} onChange={(e) => setCompletionData({ ...completionData, wait_time_minutes: e.target.value })} placeholder="0" className="w-20 bg-[#0D1B2A] border border-[#2A3A50] text-white px-2 py-1.5 text-sm" /><span className="text-xs text-[#8A9BB0]">mins</span></div></div>
                    <div className="flex flex-col justify-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={completionData.repositioning_needed} onChange={(e) => setCompletionData({ ...completionData, repositioning_needed: e.target.checked })} className="rounded-sm border-[#2A3A50] accent-[#C9A84C]" /><span className="text-sm text-[#8A9BB0]">Repositioning needed</span></label></div>
                    <div className="flex flex-col justify-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={completionData.customer_late} onChange={(e) => setCompletionData({ ...completionData, customer_late: e.target.checked })} className="rounded-sm border-[#2A3A50] accent-[#C9A84C]" /><span className="text-sm text-[#8A9BB0]">Customer was late</span></label></div>
                  </div>
                  <div className="mt-3"><label className="block text-sm text-[#8A9BB0] mb-1">Issues (optional)</label><textarea value={completionData.issues} onChange={(e) => setCompletionData({ ...completionData, issues: e.target.value })} placeholder="Access problems, condition notes, etc..." className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2 text-sm" rows={2} /></div>
                  <p className="text-xs text-[#8A9BB0]/60 mt-2">Tracking this data earns points and helps identify problem customers.</p>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button onClick={() => setCompleteModal(null)} className="px-4 py-2 border border-[#2A3A50] text-[#8A9BB0] hover:text-white hover:border-white/20 transition-colors">Cancel</button>
                <button onClick={completeJob} disabled={!completionData.actual_hours || completing} className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">{completing ? 'Saving...' : 'Complete Job'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Confirm Modal */}
        {bulkConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-v-surface border border-v-border rounded-sm p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold text-white mb-2">{bulkConfirm.label}</h3>
              <p className="text-sm text-[#8A9BB0] mb-6">{bulkConfirm.description}</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setBulkConfirm(null)} disabled={bulkProcessing} className="px-4 py-2 border border-[#2A3A50] text-[#8A9BB0] hover:text-white transition-colors disabled:opacity-50">Cancel</button>
                <button onClick={() => executeBulkAction(bulkConfirm.action)} disabled={bulkProcessing} className={`px-4 py-2 text-white disabled:opacity-50 ${bulkConfirm.action === 'delete' ? 'bg-red-600 hover:bg-red-700' : bulkConfirm.action === 'expire' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#C9A84C] hover:bg-[#b8993f] text-[#0D1B2A]'}`}>{bulkProcessing ? 'Processing...' : 'Confirm'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate Quote Modal */}
        {duplicateModal && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-v-surface border border-v-border rounded-sm p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-2 text-white">Duplicate Quote</h3>
              <p className="text-[#8A9BB0] mb-4">Create a copy of this quote with new customer details.</p>
              <div className="bg-[#0F1117] border border-[#1A2236] p-3 mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-white">{duplicateModal.aircraft_model || duplicateModal.aircraft_type || 'Aircraft'}</span>
                  <span className="font-bold text-[#C9A84C] font-data">{currencySymbol()}{formatPrice(duplicateModal.total_price)}</span>
                </div>
                {duplicateModal.line_items && duplicateModal.line_items.length > 0 && (
                  <div className="mt-1">{duplicateModal.line_items.slice(0, 4).map((li, i) => (<span key={i} className="text-xs text-[#8A9BB0]">{li.description || li.service}{i < Math.min(duplicateModal.line_items.length, 4) - 1 ? ', ' : ''}</span>))}{duplicateModal.line_items.length > 4 && <span className="text-xs text-[#8A9BB0]/60"> {`+${duplicateModal.line_items.length - 4} more`}</span>}</div>
                )}
              </div>
              <div className="space-y-3">
                <div><label className="block text-xs uppercase tracking-wider text-[#8A9BB0] mb-1">Client Name</label><input type="text" value={duplicateData.client_name} onChange={(e) => setDuplicateData({ ...duplicateData, client_name: e.target.value })} placeholder="Client Name" className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2 focus:border-[#C9A84C]/40 focus:outline-none" /></div>
                <div><label className="block text-xs uppercase tracking-wider text-[#8A9BB0] mb-1">Client Email</label><input type="email" value={duplicateData.client_email} onChange={(e) => setDuplicateData({ ...duplicateData, client_email: e.target.value })} placeholder="customer@email.com" className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2 focus:border-[#C9A84C]/40 focus:outline-none" /></div>
                <div><label className="block text-xs uppercase tracking-wider text-[#8A9BB0] mb-1">Phone (optional)</label><input type="tel" value={duplicateData.client_phone} onChange={(e) => setDuplicateData({ ...duplicateData, client_phone: e.target.value })} placeholder="(555) 123-4567" className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2 focus:border-[#C9A84C]/40 focus:outline-none" /></div>
                <div><label className="block text-xs uppercase tracking-wider text-[#8A9BB0] mb-1">Notes (optional)</label><textarea value={duplicateData.notes} onChange={(e) => setDuplicateData({ ...duplicateData, notes: e.target.value })} placeholder="Add notes for this quote..." className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2 resize-none focus:border-[#C9A84C]/40 focus:outline-none" rows={2} /></div>
              </div>
              <div className="flex justify-end space-x-3 mt-5">
                <button onClick={() => setDuplicateModal(null)} className="px-4 py-2 border border-[#2A3A50] text-[#8A9BB0] hover:text-white transition-colors">Cancel</button>
                <button onClick={submitDuplicate} disabled={duplicating} className="px-4 py-2 bg-[#C9A84C] text-[#0D1B2A] hover:bg-[#b8993f] disabled:opacity-50 font-medium">{duplicating ? 'Creating...' : 'Duplicate Quote'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Change Order Modal */}
        {changeOrderModal && (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-v-surface border border-v-border rounded-sm p-5 sm:p-6 w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-2 text-white">Change Order</h3>
              <p className="text-[#8A9BB0] mb-4">{changeOrderModal.aircraft_model || changeOrderModal.aircraft_type}{changeOrderModal.client_name && ` - ${changeOrderModal.client_name}`}</p>
              <div className="bg-[#0F1117] border border-[#1A2236] p-3 mb-4"><p className="text-sm text-[#8A9BB0]"><strong className="text-white">Current Quote Total:</strong> <span className="text-[#C9A84C] font-data">{currencySymbol()}{formatPrice(changeOrderModal.total_price)}</span></p></div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2"><label className="block text-sm font-medium text-white">Additional Services</label><button type="button" onClick={addChangeOrderService} className="text-[#C9A84C] hover:text-[#b8993f] text-sm font-medium">+ Add Service</button></div>
                  <div className="space-y-2">
                    {changeOrderData.services.map((svc, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input type="text" value={svc.name} onChange={(e) => updateChangeOrderService(idx, 'name', e.target.value)} placeholder="Service name" className="flex-1 bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2 text-sm" />
                        <div className="flex items-center gap-1"><span className="text-sm text-[#8A9BB0]">{currencySymbol()}</span><input type="number" value={svc.amount} onChange={(e) => updateChangeOrderService(idx, 'amount', e.target.value)} placeholder="0.00" className="w-24 bg-[#0D1B2A] border border-[#2A3A50] text-white px-2 py-2 text-sm text-right" /></div>
                        {changeOrderData.services.length > 1 && <button type="button" onClick={() => removeChangeOrderService(idx)} className="text-red-400 hover:text-red-300">&times;</button>}
                      </div>
                    ))}
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-white mb-1">Reason (optional)</label><textarea value={changeOrderData.reason} onChange={(e) => setChangeOrderData({ ...changeOrderData, reason: e.target.value })} placeholder="Reason for the change order..." className="w-full bg-[#0D1B2A] border border-[#2A3A50] text-white px-3 py-2 text-sm" rows={2} /></div>
                {changeOrderData.services.some(s => s.amount) && (
                  <div className="bg-[#0F1117] border border-[#1A2236] p-3">
                    <div className="flex justify-between text-sm"><span className="text-[#8A9BB0]">Additional Amount:</span><span className="text-[#C9A84C] font-data font-semibold">{currencySymbol()}{changeOrderData.services.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0).toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm mt-1"><span className="text-[#8A9BB0]">New Total:</span><span className="text-white font-data font-semibold">{currencySymbol()}{((changeOrderModal.total_price || 0) + changeOrderData.services.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)).toFixed(2)}</span></div>
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button onClick={() => setChangeOrderModal(null)} className="px-4 py-2 border border-[#2A3A50] text-[#8A9BB0] hover:text-white transition-colors">Cancel</button>
                <button onClick={submitChangeOrder} disabled={submittingChangeOrder} className="px-4 py-2 bg-[#C9A84C] text-[#0D1B2A] hover:bg-[#b8993f] disabled:opacity-50 font-medium">{submittingChangeOrder ? 'Sending...' : 'Send Change Order'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
