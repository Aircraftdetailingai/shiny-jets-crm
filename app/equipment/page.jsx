"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';
import AppShell from '@/components/AppShell';
import { decodeHtmlEntities, shortProductName } from '@/lib/html-entities';

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
    quantity: 1,
    minQuantity: '',
  });
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeError, setScrapeError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState('');
  const [undoUse, setUndoUse] = useState(null); // { item, message } after "Log use"
  const [loggingUseId, setLoggingUseId] = useState(null);
  const undoTimerRef = useRef(null);

  // Location state
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState('all');
  const [showTransferModal, setShowTransferModal] = useState(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferring, setTransferring] = useState(false);

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
    maintenance: 'bg-v-gold-muted/30 text-v-gold',
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
    fetchLocations();
  }, [router]);

  const fetchEquipment = async (locFilter) => {
    const token = localStorage.getItem('vector_token');
    const lf = locFilter !== undefined ? locFilter : locationFilter;
    const params = lf && lf !== 'all' ? `?location_id=${lf}` : '';
    try {
      const res = await fetch(`/api/equipment${params}`, {
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

  const fetchLocations = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/locations', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setLocations(data.locations || []);
      }
    } catch (e) {}
  };

  const handleLocationFilter = (val) => {
    setLocationFilter(val);
    setLoading(true);
    fetchEquipment(val);
  };

  const handleTransfer = async () => {
    if (!showTransferModal || !transferTo) return;
    setTransferring(true);
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/locations/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          item_type: 'equipment',
          item_id: showTransferModal.id,
          to_location_id: transferTo,
        }),
      });
      if (res.ok) {
        setShowTransferModal(null);
        setTransferTo('');
        setToast('Transfer complete');
        setTimeout(() => setToast(''), 3000);
        fetchEquipment();
      }
    } catch (e) { console.error(e); }
    finally { setTransferring(false); }
  };

  const getLocationName = (id) => locations.find(l => l.id === id)?.name || null;

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: decodeHtmlEntities(item.name || ''),
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
        quantity: item.quantity || 1,
        minQuantity: item.min_quantity != null ? item.min_quantity : '',
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
        quantity: 1,
        minQuantity: '',
      });
    }
    setScrapeUrl('');
    setScrapeError('');
    setSaveError('');
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
        name: decodeHtmlEntities(data.name) || prev.name,
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
    setSaveError('');

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
      quantity: parseInt(formData.quantity) || 1,
      min_quantity: formData.minQuantity !== '' ? parseInt(formData.minQuantity) : null,
    };

    try {
      const isEdit = !!editingItem;
      if (isEdit) payload.id = editingItem.id;

      const res = await fetch('/api/equipment', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        fetchEquipment();
        handleCloseModal();
        setToast(isEdit ? 'Equipment updated' : 'Equipment added');
        setTimeout(() => setToast(''), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || `Failed to ${isEdit ? 'update' : 'add'} equipment`);
      }
    } catch (err) {
      console.error('Failed to save equipment:', err);
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // "Log use": bumps the tool's jobs-used count (equipment.jobs_completed), which
  // drives cost per job = purchase price / jobs used. Offers a short Undo.
  const handleIncrementJobs = async (item, step = 1) => {
    const token = localStorage.getItem('vector_token');
    setLoggingUseId(item.id);
    try {
      const res = await fetch('/api/equipment', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: item.id, increment: step }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const count = data?.equipment?.jobs_completed ?? Math.max(0, (item.jobs_completed || 0) + step);
        const name = shortProductName(item.name);
        clearTimeout(undoTimerRef.current);
        if (step > 0) {
          setUndoUse({ item, message: `Logged a use for ${name}. Used on ${count} ${count === 1 ? 'job' : 'jobs'}.` });
          undoTimerRef.current = setTimeout(() => setUndoUse(null), 6000);
        } else {
          setUndoUse(null);
          setToast(`Undone. ${name} is used on ${count} ${count === 1 ? 'job' : 'jobs'}.`);
          setTimeout(() => setToast(''), 3000);
        }
        fetchEquipment();
      }
    } catch (err) {
      console.error('Failed to log tool use:', err);
    } finally {
      setLoggingUseId(null);
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
    e.status === 'needs_repair' || e.maintenance_overdue || e.maintenance_due || e.low_stock
  );

  if (loading) {
    return <AppShell title="Equipment"><LoadingSpinner message={'Loading equipment...'} /></AppShell>;
  }

  return (
    <AppShell title="Equipment">
    <div className="px-4 sm:px-6 md:px-10 py-8 pb-40 max-w-[1400px] text-v-text-primary">
      {/* Success Toast */}
      <div aria-live="polite" role="status" className="fixed top-4 right-4 left-4 sm:left-auto z-[60] flex flex-col items-end gap-2 pointer-events-none">
        {toast && (
          <div className="pointer-events-auto bg-green-900/95 border border-green-500/30 text-green-200 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
            <span aria-hidden="true" className="text-green-400">&#10003;</span>
            <span className="text-sm font-medium">{toast}</span>
          </div>
        )}
        {undoUse && (
          <div className="pointer-events-auto bg-green-900/95 border border-green-500/30 text-green-200 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in max-w-md">
            <span aria-hidden="true" className="text-green-400">&#10003;</span>
            <span className="text-sm font-medium">{undoUse.message}</span>
            <button type="button" onClick={() => handleIncrementJobs(undoUse.item, -1)}
              className="ml-auto shrink-0 px-3 min-h-[36px] text-sm font-semibold text-white underline underline-offset-2 hover:text-green-100">
              Undo
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 text-white">
        <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>EQUIPMENT</h1>
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
              <p className="text-v-text-secondary text-xs" title="Total times tools were logged as used on a job">{'Tool uses logged'}</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalJobs}</p>
            </div>
            <div className="bg-v-surface rounded-lg p-4 shadow">
              <p className="text-v-text-secondary text-xs">{'Avg cost per use'}</p>
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
                        <p className="font-medium text-v-text-primary text-sm break-words" title={decodeHtmlEntities(item.name)}>{shortProductName(item.name)}</p>
                        {item.brand && <span className="text-xs text-v-text-secondary">{item.brand} {item.model || ''}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {item.maintenance_overdue && (
                        <p className="text-xs font-medium text-red-600">{'Maintenance overdue by'} {Math.abs(maintDays)} {'days'}</p>
                      )}
                      {item.maintenance_due && !item.maintenance_overdue && (
                        <p className="text-xs font-medium text-v-gold-dim">{'Maintenance due in'} {maintDays} {'days'}</p>
                      )}
                      {item.low_stock && (
                        <p className="text-xs font-medium text-yellow-500">Low stock: {item.quantity || 0} remaining (min: {item.min_quantity})</p>
                      )}
                      <button
                        onClick={() => handleOpenModal(item)}
                        className="text-xs text-sky-400 hover:underline px-1 min-h-[32px]"
                        aria-label={`Update ${decodeHtmlEntities(item.name)}`}
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
                      <p className="font-medium text-v-text-primary break-words" title={decodeHtmlEntities(item.name)}>{shortProductName(item.name)}</p>
                      <p className="text-xs text-v-text-secondary">
                        {[[item.brand, item.model].filter(Boolean).join(' '), `used on ${item.jobs_completed} ${item.jobs_completed === 1 ? 'job' : 'jobs'}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-400">{currencySymbol()}{formatPriceWhole(item.cost_per_job)}{' per job'}</p>
                    <p className="text-xs text-v-text-secondary">{currencySymbol()}{formatPriceWhole(item.purchase_price)} {'invested'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location + Filter Tabs */}
        <div className="flex items-center gap-3 mb-4 overflow-x-auto">
          {locations.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => handleLocationFilter(e.target.value)}
              className="bg-v-charcoal border border-v-border rounded-lg px-3 py-2 text-sm text-v-text-primary focus:outline-none focus:ring-1 focus:ring-v-gold flex-shrink-0"
              style={{ colorScheme: 'dark' }}
            >
              <option value="all">All Locations</option>
              <option value="unassigned">Unassigned</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </div>
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
                        {/* Info on top (full width so names wrap normally), actions in their own row on
                            phones/tablets; on wide screens the actions sit at the right. */}
                        <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {item.image_url && (
                            <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-v-charcoal border border-v-border">
                              <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {/* Name */}
                            <h4 className="font-semibold text-v-text-primary text-base leading-snug break-words">
                              {item.product_url ? (
                                <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="hover:text-v-gold underline decoration-v-border hover:decoration-v-gold" title={decodeHtmlEntities(item.name)}>
                                  {shortProductName(item.name, 120)}<span className="sr-only"> (opens product page in a new tab)</span>
                                </a>
                              ) : (
                                <span title={decodeHtmlEntities(item.name)}>{shortProductName(item.name, 120)}</span>
                              )}
                            </h4>
                            {/* Status + badges */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || 'bg-v-charcoal text-v-text-secondary'}`}>
                                {STATUS_LABELS[item.status] || item.status}
                              </span>
                              {item.maintenance_overdue && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 font-medium">
                                  {'Overdue'}
                                </span>
                              )}
                              {item.maintenance_due && !item.maintenance_overdue && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-v-gold-muted/30 text-sky-300 font-medium">
                                  {'Maintenance Soon'}
                                </span>
                              )}
                              {(item.quantity || 1) > 1 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 font-medium">
                                  Qty: {item.quantity}
                                </span>
                              )}
                              {item.low_stock && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-400 font-medium">
                                  Low Stock
                                </span>
                              )}
                              {getLocationName(item.location_id) && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/30 text-indigo-300 font-medium">
                                  {getLocationName(item.location_id)}
                                </span>
                              )}
                            </div>

                            {/* Brand / Model + price */}
                            <p className="text-sm text-v-text-secondary mt-1 break-words">
                              {[
                                [item.brand, item.model].filter(Boolean).join(' '),
                                item.purchase_price > 0 ? `${currencySymbol()}${formatPriceWhole(item.purchase_price)}` : null,
                                item.purchase_date ? `Bought ${formatDate(item.purchase_date)}` : null,
                              ].filter(Boolean).join(' · ')}
                            </p>

                            {/* Usage / cost per job */}
                            <p className="text-sm mt-1">
                              {(item.jobs_completed || 0) > 0 ? (
                                <>
                                  <span className="text-v-text-primary">Used on {item.jobs_completed} {item.jobs_completed === 1 ? 'job' : 'jobs'}</span>
                                  {item.cost_per_job != null && (
                                    <span className="text-emerald-400"> · {currencySymbol()}{formatPriceWhole(item.cost_per_job)} per job</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-v-text-secondary">Not logged on any jobs yet</span>
                              )}
                            </p>

                            {/* Warranty + Maintenance row */}
                            {(item.warranty_expiry || item.next_maintenance) && (
                            <div className="flex items-center gap-x-4 gap-y-1 mt-1 text-xs flex-wrap">
                              {item.warranty_expiry && (
                                <span className={warrantyDays > 0 ? 'text-green-400' : 'text-v-text-secondary'}>
                                  {warrantyDays > 0
                                    ? `${'Warranty:'} ${warrantyDays} ${'days'} ${'left'}`
                                    : 'Warranty expired'}
                                </span>
                              )}
                              {item.next_maintenance && (
                                <span className={
                                  maintDays < 0 ? 'text-red-400 font-medium' :
                                  maintDays <= 7 ? 'text-sky-300 font-medium' :
                                  'text-v-text-secondary'
                                }>
                                  {maintDays < 0
                                    ? `${'Maintenance overdue by'} (${Math.abs(maintDays)}d)`
                                    : `${'Next Maintenance'}: ${formatDate(item.next_maintenance)}`}
                                </span>
                              )}
                            </div>
                            )}

                            {/* Notes */}
                            {item.maintenance_notes && (
                              <p className="text-xs text-v-text-secondary mt-1 line-clamp-2 break-words">{item.maintenance_notes}</p>
                            )}
                          </div>
                        </div>

                          {/* Actions — own row on phones, right side on desktop */}
                          <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:justify-end lg:shrink-0" role="group" aria-label={`Actions for ${decodeHtmlEntities(item.name)}`}>
                            <button
                              type="button"
                              onClick={() => handleIncrementJobs(item)}
                              disabled={loggingUseId === item.id}
                              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 min-h-[40px] text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-medium disabled:opacity-60"
                              title="Record that this tool was used on a job (updates its cost per job)"
                              aria-label={`Log use: record that ${decodeHtmlEntities(item.name)} was used on a job`}
                            >
                              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                              {loggingUseId === item.id ? 'Logging…' : 'Log use'}
                            </button>
                            {locations.length > 0 && (
                              <button
                                type="button"
                                onClick={() => { setShowTransferModal(item); setTransferTo(''); }}
                                className="px-2.5 sm:px-3 min-h-[40px] text-sm text-indigo-300 border border-v-border hover:bg-indigo-900/20 rounded-lg"
                                aria-label={`Transfer ${decodeHtmlEntities(item.name)} to another location`}
                              >
                                Transfer
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenModal(item)}
                              className="px-2.5 sm:px-3 min-h-[40px] text-sm text-sky-300 border border-v-border hover:bg-blue-900/20 rounded-lg"
                              aria-label={`Edit ${decodeHtmlEntities(item.name)}`}
                            >
                              {'Edit'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="px-2.5 sm:px-3 min-h-[40px] text-sm text-red-400 border border-v-border hover:bg-red-900/20 rounded-lg"
                              aria-label={`Delete ${decodeHtmlEntities(item.name)}`}
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
              <button onClick={handleCloseModal} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center text-v-text-secondary hover:text-white text-2xl">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Save Error */}
              {saveError && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3">
                  <p className="text-red-400 text-sm">{saveError}</p>
                </div>
              )}

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
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-v-gold" />
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

              {/* Quantity + Min Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                  <p className="text-xs text-v-text-secondary mt-1">How many of this item do you have?</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">Alert When Below</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.minQuantity}
                    onChange={(e) => setFormData({ ...formData, minQuantity: e.target.value })}
                    placeholder="Optional"
                    className="w-full bg-v-surface border border-v-border rounded-lg px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                  <p className="text-xs text-v-text-secondary mt-1">Show low stock warning</p>
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

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowTransferModal(null)}>
          <div className="bg-v-surface border border-v-border rounded-xl w-full max-w-sm p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">Transfer Equipment</h3>
            <p className="text-sm text-v-text-secondary mb-4 break-words">{decodeHtmlEntities(showTransferModal.name)}</p>

            <div>
              <label className="block text-xs text-v-text-secondary mb-1">Destination Location</label>
              <select
                value={transferTo}
                onChange={e => setTransferTo(e.target.value)}
                className="w-full bg-v-charcoal border border-v-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-v-gold"
                style={{ colorScheme: 'dark' }}
              >
                <option value="">Select location...</option>
                {locations.filter(l => l.id !== showTransferModal.location_id).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTransferModal(null)} className="flex-1 px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5 text-sm">
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={transferring || !transferTo}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 text-sm font-medium disabled:opacity-50"
              >
                {transferring ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}
