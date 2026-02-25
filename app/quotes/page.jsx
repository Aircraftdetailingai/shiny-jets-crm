"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import ExportGate from '@/components/ExportGate';
import { useTranslation } from '@/lib/i18n';

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  approved: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  expired: 'bg-red-100 text-red-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-cyan-100 text-cyan-700',
};

export default function QuotesPage() {
  const router = useRouter();
  const { t } = useTranslation();
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
    draft: t('status.draft'),
    sent: t('status.sent'),
    viewed: t('status.viewed'),
    paid: t('status.paid'),
    approved: t('status.approved'),
    completed: t('status.completed'),
    expired: t('status.expired'),
    scheduled: t('status.scheduled'),
    in_progress: t('status.inProgress'),
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

  // Table columns
  const columns = useMemo(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={filteredQuotes.length > 0 && selectedIds.size === filteredQuotes.length}
          onChange={toggleSelectAll}
          className="w-4 h-4 rounded border-gray-300 text-amber-500 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.original.id)}
          onChange={() => toggleSelect(row.original.id)}
          className="w-4 h-4 rounded border-gray-300 text-amber-500 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
    },
    {
      id: 'customer',
      header: t('common.customer'),
      accessorKey: 'client_name',
      cell: ({ getValue, row }) => (
        <div>
          <span className="font-medium">{getValue() || 'No name'}</span>
          {row.original.client_email && (
            <span className="text-xs text-gray-500 block">{row.original.client_email}</span>
          )}
          {Array.isArray(row.original.customer_tags) && row.original.customer_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {row.original.customer_tags.slice(0, 2).map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-medium leading-tight">
                  {tag}
                </span>
              ))}
              {row.original.customer_tags.length > 2 && (
                <span className="text-[10px] text-gray-400">+{row.original.customer_tags.length - 2}</span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'aircraft',
      header: t('common.aircraft'),
      accessorFn: (row) => row.aircraft_model || row.aircraft_type || '-',
    },
    {
      id: 'registration',
      header: t('quotesExtra.registration'),
      accessorKey: 'tail_number',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'services',
      header: t('common.services'),
      accessorFn: (row) => {
        if (row.line_items && Array.isArray(row.line_items)) {
          return row.line_items.map(item => item.description || item.service).join(', ');
        }
        return '-';
      },
      cell: ({ getValue }) => (
        <span className="truncate max-w-[200px] block" title={getValue()}>
          {getValue()}
        </span>
      ),
    },
    {
      id: 'total',
      header: t('quotesExtra.quoteTotal'),
      accessorKey: 'total_price',
      cell: ({ getValue }) => (
        <span className="font-semibold">{currencySymbol()}{formatPrice(getValue())}</span>
      ),
    },
    {
      id: 'product_cost',
      header: t('dashboard.productCost'),
      accessorFn: (row) => getProductCost(row),
      cell: ({ getValue }) => {
        const cost = getValue();
        return cost > 0 ? <span className="text-red-600">{currencySymbol()}{formatPrice(cost)}</span> : <span className="text-gray-400">-</span>;
      },
    },
    {
      id: 'profit',
      header: t('quotesExtra.grossProfit'),
      accessorFn: (row) => {
        const revenue = parseFloat(row.total_price) || 0;
        const cost = getProductCost(row);
        return revenue - cost;
      },
      cell: ({ getValue, row }) => {
        const revenue = parseFloat(row.original.total_price) || 0;
        const profit = getValue();
        if (revenue === 0) return <span className="text-gray-400">-</span>;
        const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(0) : 0;
        return (
          <div>
            <span className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{currencySymbol()}{formatPrice(profit)}</span>
            <span className="text-xs text-gray-400 ml-1">({margin}%)</span>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: t('common.status'),
      accessorFn: (row) => getStatus(row),
      cell: ({ getValue }) => {
        const status = getValue();
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100'}`}>
            {statusLabels[status] || status}
          </span>
        );
      },
    },
    {
      id: 'date',
      header: t('common.date'),
      accessorKey: 'created_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'location',
      header: t('calendarExtra.hangarLocation'),
      accessorKey: 'location',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'email',
      header: t('quotes.clientEmail'),
      accessorKey: 'client_email',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'phone',
      header: t('quotes.clientPhone'),
      accessorKey: 'client_phone',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'sent_date',
      header: t('dashboard.quoteSent'),
      accessorKey: 'sent_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'viewed_date',
      header: t('dashboard.quoteViewed'),
      accessorKey: 'viewed_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'payment_date',
      header: t('reports.paidAt'),
      accessorKey: 'paid_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'hours',
      header: t('jobs.hours'),
      accessorKey: 'total_hours',
      cell: ({ getValue }) => { const v = parseFloat(getValue()); return isNaN(v) ? '-' : v.toFixed(1); },
    },
    {
      id: 'notes',
      header: t('common.notes'),
      accessorKey: 'notes',
      cell: ({ getValue }) => (
        <span className="truncate max-w-[150px] block" title={getValue()}>
          {getValue() || '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => {
        const quote = row.original;
        const status = getStatus(quote);
        return (
          <div className="flex gap-2">
            {quote.share_link && (
              <>
                <a
                  href={`/q/${quote.share_link}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:underline text-xs"
                >
                  {t('common.view')}
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(`${window.location.origin}/q/${quote.share_link}`);
                  }}
                  className="text-gray-600 hover:text-gray-900 text-xs"
                >
                  {t('quotesExtra.copyQuote')}
                </button>
              </>
            )}
            <a
              href={`/api/quotes/${quote.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-600 hover:text-gray-900 text-xs font-medium"
            >
              PDF
            </a>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openDuplicateModal(quote);
              }}
              className="text-green-600 hover:text-green-800 text-xs font-medium"
            >
              {t('quotesExtra.duplicateQuote')}
            </button>
            {status === 'paid' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openChangeOrderModal(quote);
                  }}
                  className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                >
                  {t('quotesExtra.changeOrder')}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openCompleteModal(quote);
                  }}
                  className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                >
                  {t('quotesExtra.completeJob')}
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ], [servicesMap, selectedIds, filteredQuotes, t]);

  const stats = {
    total: quotes.length,
    active: quotes.filter(q => ['sent', 'viewed'].includes(getStatus(q))).length,
    paid: quotes.filter(q => getStatus(q) === 'paid').length,
    completed: quotes.filter(q => getStatus(q) === 'completed').length,
    revenue: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + (q.total_price || 0), 0),
    productCost: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + getProductCost(q), 0),
  };

  if (loading) {
    return <LoadingSpinner message={t('common.loading')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-xl sm:text-2xl font-bold">{t('quotes.title')}</h1>
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
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded px-3 py-1 disabled:opacity-50 text-sm"
              >
                {t('reports.exportCsv')}
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
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded px-3 py-1 text-sm"
              >
                {t('quotesExtra.exportCustomers')}
              </button>
            </div>
          </ExportGate>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-medium hover:opacity-90"
          >
            {t('quickActions.newQuote')}
          </a>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">{t('common.total')}</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">{t('common.active')}</p>
          <p className="text-2xl font-bold text-amber-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">{t('status.paid')}</p>
          <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">{t('status.completed')}</p>
          <p className="text-2xl font-bold text-purple-600">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">{t('quotesExtra.revenue')}</p>
          <p className="text-2xl font-bold text-blue-600">{currencySymbol()}{formatPriceWhole(stats.revenue)}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">{t('quotesExtra.grossProfit')}</p>
          <p className="text-2xl font-bold text-green-600">{currencySymbol()}{formatPriceWhole(stats.revenue - stats.productCost)}</p>
          {stats.revenue > 0 && (
            <p className="text-xs text-gray-400">{((1 - stats.productCost / stats.revenue) * 100).toFixed(0)}{t('quotesExtra.percentMargin')}</p>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 mb-4 overflow-x-auto">
        {['all', 'active', 'paid', 'completed', 'expired'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium text-sm ${
              filter === f
                ? 'bg-amber-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {f === 'all' ? t('common.all') :
             f === 'active' ? t('common.active') :
             f === 'paid' ? t('status.paid') :
             f === 'completed' ? t('status.completed') :
             t('status.expired')}
          </button>
        ))}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-white border border-amber-300 rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900">
              {selectedIds.size} {t('quotes.selected')}
            </span>
            <button onClick={clearSelection} className="text-xs text-gray-500 hover:text-gray-700 underline">
              {t('quotesExtra.clear')}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setBulkConfirm({ action: 'send', label: `Send ${selectedIds.size} quote${selectedIds.size !== 1 ? 's' : ''}?`, description: 'Quotes with a customer email in draft/sent status will be emailed.' })}
              disabled={bulkProcessing}
              className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {t('quotesExtra.sendAll')}
            </button>
            <button
              onClick={() => setBulkConfirm({ action: 'expire', label: `Mark ${selectedIds.size} quote${selectedIds.size !== 1 ? 's' : ''} as expired?`, description: 'This will change their status to expired.' })}
              disabled={bulkProcessing}
              className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              {t('quotes.bulkExpire')}
            </button>
            <ExportGate plan={userPlan}>
              <button
                onClick={() => executeBulkAction('export')}
                disabled={bulkProcessing}
                className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                {t('reports.exportCsv')}
              </button>
            </ExportGate>
            <button
              onClick={() => setBulkConfirm({ action: 'delete', label: `Delete ${selectedIds.size} quote${selectedIds.size !== 1 ? 's' : ''} permanently?`, description: 'This cannot be undone.' })}
              disabled={bulkProcessing}
              className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {t('quotes.bulkDelete')}
            </button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        tableId="detailer"
        data={filteredQuotes}
        columns={columns}
        emptyMessage={t('common.noResults')}
      />

      {/* Complete Job Modal */}
      {completeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">{t('quotes.completeJob')}</h3>
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
                  <label className="block text-sm font-medium mb-2">{t('quotes.actualHours')} Per Service *</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {serviceHours.map((sh, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-gray-900 truncate">{sh.service_name}</p>
                          <p className="text-xs text-gray-400">{t('quotesExtra.quotedHours', { hours: sh.quoted_hours.toFixed(1) })}</p>
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
                          <span className="text-xs text-gray-500">hrs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t">
                    <span className="text-sm font-medium text-gray-700">{t('quotesExtra.totalHours')}</span>
                    <span className="text-lg font-bold text-gray-900">{parseFloat(completionData.actual_hours || 0).toFixed(1)}h</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('quotesExtra.quoteEstimate', { hours: completeModal.total_hours?.toFixed(1) || '0' })}
                    {completeModal.total_hours && parseFloat(completionData.actual_hours) !== completeModal.total_hours && (
                      <span className={parseFloat(completionData.actual_hours) > completeModal.total_hours ? ' text-red-500' : ' text-green-500'}>
                        {' '}({parseFloat(completionData.actual_hours) > completeModal.total_hours ? '+' : ''}
                        {(parseFloat(completionData.actual_hours) - completeModal.total_hours).toFixed(1)}h)
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('quotes.actualHours')} Worked *</label>
                  <input
                    type="number"
                    step="0.25"
                    value={completionData.actual_hours}
                    onChange={(e) => setCompletionData({ ...completionData, actual_hours: e.target.value })}
                    placeholder={t('quotesExtra.estimatedHours', { hours: completeModal.total_hours?.toFixed(1) || '0' })}
                    className="w-full border rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('quotesExtra.quoteEstimate', { hours: completeModal.total_hours?.toFixed(1) || '0' })}
                  </p>
                </div>
              )}

              {/* Product estimates from quote */}
              {completeModal.product_estimates && completeModal.product_estimates.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800 mb-1">{t('dashboard.estimatedProducts')} (from quote)</p>
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
                    >{t('quotesExtra.addProduct')}</button>
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
                <label className="block text-sm font-medium mb-1">{t('common.notes')} ({t('common.optional').toLowerCase()})</label>
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
                  <span>{t('quotesExtra.trackHiddenCosts')}</span>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{t('quotesExtra.bonusPoints')}</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{t('quotes.waitTime')}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={completionData.wait_time_minutes}
                        onChange={(e) => setCompletionData({ ...completionData, wait_time_minutes: e.target.value })}
                        placeholder="0"
                        className="w-20 border rounded px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-gray-500">{t('quotesExtra.mins')}</span>
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
                      <span className="text-sm text-gray-600">{t('quotes.repositioning')}</span>
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
                      <span className="text-sm text-gray-600">{t('quotes.customerLate')}</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm text-gray-600 mb-1">{t('quotes.issues')} ({t('common.optional').toLowerCase()})</label>
                  <textarea
                    value={completionData.issues}
                    onChange={(e) => setCompletionData({ ...completionData, issues: e.target.value })}
                    placeholder={t('quotesExtra.accessNotes')}
                    className="w-full border rounded px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>

                <p className="text-xs text-gray-400 mt-2">
                  {t('quotesExtra.trackingDataHelp')}
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setCompleteModal(null)}
                className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={completeJob}
                disabled={!completionData.actual_hours || completing}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {completing ? t('common.saving') : t('quotes.completeJob')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Order Modal */}
      {/* Bulk Confirm Modal */}
      {bulkConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{bulkConfirm.label}</h3>
            <p className="text-sm text-gray-600 mb-6">{bulkConfirm.description}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBulkConfirm(null)}
                disabled={bulkProcessing}
                className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
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
                {bulkProcessing ? t('common.processing') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Quote Modal */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">{t('quotes.duplicateQuote')}</h3>
            <p className="text-gray-600 mb-4">
              {t('quotesExtra.duplicateDesc')}
            </p>

            {/* Source quote summary */}
            <div className="bg-gray-50 p-3 rounded-lg mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {duplicateModal.aircraft_model || duplicateModal.aircraft_type || t('common.aircraft')}
                </span>
                <span className="font-bold text-[#1e3a5f]">{currencySymbol()}{formatPrice(duplicateModal.total_price)}</span>
              </div>
              {duplicateModal.line_items && duplicateModal.line_items.length > 0 && (
                <div className="mt-1">
                  {duplicateModal.line_items.slice(0, 4).map((li, i) => (
                    <span key={i} className="text-xs text-gray-500">
                      {li.description || li.service}{i < Math.min(duplicateModal.line_items.length, 4) - 1 ? ', ' : ''}
                    </span>
                  ))}
                  {duplicateModal.line_items.length > 4 && (
                    <span className="text-xs text-gray-400"> {t('quotesExtra.moreItems', { count: duplicateModal.line_items.length - 4 })}</span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('quotes.clientName')}</label>
                <input
                  type="text"
                  value={duplicateData.client_name}
                  onChange={(e) => setDuplicateData({ ...duplicateData, client_name: e.target.value })}
                  placeholder={t('quotes.clientName')}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('quotes.clientEmail')}</label>
                <input
                  type="email"
                  value={duplicateData.client_email}
                  onChange={(e) => setDuplicateData({ ...duplicateData, client_email: e.target.value })}
                  placeholder="customer@email.com"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.phone')} ({t('common.optional').toLowerCase()})</label>
                <input
                  type="tel"
                  value={duplicateData.client_phone}
                  onChange={(e) => setDuplicateData({ ...duplicateData, client_phone: e.target.value })}
                  placeholder="(555) 123-4567"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')} ({t('common.optional').toLowerCase()})</label>
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
                {t('common.cancel')}
              </button>
              <button
                onClick={submitDuplicate}
                disabled={duplicating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {duplicating ? t('common.creating') : t('quotes.duplicateQuote')}
              </button>
            </div>
          </div>
        </div>
      )}

      {changeOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">{t('quotes.changeOrder')}</h3>
            <p className="text-gray-600 mb-4">
              {changeOrderModal.aircraft_model || changeOrderModal.aircraft_type}
              {changeOrderModal.client_name && ` - ${changeOrderModal.client_name}`}
            </p>

            <div className="bg-gray-50 p-3 rounded mb-4">
              <p className="text-sm text-gray-600">
                <strong>{t('quotesExtra.currentQuoteTotal')}</strong> {currencySymbol()}{formatPrice(changeOrderModal.total_price)}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">{t('quotesExtra.additionalServices')}</label>
                  <button
                    type="button"
                    onClick={addChangeOrderService}
                    className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                  >
                    {t('quotes.addService')}
                  </button>
                </div>
                {changeOrderData.services.map((service, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={service.name}
                      onChange={(e) => updateChangeOrderService(idx, 'name', e.target.value)}
                      placeholder={t('quotes.serviceName')}
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
                <label className="block text-sm font-medium mb-1">{t('quotes.reason')} / Note for Customer</label>
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
                  <span>New {t('common.total')}:</span>
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
                {t('common.cancel')}
              </button>
              <button
                onClick={submitChangeOrder}
                disabled={submittingChangeOrder}
                className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
              >
                {submittingChangeOrder ? t('common.sending') : t('dashboard.sendToClient')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
