"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function EquipmentPage() {
  const router = useRouter();
  const [equipment, setEquipment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [filter, setFilter] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    model: '',
    category: 'other',
    purchasePrice: '',
    purchaseDate: '',
    warrantyExpiry: '',
    nextMaintenance: '',
    maintenanceNotes: '',
    status: 'active',
    product_url: '',
    image_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeError, setScrapeError] = useState('');

  const CATEGORY_LABELS = {
    polisher: 'Polisher',
    extractor: 'Extractor',
    pressure_washer: 'Pressure Washer',
    vacuum: 'Vacuum',
    steamer: 'Steamer',
    lighting: 'Lighting',
    lift: 'Lift/Ladder',
    generator: 'Generator',
    compressor: 'Compressor',
    other: 'Other',
  };

  const STATUS_OPTIONS = [
    { value: 'active', label: 'Active', color: 'bg-green-900/30 text-green-400' },
    { value: 'needs_repair', label: 'Needs Repair', color: 'bg-red-900/30 text-red-400' },
    { value: 'retired', label: 'Retired', color: 'bg-v-charcoal text-v-text-secondary' },
  ];

  const STATUS_COLORS = {
    active: 'bg-green-900/30 text-green-400',
    needs_repair: 'bg-red-900/30 text-red-400',
    maintenance: 'bg-amber-900/30 text-amber-400',
    retired: 'bg-v-charcoal text-v-text-secondary',
  };

  const STATUS_LABELS = {
    active: 'Active',
    needs_repair: 'Needs Repair',
    maintenance: 'In Maintenance',
    retired: 'Retired',
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchEquipment();
  }, [router]);

  const fetchEquipment = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/equipment', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEquipment(data.equipment || []);
        setCategories(data.categories || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to fetch equipment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name || '',
        brand: item.brand || '',
        model: item.model || '',
        category: item.category || 'other',
        purchasePrice: item.purchase_price || '',
        purchaseDate: item.purchase_date || '',
        warrantyExpiry: item.warranty_expiry || '',
        nextMaintenance: item.next_maintenance || '',
        maintenanceNotes: item.maintenance_notes || '',
        status: item.status || 'active',
        product_url: item.product_url || '',
        image_url: item.image_url || '',
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        brand: '',
        model: '',
        category: 'other',
        purchasePrice: '',
        purchaseDate: '',
        warrantyExpiry: '',
        nextMaintenance: '',
        maintenanceNotes: '',
        status: 'active',
        product_url: '',
        image_url: '',
      });
    }
    setScrapeUrl('');
    setScrapeError('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setScrapeUrl('');
    setScrapeError('');
  };

  const handleScrapeUrl = async (url) => {
    if (!url) return;
    setScraping(true);
    setScrapeError('');
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/scrape-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, type: 'equipment' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract product info');
      setFormData(prev => ({
        ...prev,
        name: data.name || prev.name,
        brand: data.brand || prev.brand,
        model: data.model || prev.model,
        category: data.category || prev.category,
        purchasePrice: data.price ? String(data.price) : prev.purchasePrice,
        product_url: url,
        image_url: data.imageUrl || prev.image_url,
      }));
    } catch (err) {
      setScrapeError(err.message);
    } finally {
      setScraping(false);
    }
  };

  const handlePasteUrl = (e) => {
    const url = e.target.value;
    setScrapeUrl(url);
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      handleScrapeUrl(url);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const token = localStorage.getItem('vector_token');
    const payload = {
      name: formData.name,
      brand: formData.brand,
      model: formData.model,
      category: formData.category,
      purchasePrice: parseFloat(formData.purchasePrice) || 0,
      purchaseDate: formData.purchaseDate || null,
      warrantyExpiry: formData.warrantyExpiry || null,
      nextMaintenance: formData.nextMaintenance || null,
      maintenanceNotes: formData.maintenanceNotes,
      status: formData.status,
      product_url: formData.product_url || null,
      image_url: formData.image_url || null,
    };

    try {
      if (editingItem) {
        payload.id = editingItem.id;
        const res = await fetch('/api/equipment', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          fetchEquipment();
          handleCloseModal();
        }
      } else {
        const res = await fetch('/api/equipment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          fetchEquipment();
          handleCloseModal();
        }
      }
    } catch (err) {
      console.error('Failed to save equipment:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleIncrementJobs = async (id) => {
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/equipment', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, increment: 1 }),
      });
      if (res.ok) {
        fetchEquipment();
      }
    } catch (err) {
      console.error('Failed to increment jobs:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this equipment?')) return;

    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch(`/api/equipment?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchEquipment();
      }
    } catch (err) {
      console.error('Failed to delete equipment:', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  };

  // Filter equipment
  const filteredEquipment = equipment.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'active') return item.status === 'active';
    if (filter === 'needs_repair') return item.status === 'needs_repair';
    if (filter === 'retired') return item.status === 'retired';
    if (filter === 'maintenance_due') return item.maintenance_due || item.maintenance_overdue;
    return true;
  });

  // Group by category
  const equipmentByCategory = filteredEquipment.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Sort by best ROI
  const sortedByROI = [...equipment]
    .filter(e => e.cost_per_job !== null && e.status === 'active')
    .sort((a, b) => a.cost_per_job - b.cost_per_job);

  // Items needing attention
  const attentionItems = equipment.filter(e =>
    e.status === 'needs_repair' || e.maintenance_overdue || e.maintenance_due
  );

  if (loading) {
    return <LoadingSpinner message={'Loading equipment...'} />;
  }

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4 text-v-text-primary">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-v-gold">&#8592;</a>
          <h1 className="text-2xl font-bold">{'Equipment Tracker'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <a href="/products" className="text-sm text-white/70 hover:text-white underline">{'Inventory'}</a>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-v-gold text-white font-medium rounded-lg"
          >
            {'+ Add Equipment'}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <p className="text-v-text-secondary text-xs">{'Total Investment'}</p>
              <p className="text-2xl font-bold text-v-text-primary">{currencySymbol()}{formatPriceWhole(stats.totalInvestment)}</p>
            </div>
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <p className="text-v-text-secondary text-xs">{'Active Equipment'}</p>
              <p className="text-2xl font-bold text-green-600">{stats.activeCount || 0}</p>
            </div>
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <p className="text-v-text-secondary text-xs">{'Total Jobs Done'}</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalJobs}</p>
            </div>
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <p className="text-v-text-secondary text-xs">{'Avg Cost/Job'}</p>
              <p className="text-2xl font-bold text-purple-600">
                {stats.avgCostPerJob ? `${currencySymbol()}${formatPriceWhole(stats.avgCostPerJob)}` : '-'}
              </p>
            </div>
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <p className="text-v-text-secondary text-xs">{'Needs Attention'}</p>
              <p className={`text-2xl font-bold ${(stats.needsAttention || 0) > 0 ? 'text-red-600' : 'text-v-text-secondary'}`}>
                {stats.needsAttention || 0}
              </p>
            </div>
          </div>
        )}

        {/* Maintenance Alerts */}
        {attentionItems.length > 0 && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-red-400 mb-2">{'Needs Attention'}</h3>
            <div className="space-y-2">
              {attentionItems.map((item) => {
                const maintDays = daysUntil(item.next_maintenance);
                return (
                  <div key={item.id} className="flex items-center justify-between bg-v-surface rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] || ''}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                      <div>
                        <p className="font-medium text-v-text-primary text-sm">{item.name}</p>
                        {item.brand && <span className="text-xs text-v-text-secondary">{item.brand} {item.model || ''}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {item.maintenance_overdue && (
                        <p className="text-xs font-medium text-red-600">{'Maintenance overdue by'} {Math.abs(maintDays)} {'days'}</p>
                      )}
                      {item.maintenance_due && !item.maintenance_overdue && (
                        <p className="text-xs font-medium text-amber-600">{'Maintenance due in'} {maintDays} {'days'}</p>
                      )}
                      <button
                        onClick={() => handleOpenModal(item)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {'Update'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ROI Leaderboard */}
        {sortedByROI.length > 0 && (
          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-green-400 mb-3">{'Best ROI Equipment'}</h3>
            <div className="space-y-2">
              {sortedByROI.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between bg-v-surface rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{idx === 0 ? '\u{1F947}' : idx === 1 ? '\u{1F948}' : '\u{1F949}'}</span>
                    <div>
                      <p className="font-medium text-v-text-primary">{item.name}</p>
                      <p className="text-xs text-v-text-secondary">
                        {item.brand && `${item.brand} `}{item.model && `${item.model} - `}{item.jobs_completed} {'jobs'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">{currencySymbol()}{formatPriceWhole(item.cost_per_job)}{'/job'}</p>
                    <p className="text-xs text-v-text-secondary">{currencySymbol()}{formatPriceWhole(item.purchase_price)} {'invested'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex space-x-2 mb-4 overflow-x-auto">
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'needs_repair', label: 'Needs Repair' },
            { key: 'maintenance_due', label: 'Next Maintenance' },
            { key: 'retired', label: 'Retired' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap ${
                filter === f.key
                  ? 'bg-v-gold text-white'
                  : 'bg-v-surface text-v-text-secondary hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Equipment List */}
        {filteredEquipment.length === 0 ? (
          <div className="bg-v-surface rounded-lg p-8 text-center">
            {equipment.length === 0 ? (
              <>
                <span className="text-4xl">&#128295;</span>
                <h3 className="text-xl font-semibold mt-4">{'Loading equipment...'.replace('Loading equipment...', 'No results found')}</h3>
                <p className="text-v-text-secondary mt-2">{'Add your tools and equipment to track usage, maintenance, and ROI'}</p>
                <button
                  onClick={() => handleOpenModal()}
                  className="mt-4 px-4 py-2 bg-v-gold hover:bg-v-gold-dim text-white font-medium rounded-lg"
                >
                  {'Add Your First Equipment'}
                </button>
              </>
            ) : (
              <>
                <p className="text-v-text-secondary">{'No results found'}</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(equipmentByCategory).map(([category, items]) => (
              <div key={category} className="bg-v-surface rounded-lg shadow overflow-hidden">
                <div className="bg-v-charcoal px-4 py-2 border-b flex justify-between items-center">
                  <h3 className="font-semibold text-v-text-secondary">{CATEGORY_LABELS[category] || category}</h3>
                  <span className="text-xs text-v-text-secondary">{items.length} {'items'}</span>
                </div>
                <div className="divide-y">
                  {items.map((item) => {
                    const maintDays = daysUntil(item.next_maintenance);
                    const warrantyDays = daysUntil(item.warranty_expiry);
                    return (
                      <div key={item.id} className="p-4 hover:bg-white/5">
                        <div className="flex items-start justify-between gap-3">
                          {item.image_url && (
                            <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-v-charcoal border">
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {/* Name + Status row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.product_url ? (
                                <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-v-text-primary hover:text-v-gold underline decoration-v-border hover:decoration-v-gold">{item.name}</a>
                              ) : (
                                <p className="font-semibold text-v-text-primary">{item.name}</p>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || 'bg-v-charcoal text-v-text-secondary'}`}>
                                {STATUS_LABELS[item.status] || item.status}
                              </span>
                              {item.maintenance_overdue && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 font-medium">
                                  {'Overdue'}
                                </span>
                              )}
                              {item.maintenance_due && !item.maintenance_overdue && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 font-medium">
                                  {'Maintenance Soon'}
                                </span>
                              )}
                            </div>

                            {/* Brand / Model */}
                            {(item.brand || item.model) && (
                              <p className="text-sm text-v-text-secondary mt-0.5">
                                {item.brand}{item.brand && item.model ? ' ' : ''}{item.model}
                              </p>
                            )}

                            {/* Key stats row */}
                            <div className="flex items-center gap-4 mt-2 text-sm text-v-text-secondary flex-wrap">
                              {item.purchase_price > 0 && (
                                <span>{currencySymbol()}{formatPriceWhole(item.purchase_price)}</span>
                              )}
                              {item.purchase_date && (
                                <span>{'Bought'} {formatDate(item.purchase_date)}</span>
                              )}
                              <span className="font-medium text-blue-600">{item.jobs_completed || 0} {'jobs'}</span>
                              {item.cost_per_job && (
                                <span className="text-emerald-600 font-medium">{currencySymbol()}{formatPriceWhole(item.cost_per_job)}{'/job'}</span>
                              )}
                            </div>

                            {/* Warranty + Maintenance row */}
                            <div className="flex items-center gap-4 mt-1 text-xs flex-wrap">
                              {item.warranty_expiry && (
                                <span className={warrantyDays > 0 ? 'text-green-600' : 'text-v-text-secondary'}>
                                  {warrantyDays > 0
                                    ? `${'Warranty:'} ${warrantyDays} ${'days'} ${'left'}`
                                    : 'Warranty expired'}
                                </span>
                              )}
                              {item.next_maintenance && (
                                <span className={
                                  maintDays < 0 ? 'text-red-600 font-medium' :
                                  maintDays <= 7 ? 'text-amber-600 font-medium' :
                                  'text-v-text-secondary'
                                }>
                                  {maintDays < 0
                                    ? `${'Maintenance overdue by'} (${Math.abs(maintDays)}d)`
                                    : `${'Next Maintenance'}: ${formatDate(item.next_maintenance)}`}
                                </span>
                              )}
                            </div>

                            {/* Notes */}
                            {item.maintenance_notes && (
                              <p className="text-xs text-v-text-secondary mt-1 line-clamp-1">{item.maintenance_notes}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleIncrementJobs(item.id)}
                              className="px-2.5 py-1 text-xs bg-green-900/30 text-green-400 hover:bg-green-200 rounded font-medium"
                              title={'Log a completed job'}
                            >
                              {'+1 Job'}
                            </button>
                            <button
                              onClick={() => handleOpenModal(item)}
                              className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-900/20 rounded"
                            >
                              {'Edit'}
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-900/20 rounded"
                            >
                              {'Delete'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-v-surface rounded-t-2xl sm:rounded-lg w-full sm:max-w-lg overflow-hidden max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                {editingItem ? 'Edit Equipment' : '+ Add Equipment'}
              </h2>
              <button onClick={handleCloseModal} className="text-v-text-secondary hover:text-v-text-secondary text-xl">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Product Link Auto-fill */}
              <div className="bg-v-gold/10 border border-v-gold/30 rounded-lg p-3">
                <label className="block text-sm font-semibold text-v-gold mb-1.5">{'Paste Product Link'}</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={scrapeUrl}
                    onChange={handlePasteUrl}
                    placeholder={'https://www.amazon.com/... or any product page'}
                    className="flex-1 border border-v-gold/30 rounded-lg px-3 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none bg-v-surface"
                  />
                  {scraping && (
                    <div className="flex items-center px-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
                    </div>
                  )}
                </div>
                {scrapeError && (
                  <p className="text-xs text-red-600 mt-1">{scrapeError}</p>
                )}
                <p className="text-xs text-v-gold/80 mt-1">{'Supports Amazon, Home Depot, Grainger, Detail King, Rupes, Autogeek, Fly Shiny, Real Clean Aviation, Skygeek, Aircraft Spruce, Chief Aircraft, Nuvite & more'}</p>
              </div>

              {/* Image preview from scrape */}
              {formData.image_url && (
                <div className="flex items-center gap-3 bg-v-charcoal rounded-lg p-2">
                  <img src={formData.image_url} alt="Product" className="w-16 h-16 rounded-lg object-cover border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-v-text-secondary">{'Product image detected'}</p>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image_url: '' })}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      {'Remove image'}
                    </button>
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Equipment Name'} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder={'e.g., Rupes LHR21 Mark III'}
                  className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                />
              </div>

              {/* Brand + Model */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Brand'}</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder={'e.g., Rupes'}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Model'}</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder={'e.g., LHR21 Mark III'}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
              </div>

              {/* Category + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Category'}</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  >
                    {categories.length > 0 ? (
                      categories.map((cat) => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
                      ))
                    ) : (
                      Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Status'}</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Purchase Price + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Purchase Cost ($)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Purchase Date'}</label>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
              </div>

              {/* Warranty + Next Maintenance */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Warranty Expires'}</label>
                  <input
                    type="date"
                    value={formData.warrantyExpiry}
                    onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Next Maintenance'}</label>
                  <input
                    type="date"
                    value={formData.nextMaintenance}
                    onChange={(e) => setFormData({ ...formData, nextMaintenance: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
              </div>

              {/* Maintenance Notes */}
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Maintenance Notes'}</label>
                <textarea
                  value={formData.maintenanceNotes}
                  onChange={(e) => setFormData({ ...formData, maintenanceNotes: e.target.value })}
                  rows={2}
                  placeholder={'Maintenance schedule, repair history, parts to order...'}
                  className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-v-text-secondary hover:bg-white/5 rounded-lg"
                >
                  {'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name}
                  className="px-4 py-2 bg-v-gold hover:bg-v-gold-dim text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingItem ? 'Edit Equipment' : '+ Add Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
