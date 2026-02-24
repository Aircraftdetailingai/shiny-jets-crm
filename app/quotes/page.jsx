"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import { formatPrice, formatPriceWhole } from '@/lib/formatPrice';
import ExportGate from '@/components/ExportGate';

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

  // Table columns
  const columns = useMemo(() => [
    {
      id: 'customer',
      header: 'Customer',
      accessorKey: 'client_name',
      cell: ({ getValue, row }) => (
        <div>
          <span className="font-medium">{getValue() || 'No name'}</span>
          {row.original.client_email && (
            <span className="text-xs text-gray-500 block">{row.original.client_email}</span>
          )}
        </div>
      ),
    },
    {
      id: 'aircraft',
      header: 'Aircraft',
      accessorFn: (row) => row.aircraft_model || row.aircraft_type || '-',
    },
    {
      id: 'registration',
      header: 'Registration',
      accessorKey: 'tail_number',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'services',
      header: 'Services',
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
      header: 'Quote Total',
      accessorKey: 'total_price',
      cell: ({ getValue }) => (
        <span className="font-semibold">${formatPrice(getValue())}</span>
      ),
    },
    {
      id: 'product_cost',
      header: 'Product Cost',
      accessorFn: (row) => getProductCost(row),
      cell: ({ getValue }) => {
        const cost = getValue();
        return cost > 0 ? <span className="text-red-600">${formatPrice(cost)}</span> : <span className="text-gray-400">-</span>;
      },
    },
    {
      id: 'profit',
      header: 'Gross Profit',
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
            <span className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${formatPrice(profit)}</span>
            <span className="text-xs text-gray-400 ml-1">({margin}%)</span>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
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
      header: 'Date',
      accessorKey: 'created_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'location',
      header: 'Hangar Location',
      accessorKey: 'location',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'email',
      header: 'Customer Email',
      accessorKey: 'client_email',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'phone',
      header: 'Customer Phone',
      accessorKey: 'client_phone',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'sent_date',
      header: 'Quote Sent',
      accessorKey: 'sent_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'viewed_date',
      header: 'Quote Viewed',
      accessorKey: 'viewed_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'payment_date',
      header: 'Payment Date',
      accessorKey: 'paid_at',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      id: 'hours',
      header: 'Hours',
      accessorKey: 'total_hours',
      cell: ({ getValue }) => { const v = parseFloat(getValue()); return isNaN(v) ? '-' : v.toFixed(1); },
    },
    {
      id: 'notes',
      header: 'Notes',
      accessorKey: 'notes',
      cell: ({ getValue }) => (
        <span className="truncate max-w-[150px] block" title={getValue()}>
          {getValue() || '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
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
                  View
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(`${window.location.origin}/q/${quote.share_link}`);
                  }}
                  className="text-gray-600 hover:text-gray-900 text-xs"
                >
                  Copy
                </button>
              </>
            )}
            {status === 'paid' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openChangeOrderModal(quote);
                  }}
                  className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                >
                  +Change
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openCompleteModal(quote);
                  }}
                  className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                >
                  Complete
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ], [servicesMap]);

  const filteredQuotes = quotes.filter((q) => {
    const status = getStatus(q);
    if (filter === 'all') return true;
    if (filter === 'active') return ['sent', 'viewed'].includes(status);
    if (filter === 'paid') return status === 'paid';
    if (filter === 'completed') return status === 'completed';
    if (filter === 'expired') return status === 'expired';
    return true;
  });

  const stats = {
    total: quotes.length,
    active: quotes.filter(q => ['sent', 'viewed'].includes(getStatus(q))).length,
    paid: quotes.filter(q => getStatus(q) === 'paid').length,
    completed: quotes.filter(q => getStatus(q) === 'completed').length,
    revenue: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + (q.total_price || 0), 0),
    productCost: quotes.filter(q => ['paid', 'completed'].includes(getStatus(q))).reduce((sum, q) => sum + getProductCost(q), 0),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center">
        <div className="text-white text-xl">Loading quotes...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-xl sm:text-2xl font-bold">Quote History</h1>
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
                Export Quotes
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
                Export Customers
              </button>
            </div>
          </ExportGate>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-medium hover:opacity-90"
          >
            New Quote
          </a>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Total</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Active</p>
          <p className="text-2xl font-bold text-amber-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Paid</p>
          <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Completed</p>
          <p className="text-2xl font-bold text-purple-600">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Revenue</p>
          <p className="text-2xl font-bold text-blue-600">${formatPriceWhole(stats.revenue)}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Gross Profit</p>
          <p className="text-2xl font-bold text-green-600">${formatPriceWhole(stats.revenue - stats.productCost)}</p>
          {stats.revenue > 0 && (
            <p className="text-xs text-gray-400">{((1 - stats.productCost / stats.revenue) * 100).toFixed(0)}% margin</p>
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
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Data Table */}
      <DataTable
        tableId="detailer"
        data={filteredQuotes}
        columns={columns}
        emptyMessage="No quotes found"
      />

      {/* Complete Job Modal */}
      {completeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Complete Job</h3>
            <p className="text-gray-600 mb-4">
              {completeModal.aircraft_model || completeModal.aircraft_type}
              {completeModal.client_name && ` - ${completeModal.client_name}`}
            </p>

            <div className="space-y-4">
              {/* Per-Service Hours Breakdown */}
              {serviceHours.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium mb-2">Actual Hours Per Service *</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {serviceHours.map((sh, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-gray-900 truncate">{sh.service_name}</p>
                          <p className="text-xs text-gray-400">Quoted: {sh.quoted_hours.toFixed(1)}h</p>
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
                    <span className="text-sm font-medium text-gray-700">Total Hours</span>
                    <span className="text-lg font-bold text-gray-900">{parseFloat(completionData.actual_hours || 0).toFixed(1)}h</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Quote estimate: {completeModal.total_hours?.toFixed(1) || '0'}h
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
                  <label className="block text-sm font-medium mb-1">Actual Hours Worked *</label>
                  <input
                    type="number"
                    step="0.25"
                    value={completionData.actual_hours}
                    onChange={(e) => setCompletionData({ ...completionData, actual_hours: e.target.value })}
                    placeholder={`Estimated: ${completeModal.total_hours?.toFixed(1) || '0'}`}
                    className="w-full border rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Quote estimate: {completeModal.total_hours?.toFixed(1) || '0'} hours
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
                    >+ Add Product</button>
                    {selectedProducts.length > 0 && completionData.product_cost && (
                      <p className="text-xs text-gray-500 mt-1">Estimated material cost: ${completionData.product_cost}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">$</span>
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
                    <label className="block text-sm text-gray-600 mb-1">Wait Time</label>
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
                      <span className="text-sm text-gray-600">Customer late</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm text-gray-600 mb-1">Any issues? (optional)</label>
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
      {changeOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Create Change Order</h3>
            <p className="text-gray-600 mb-4">
              {changeOrderModal.aircraft_model || changeOrderModal.aircraft_type}
              {changeOrderModal.client_name && ` - ${changeOrderModal.client_name}`}
            </p>

            <div className="bg-gray-50 p-3 rounded mb-4">
              <p className="text-sm text-gray-600">
                <strong>Current Quote Total:</strong> ${formatPrice(changeOrderModal.total_price)}
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
                      <span className="mr-1">$</span>
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
                    ${formatPrice(changeOrderData.services
                      .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0))}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>New Total:</span>
                  <span>
                    ${formatPrice((parseFloat(changeOrderModal.total_price) || 0) +
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
                {submittingChangeOrder ? 'Sending...' : 'Send to Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
