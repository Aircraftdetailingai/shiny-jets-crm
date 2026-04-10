"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';
import AppShell from '@/components/AppShell';

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'other',
    unit: 'oz',
    size: '',
    costPerUnit: '',
    currentQuantity: '1',
    reorderThreshold: '',
    supplier: '',
    notes: '',
    productUrl: '',
    imageUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState('inventory');
  const [pasteUrl, setPasteUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');

  // Location state
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState('all');
  const [showTransferModal, setShowTransferModal] = useState(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferring, setTransferring] = useState(false);

  const CATEGORY_LABELS = {
    compound: 'Compound',
    polish: 'Polish',
    wax: 'Wax',
    ceramic: 'Ceramic Coating',
    cleaner: 'Cleaner',
    degreaser: 'Degreaser',
    brightwork: 'Brightwork',
    leather: 'Leather Care',
    towels: 'Towels & Cloths',
    applicators: 'Applicators',
    other: 'Other',
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchProducts();
    fetchInsights();
    fetchLocations();
  }, [router]);

  const fetchProducts = async (locFilter) => {
    const token = localStorage.getItem('vector_token');
    const filter = locFilter !== undefined ? locFilter : locationFilter;
    try {
      const params = filter && filter !== 'all' ? `?location_id=${filter}` : '';
      const res = await fetch(`/api/products${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setUnits(data.units || []);
        setLowStock(data.lowStock || []);
        setTotalValue(data.totalValue || 0);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
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
    fetchProducts(val);
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
          item_type: 'product',
          item_id: showTransferModal.id,
          to_location_id: transferTo,
          quantity: parseInt(transferQty) || showTransferModal.current_quantity,
        }),
      });
      if (res.ok) {
        setShowTransferModal(null);
        setTransferTo('');
        setTransferQty('');
        setSuccessMsg('Transfer complete');
        setTimeout(() => setSuccessMsg(''), 3000);
        fetchProducts();
      }
    } catch (e) { console.error(e); }
    finally { setTransferring(false); }
  };

  const getLocationName = (id) => locations.find(l => l.id === id)?.name || null;

  const fetchInsights = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/inventory/insights?period=month', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    }
  };

  const handleOpenModal = (product = null) => {
    setPasteUrl('');
    setScrapeError('');
    setSaveError('');
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        brand: product.brand || '',
        category: product.category,
        unit: product.unit || 'oz',
        size: product.size || '',
        costPerUnit: product.cost_per_unit || '',
        currentQuantity: product.current_quantity || '',
        reorderThreshold: product.reorder_threshold || '',
        supplier: product.supplier || '',
        notes: product.notes || '',
        productUrl: product.product_url || '',
        imageUrl: product.image_url || '',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        brand: '',
        category: 'other',
        unit: 'oz',
        size: '',
        costPerUnit: '',
        currentQuantity: '1',
        reorderThreshold: '',
        supplier: '',
        notes: '',
        productUrl: '',
        imageUrl: '',
      });
    }
    setShowModal(true);
  };

  const handleScrapeUrl = async (url) => {
    if (!url) return;
    setScraping(true);
    setScrapeError('');
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/products/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.product;
        setFormData(prev => ({
          ...prev,
          name: p.name || prev.name,
          brand: p.brand || prev.brand,
          category: p.category || prev.category,
          costPerUnit: p.price ? String(p.price) : prev.costPerUnit,
          size: p.size || prev.size,
          supplier: p.supplier || prev.supplier,
          productUrl: url,
          imageUrl: p.image || prev.imageUrl,
        }));
      } else {
        const data = await res.json();
        setScrapeError(data.error || 'Could not extract product info');
      }
    } catch {
      setScrapeError('Failed to fetch product data');
    } finally {
      setScraping(false);
    }
  };

  const handlePasteUrlChange = (e) => {
    const val = e.target.value;
    setPasteUrl(val);
    // Auto-trigger scrape when a URL is pasted
    if (val && (val.startsWith('http://') || val.startsWith('https://'))) {
      handleScrapeUrl(val);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');

    const token = localStorage.getItem('vector_token');
    const payload = {
      name: formData.name,
      brand: formData.brand,
      category: formData.category,
      unit: formData.unit,
      size: formData.size,
      costPerUnit: parseFloat(formData.costPerUnit) || 0,
      currentQuantity: parseInt(formData.currentQuantity, 10) || 1,
      reorderThreshold: parseInt(formData.reorderThreshold, 10) || 0,
      supplier: formData.supplier,
      notes: formData.notes,
      productUrl: formData.productUrl,
      imageUrl: formData.imageUrl,
    };

    try {
      if (editingProduct) payload.id = editingProduct.id;
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch('/api/products', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setSaveError(data.error || `Server error (${res.status})`);
        return;
      }

      // Success: add product to list immediately, close modal, show toast
      if (data.product) {
        if (editingProduct) {
          setProducts(prev => prev.map(p => p.id === editingProduct.id ? data.product : p));
        } else {
          setProducts(prev => [...prev, data.product]);
        }
      }
      handleCloseModal();
      setSuccessMsg(editingProduct ? 'Product updated!' : 'Product added!');
      setTimeout(() => setSuccessMsg(''), 3000);

      // Background refresh for accurate data
      fetchProducts().catch(() => {});
    } catch (err) {
      console.error('Failed to save product:', err);
      setSaveError(err.message || 'Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustInventory = async (isAdd) => {
    if (!adjustAmount || !showAdjustModal) return;
    const token = localStorage.getItem('vector_token');
    const adjustment = isAdd ? parseInt(adjustAmount, 10) : -parseInt(adjustAmount, 10);

    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: showAdjustModal.id,
          adjustment,
        }),
      });
      if (res.ok) {
        fetchProducts();
        setShowAdjustModal(null);
        setAdjustAmount('');
      }
    } catch (err) {
      console.error('Failed to adjust inventory:', err);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete ${name || 'this product'}? This cannot be undone.`)) return;

    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch(`/api/products?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  const productsByCategory = products.reduce((acc, product) => {
    const cat = product.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {});

  if (loading) {
    return <LoadingSpinner message={'Loading...'} />;
  }

  return (
    <AppShell title="Inventory">
    <div className="page-transition p-4 text-v-text-primary">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-v-text-primary">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-v-gold">&#8592;</a>
          <h1 className="text-2xl font-bold">{'Inventory'}</h1>
        </div>
        <div className="space-x-4 text-sm">
          <a href="/equipment" className="underline">{'Equipment'}</a>
          <a href="/dashboard" className="underline">{'Dashboard'}</a>
          <a href="/settings" className="underline">{'Settings'}</a>
        </div>
      </header>

      {successMsg && (
        <div className="max-w-5xl mx-auto mb-4">
          <div className="p-3 bg-green-900/30 border border-green-600/30 rounded-sm text-green-400 text-sm">{successMsg}</div>
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-v-surface rounded-sm p-4 border border-v-border">
            <p className="text-v-text-secondary text-xs">{'Inventory Value'}</p>
            <p className="text-2xl font-bold text-v-text-primary">{currencySymbol()}{formatPriceWhole(totalValue)}</p>
          </div>
          <div className="bg-v-surface rounded-sm p-4 border border-v-border">
            <p className="text-v-text-secondary text-xs">{'Products Tracked'}</p>
            <p className="text-2xl font-bold text-v-text-primary">{products.length}</p>
          </div>
          {insights && (
            <>
              <div className="bg-v-surface rounded-sm p-4 border border-v-border">
                <p className="text-v-text-secondary text-xs">{'Material Cost (Month)'}</p>
                <p className="text-2xl font-bold text-blue-400">{currencySymbol()}{formatPriceWhole(insights.summary.totalMaterialCost)}</p>
              </div>
              <div className="bg-v-surface rounded-sm p-4 border border-v-border">
                <p className="text-v-text-secondary text-xs">{'Avg Cost/Job'}</p>
                <p className="text-2xl font-bold text-purple-400">{currencySymbol()}{formatPriceWhole(insights.summary.avgMaterialCostPerJob)}</p>
              </div>
            </>
          )}
        </div>

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-sm p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-xl">&#9888;</span>
              <div className="flex-1">
                <p className="font-semibold text-red-400">{'Low Stock Alert'} ({lowStock.length})</p>
                <div className="mt-2 space-y-2">
                  {lowStock.map(p => (
                    <div key={p.id} className="flex items-center justify-between">
                      <div className="text-sm text-red-400">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-red-400/70 ml-1">&#8212; {p.current_quantity} {'remaining'}{p.size ? ` (${p.size} containers)` : ''}</span>
                        <span className="text-red-400 text-xs ml-1">{`(reorder at ${p.reorder_threshold})`}</span>
                      </div>
                      {p.product_url && (
                        <a
                          href={p.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-xs bg-v-gold hover:bg-v-gold-dim text-white font-medium rounded whitespace-nowrap ml-3"
                        >
                          {'Reorder'}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-v-text-secondary text-sm">{'Track your products and materials'}</p>
            {locations.length > 0 && (
              <select
                value={locationFilter}
                onChange={(e) => handleLocationFilter(e.target.value)}
                className="bg-v-charcoal border border-v-border rounded px-3 py-1.5 text-sm text-v-text-primary focus:outline-none focus:ring-1 focus:ring-v-gold"
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
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-v-gold hover:bg-v-gold-dim text-white font-medium rounded-sm"
          >
            {'+ Add Product'}
          </button>
        </div>

        {/* Products List */}
        {products.length === 0 ? (
          <div className="bg-v-surface rounded-sm p-8 text-center border border-v-border">
            <span className="text-4xl">&#128230;</span>
            <h3 className="text-xl font-semibold mt-4">{'No products yet'}</h3>
            <p className="text-v-text-secondary mt-2">{'Add your detailing products to track inventory and costs'}</p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 px-4 py-2 bg-v-gold hover:bg-v-gold-dim text-white font-medium rounded-sm"
            >
              {'Add Your First Product'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(productsByCategory).map(([category, categoryProducts]) => (
              <div key={category} className="bg-v-surface rounded-sm border border-v-border overflow-hidden">
                <div className="bg-v-charcoal px-4 py-2 border-b border-v-border flex justify-between items-center">
                  <h3 className="font-semibold text-v-text-secondary">{CATEGORY_LABELS[category] || category}</h3>
                  <span className="text-xs text-v-text-secondary">{categoryProducts.length} {'items'}</span>
                </div>
                <div className="divide-y divide-v-border">
                  {categoryProducts.map((product) => {
                    const isLow = product.reorder_threshold > 0 && product.current_quantity <= product.reorder_threshold;
                    const qty = product.current_quantity || 0;
                    return (
                      <div key={product.id} className="p-4 hover:bg-white/5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt=""
                                className="w-12 h-12 rounded object-cover flex-shrink-0 bg-v-charcoal border border-v-border"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded bg-v-charcoal border border-v-border flex items-center justify-center text-v-text-secondary text-lg flex-shrink-0">
                                &#128230;
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-v-text-primary truncate">{product.name}</p>
                                {isLow && (
                                  <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-full flex-shrink-0 font-medium">Low Stock</span>
                                )}
                              </div>
                              {product.brand && (
                                <p className="text-xs text-v-text-secondary mt-0.5">{product.brand}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-v-text-secondary flex-wrap">
                                {product.size && (
                                  <span>Size: <strong className="text-v-text-primary">{product.size}</strong></span>
                                )}
                                <span>In stock: <strong className={`${isLow ? 'text-yellow-400' : 'text-v-text-primary'}`}>{qty}</strong></span>
                                {product.cost_per_unit > 0 && (
                                  <span>${product.cost_per_unit.toFixed(2)} each</span>
                                )}
                                {product.supplier && (
                                  <span>{product.supplier}</span>
                                )}
                                {product.product_url && (
                                  <a href={product.product_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Reorder</a>
                                )}
                                {getLocationName(product.location_id) && (
                                  <span className="px-2 py-0.5 bg-indigo-900/30 text-indigo-400 rounded text-[10px] font-medium">
                                    {getLocationName(product.location_id)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                            <button
                              onClick={() => {
                                setShowAdjustModal(product);
                                setAdjustAmount('');
                              }}
                              className="px-3 py-1 text-xs bg-v-charcoal text-v-text-secondary hover:text-v-text-primary rounded border border-v-border"
                            >
                              Adjust
                            </button>
                            {locations.length > 0 && (
                              <button
                                onClick={() => { setShowTransferModal(product); setTransferTo(''); setTransferQty(''); }}
                                className="px-3 py-1 text-xs text-indigo-400 hover:bg-indigo-900/20 rounded"
                              >
                                Transfer
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenModal(product)}
                              className="px-3 py-1 text-xs text-blue-400 hover:bg-blue-900/20 rounded"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(product.id, product.name)}
                              className="px-3 py-1 text-xs text-red-400 hover:bg-red-900/20 rounded"
                            >
                              Delete
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

        {/* Business Insights Card */}
        {insights && insights.costBreakdown && (
          <div className="mt-6 bg-v-surface rounded-sm p-6 border border-v-border">
            <h3 className="font-semibold text-v-text-primary mb-4">{'Cost Breakdown'}</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-4 bg-v-charcoal rounded-full overflow-hidden flex">
                <div
                  className="bg-v-gold h-full"
                  style={{ width: `${insights.costBreakdown.labor}%` }}
                ></div>
                <div
                  className="bg-v-gold-dim h-full"
                  style={{ width: `${insights.costBreakdown.materials}%` }}
                ></div>
                <div
                  className="bg-gray-400 h-full"
                  style={{ width: `${insights.costBreakdown.overhead}%` }}
                ></div>
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-v-text-secondary">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-v-gold rounded"></span>
                {'Labor'} {insights.costBreakdown.labor}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-v-gold-dim rounded"></span>
                {'Materials'} {insights.costBreakdown.materials}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded"></span>
                {'Overhead'} {insights.costBreakdown.overhead}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-v-surface rounded-t-xl sm:rounded-sm w-full sm:max-w-md overflow-hidden max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-v-border sticky top-0 bg-v-surface">
              <h2 className="text-lg font-semibold text-v-text-primary">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Paste Product Link */}
              {!editingProduct && (
                <div className="bg-v-gold/10 border border-v-gold/30 rounded-sm p-3">
                  <label className="block text-sm font-medium text-v-gold mb-1">{'Paste Product Link'}</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={pasteUrl}
                      onChange={handlePasteUrlChange}
                      placeholder={'https://www.chemicalguys.com/product...'}
                      className="flex-1 border border-v-gold/30 rounded-sm px-3 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none bg-v-surface"
                    />
                    {pasteUrl && !scraping && (
                      <button
                        type="button"
                        onClick={() => handleScrapeUrl(pasteUrl)}
                        className="px-3 py-2 bg-v-gold hover:bg-v-gold-dim text-white text-sm rounded-sm"
                      >
                        {'Fetch'}
                      </button>
                    )}
                  </div>
                  {scraping && (
                    <p className="text-xs text-v-gold mt-1 flex items-center gap-1">
                      <span className="inline-block w-3 h-3 border-2 border-v-gold border-t-transparent rounded-full animate-spin"></span>
                      {'Extracting product info...'}
                    </p>
                  )}
                  {scrapeError && (
                    <p className="text-xs text-red-400 mt-1">{scrapeError}</p>
                  )}
                  <p className="text-[10px] text-v-gold/70 mt-1">{'Supports: Detail King, Autogeek, Amazon, Chemical Guys, P&S, and more'}</p>
                </div>
              )}

              {/* Image preview */}
              {formData.imageUrl && (
                <div className="flex items-center gap-3">
                  <img src={formData.imageUrl} alt="" className="w-16 h-16 rounded-sm object-cover bg-v-charcoal border border-v-border" onError={(e) => { e.target.style.display = 'none'; }} />
                  <button type="button" onClick={() => setFormData({ ...formData, imageUrl: '' })} className="text-xs text-v-text-secondary hover:text-red-500">{'Remove image'}</button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Product Name'} *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder={'e.g., M105 Ultra-Cut Compound'}
                    className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Brand'}</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder={'e.g., Meguiar\'s'}
                    className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Container Size'}</label>
                  <input
                    type="text"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    placeholder={'e.g., 32 oz, 1 gal'}
                    className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Category'}</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                    style={{ colorScheme: 'dark' }}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat} style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>{CATEGORY_LABELS[cat] || cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Unit'}</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                    style={{ colorScheme: 'dark' }}
                  >
                    {units.map((u) => (
                      <option key={u} value={u} style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Cost per Unit ($)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Quantity in Stock'}</label>
                  <p className="text-[10px] text-v-text-secondary/70 -mt-0.5 mb-1">How many containers</p>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.currentQuantity}
                    onChange={(e) => setFormData({ ...formData, currentQuantity: e.target.value })}
                    placeholder="1"
                    className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Reorder Alert Threshold'}</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.reorderThreshold}
                  onChange={(e) => setFormData({ ...formData, reorderThreshold: e.target.value })}
                  placeholder={'Alert when quantity falls below this'}
                  className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Supplier (optional)'}</label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder={'e.g., Detail King, Amazon'}
                  className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Notes'}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder={'Optional notes'}
                  className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none resize-none"
                />
              </div>

              {saveError && (
                <div className="p-3 bg-red-900/30 border border-red-600/30 rounded-sm text-red-400 text-sm">{saveError}</div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-v-text-secondary hover:bg-white/5 rounded-sm"
                >
                  {'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name}
                  className="px-4 py-2 bg-v-gold hover:bg-v-gold-dim text-white font-medium rounded-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingProduct ? 'Update' : '+ Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Quantity Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-v-surface rounded-t-xl sm:rounded-sm w-full sm:max-w-sm overflow-hidden max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-v-border">
              <h2 className="text-lg font-semibold text-v-text-primary">{'Adjust Inventory'}</h2>
              <p className="text-sm text-v-text-secondary">{showAdjustModal.name}</p>
              <p className="text-xs text-v-text-secondary">{'Current'}: {showAdjustModal.current_quantity} {showAdjustModal.size ? `containers (${showAdjustModal.size} each)` : 'units'}</p>
            </div>

            <div className="p-6">
              <input
                type="number"
                step="1"
                min="0"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder={'Amount'}
                className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 mb-4 text-v-text-primary placeholder:text-v-text-secondary/50 focus:border-v-gold focus:ring-0 outline-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAdjustInventory(false)}
                  disabled={!adjustAmount}
                  className="px-4 py-2 bg-red-900/30 text-red-400 font-medium rounded-sm hover:bg-red-900/50 disabled:opacity-50"
                >
                  - {'Remove'}
                </button>
                <button
                  onClick={() => handleAdjustInventory(true)}
                  disabled={!adjustAmount}
                  className="px-4 py-2 bg-green-900/30 text-green-400 font-medium rounded-sm hover:bg-green-900/50 disabled:opacity-50"
                >
                  + {'Add'}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowAdjustModal(null);
                  setAdjustAmount('');
                }}
                className="w-full mt-3 px-4 py-2 text-v-text-secondary hover:bg-white/5 rounded-sm"
              >
                {'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowTransferModal(null)}>
          <div className="bg-v-surface border border-v-border rounded-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1">Transfer Product</h3>
            <p className="text-sm text-v-text-secondary mb-4">{showTransferModal.name}</p>

            <div className="space-y-4">
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

              <div>
                <label className="block text-xs text-v-text-secondary mb-1">
                  Quantity to transfer (of {showTransferModal.current_quantity} total)
                </label>
                <input
                  type="number"
                  min="1"
                  max={showTransferModal.current_quantity}
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  placeholder={String(showTransferModal.current_quantity)}
                  className="w-full bg-v-charcoal border border-v-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-v-gold"
                />
                <p className="text-[10px] text-gray-600 mt-1">Leave blank to transfer all</p>
              </div>
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
