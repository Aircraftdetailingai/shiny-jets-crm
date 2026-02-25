"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useTranslation } from '@/lib/i18n';

export default function EquipmentPage() {
  const router = useRouter();
  const { t } = useTranslation();
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
    polisher: t('equipment.polisher'),
    extractor: t('equipment.extractor'),
    pressure_washer: t('equipment.pressureWasher'),
    vacuum: t('equipment.vacuum'),
    steamer: t('equipment.steamer'),
    lighting: t('equipment.lighting'),
    lift: t('equipment.liftLadder'),
    generator: t('equipment.generator'),
    compressor: t('equipment.compressor'),
    other: t('equipment.other'),
  };

  const STATUS_OPTIONS = [
    { value: 'active', label: t('common.active'), color: 'bg-green-100 text-green-700' },
    { value: 'needs_repair', label: t('status.needsRepair'), color: 'bg-red-100 text-red-700' },
    { value: 'retired', label: t('status.retired'), color: 'bg-gray-100 text-gray-600' },
  ];

  const STATUS_COLORS = {
    active: 'bg-green-100 text-green-700',
    needs_repair: 'bg-red-100 text-red-700',
    maintenance: 'bg-amber-100 text-amber-700',
    retired: 'bg-gray-100 text-gray-600',
  };

  const STATUS_LABELS = {
    active: t('common.active'),
    needs_repair: t('status.needsRepair'),
    maintenance: t('status.inMaintenance'),
    retired: t('status.retired'),
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
    if (!confirm(t('equipment.deleteConfirm'))) return;

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
    return <LoadingSpinner message={t('equipment.loadingEquipment')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 text-gray-900">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-2xl font-bold">{t('equipment.title')}</h1>
        </div>
        <div className="flex items-center gap-3">
          <a href="/products" className="text-sm text-white/70 hover:text-white underline">{t('products.title')}</a>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-medium rounded-lg hover:opacity-90"
          >
            {t('equipment.addEquipment')}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{t('equipment.totalInvestment')}</p>
              <p className="text-2xl font-bold text-gray-900">{currencySymbol()}{formatPriceWhole(stats.totalInvestment)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{t('equipment.activeEquipment')}</p>
              <p className="text-2xl font-bold text-green-600">{stats.activeCount || 0}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{t('equipment.totalJobsDone')}</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalJobs}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{t('equipment.avgCostPerJob')}</p>
              <p className="text-2xl font-bold text-purple-600">
                {stats.avgCostPerJob ? `${currencySymbol()}${formatPriceWhole(stats.avgCostPerJob)}` : '-'}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">{t('equipment.needsAttention')}</p>
              <p className={`text-2xl font-bold ${(stats.needsAttention || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {stats.needsAttention || 0}
              </p>
            </div>
          </div>
        )}

        {/* Maintenance Alerts */}
        {attentionItems.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-red-900 mb-2">{t('equipment.needsAttention')}</h3>
            <div className="space-y-2">
              {attentionItems.map((item) => {
                const maintDays = daysUntil(item.next_maintenance);
                return (
                  <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] || ''}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                        {item.brand && <span className="text-xs text-gray-500">{item.brand} {item.model || ''}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {item.maintenance_overdue && (
                        <p className="text-xs font-medium text-red-600">{t('equipment.maintenanceOverdue')} {Math.abs(maintDays)} {t('common.days')}</p>
                      )}
                      {item.maintenance_due && !item.maintenance_overdue && (
                        <p className="text-xs font-medium text-amber-600">{t('equipment.maintenanceDueIn')} {maintDays} {t('common.days')}</p>
                      )}
                      <button
                        onClick={() => handleOpenModal(item)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {t('common.update')}
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
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-emerald-900 mb-3">{t('equipment.bestRoi')}</h3>
            <div className="space-y-2">
              {sortedByROI.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{idx === 0 ? '\u{1F947}' : idx === 1 ? '\u{1F948}' : '\u{1F949}'}</span>
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.brand && `${item.brand} `}{item.model && `${item.model} - `}{item.jobs_completed} {t('equipment.jobs')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">{currencySymbol()}{formatPriceWhole(item.cost_per_job)}{t('equipment.perJob')}</p>
                    <p className="text-xs text-gray-400">{currencySymbol()}{formatPriceWhole(item.purchase_price)} {t('growth.invested')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex space-x-2 mb-4 overflow-x-auto">
          {[
            { key: 'all', label: t('common.all') },
            { key: 'active', label: t('common.active') },
            { key: 'needs_repair', label: t('status.needsRepair') },
            { key: 'maintenance_due', label: t('equipment.nextMaintenance') },
            { key: 'retired', label: t('status.retired') },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap ${
                filter === f.key
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Equipment List */}
        {filteredEquipment.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            {equipment.length === 0 ? (
              <>
                <span className="text-4xl">&#128295;</span>
                <h3 className="text-xl font-semibold mt-4">{t('equipment.loadingEquipment').replace('Loading equipment...', t('common.noResults'))}</h3>
                <p className="text-gray-500 mt-2">{t('equipment.emptyDescription')}</p>
                <button
                  onClick={() => handleOpenModal()}
                  className="mt-4 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
                >
                  {t('equipment.addFirst')}
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500">{t('common.noResults')}</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(equipmentByCategory).map(([category, items]) => (
              <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">{CATEGORY_LABELS[category] || category}</h3>
                  <span className="text-xs text-gray-400">{items.length} {t('common.items')}</span>
                </div>
                <div className="divide-y">
                  {items.map((item) => {
                    const maintDays = daysUntil(item.next_maintenance);
                    const warrantyDays = daysUntil(item.warranty_expiry);
                    return (
                      <div key={item.id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between gap-3">
                          {item.image_url && (
                            <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 border">
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {/* Name + Status row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {item.product_url ? (
                                <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 hover:text-amber-600 underline decoration-gray-300 hover:decoration-amber-500">{item.name}</a>
                              ) : (
                                <p className="font-semibold text-gray-900">{item.name}</p>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}`}>
                                {STATUS_LABELS[item.status] || item.status}
                              </span>
                              {item.maintenance_overdue && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                  {t('equipment.overdueBadge')}
                                </span>
                              )}
                              {item.maintenance_due && !item.maintenance_overdue && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                  {t('equipment.maintenanceSoon')}
                                </span>
                              )}
                            </div>

                            {/* Brand / Model */}
                            {(item.brand || item.model) && (
                              <p className="text-sm text-gray-500 mt-0.5">
                                {item.brand}{item.brand && item.model ? ' ' : ''}{item.model}
                              </p>
                            )}

                            {/* Key stats row */}
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                              {item.purchase_price > 0 && (
                                <span>{currencySymbol()}{formatPriceWhole(item.purchase_price)}</span>
                              )}
                              {item.purchase_date && (
                                <span>{t('equipment.bought')} {formatDate(item.purchase_date)}</span>
                              )}
                              <span className="font-medium text-blue-600">{item.jobs_completed || 0} {t('equipment.jobs')}</span>
                              {item.cost_per_job && (
                                <span className="text-emerald-600 font-medium">{currencySymbol()}{formatPriceWhole(item.cost_per_job)}{t('equipment.perJob')}</span>
                              )}
                            </div>

                            {/* Warranty + Maintenance row */}
                            <div className="flex items-center gap-4 mt-1 text-xs flex-wrap">
                              {item.warranty_expiry && (
                                <span className={warrantyDays > 0 ? 'text-green-600' : 'text-gray-400'}>
                                  {warrantyDays > 0
                                    ? `${t('equipment.warrantyLeft')} ${warrantyDays} ${t('common.days')} ${t('crew.left')}`
                                    : t('equipment.warrantyExpired')}
                                </span>
                              )}
                              {item.next_maintenance && (
                                <span className={
                                  maintDays < 0 ? 'text-red-600 font-medium' :
                                  maintDays <= 7 ? 'text-amber-600 font-medium' :
                                  'text-gray-500'
                                }>
                                  {maintDays < 0
                                    ? `${t('equipment.maintenanceOverdue')} (${Math.abs(maintDays)}d)`
                                    : `${t('equipment.nextMaintenance')}: ${formatDate(item.next_maintenance)}`}
                                </span>
                              )}
                            </div>

                            {/* Notes */}
                            {item.maintenance_notes && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-1">{item.maintenance_notes}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleIncrementJobs(item.id)}
                              className="px-2.5 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 rounded font-medium"
                              title={t('equipment.logJob')}
                            >
                              {t('equipment.addOneJob')}
                            </button>
                            <button
                              onClick={() => handleOpenModal(item)}
                              className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            >
                              {t('common.delete')}
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
          <div className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-lg overflow-hidden max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                {editingItem ? t('equipment.editEquipment') : t('equipment.addEquipment')}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Product Link Auto-fill */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
                <label className="block text-sm font-semibold text-amber-800 mb-1.5">{t('equipment.pasteProductLink')}</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={scrapeUrl}
                    onChange={handlePasteUrl}
                    placeholder={t('equipment.scrapePlaceholder')}
                    className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
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
                <p className="text-xs text-amber-600 mt-1">{t('equipment.supportedSites')}</p>
              </div>

              {/* Image preview from scrape */}
              {formData.image_url && (
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                  <img src={formData.image_url} alt="Product" className="w-16 h-16 rounded-lg object-cover border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500">{t('equipment.productImageDetected')}</p>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image_url: '' })}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      {t('equipment.removeImage')}
                    </button>
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.equipmentName')} *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder={t('equipment.namePlaceholder')}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {/* Brand + Model */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.brand')}</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder={t('equipment.brandPlaceholder')}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.model')}</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder={t('equipment.modelPlaceholder')}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Category + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.category')}</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.status')}</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.purchaseCost')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.purchaseDate')}</label>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Warranty + Next Maintenance */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.warrantyExpires')}</label>
                  <input
                    type="date"
                    value={formData.warrantyExpiry}
                    onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.nextMaintenance')}</label>
                  <input
                    type="date"
                    value={formData.nextMaintenance}
                    onChange={(e) => setFormData({ ...formData, nextMaintenance: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Maintenance Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.maintenanceNotes')}</label>
                <textarea
                  value={formData.maintenanceNotes}
                  onChange={(e) => setFormData({ ...formData, maintenanceNotes: e.target.value })}
                  rows={2}
                  placeholder={t('equipment.maintenancePlaceholder')}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name}
                  className="px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving ? t('common.saving') : editingItem ? t('equipment.editEquipment') : t('equipment.addEquipment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
