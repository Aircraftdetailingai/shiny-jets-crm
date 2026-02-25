"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useTranslation } from '@/lib/i18n';

export default function ProductsPage() {
  const router = useRouter();
  const { t } = useTranslation();
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
    currentQuantity: '',
    reorderThreshold: '',
    supplier: '',
    notes: '',
    productUrl: '',
    imageUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('inventory');
  const [pasteUrl, setPasteUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');

  const CATEGORY_LABELS = {
    compound: t('products.compound'),
    polish: t('products.polish'),
    wax: t('products.wax'),
    ceramic: t('products.ceramicCoating'),
    cleaner: t('products.cleaner'),
    degreaser: t('products.degreaser'),
    brightwork: t('products.brightwork'),
    leather: t('products.leatherCare'),
    towels: t('products.towels'),
    applicators: t('products.applicators'),
    other: t('products.other'),
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchProducts();
    fetchInsights();
  }, [router]);

  const fetchProducts = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/products', {
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
        currentQuantity: '',
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
        setScrapeError(data.error || t('products.scrapeError'));
      }
    } catch {
      setScrapeError(t('products.scrapeFailed'));
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

    const token = localStorage.getItem('vector_token');
    const payload = {
      name: formData.name,
      brand: formData.brand,
      category: formData.category,
      unit: formData.unit,
      size: formData.size,
      costPerUnit: parseFloat(formData.costPerUnit) || 0,
      currentQuantity: parseFloat(formData.currentQuantity) || 0,
      reorderThreshold: parseFloat(formData.reorderThreshold) || 0,
      supplier: formData.supplier,
      notes: formData.notes,
      productUrl: formData.productUrl,
      imageUrl: formData.imageUrl,
    };

    try {
      if (editingProduct) {
        payload.id = editingProduct.id;
        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          fetchProducts();
          handleCloseModal();
        }
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          fetchProducts();
          handleCloseModal();
        }
      }
    } catch (err) {
      console.error('Failed to save product:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustInventory = async (isAdd) => {
    if (!adjustAmount || !showAdjustModal) return;
    const token = localStorage.getItem('vector_token');
    const adjustment = isAdd ? parseFloat(adjustAmount) : -parseFloat(adjustAmount);

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

  const handleDelete = async (id) => {
    if (!confirm(t('products.deleteConfirm'))) return;

    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch(`/api/products?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchProducts();
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
    return <LoadingSpinner message={t('products.loadingProducts')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 text-gray-900">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-2xl font-bold">{t('products.title')}</h1>
        </div>
        <div className="space-x-4 text-sm">
          <a href="/equipment" className="underline">{t('nav.equipment')}</a>
          <a href="/dashboard" className="underline">{t('nav.dashboard')}</a>
          <a href="/settings" className="underline">{t('nav.settings')}</a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow">
            <p className="text-gray-500 text-xs">{t('products.inventoryValue')}</p>
            <p className="text-2xl font-bold text-gray-900">{currencySymbol()}{formatPriceWhole(totalValue)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <p className="text-gray-500 text-xs">{t('products.productsTracked')}</p>
            <p className="text-2xl font-bold text-gray-900">{products.length}</p>
          </div>
          {insights && (
            <>
              <div className="bg-white rounded-lg p-4 shadow">
                <p className="text-gray-500 text-xs">{t('products.materialCostMonth')}</p>
                <p className="text-2xl font-bold text-blue-600">{currencySymbol()}{formatPriceWhole(insights.summary.totalMaterialCost)}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow">
                <p className="text-gray-500 text-xs">{t('products.avgCostPerJob')}</p>
                <p className="text-2xl font-bold text-purple-600">{currencySymbol()}{formatPriceWhole(insights.summary.avgMaterialCostPerJob)}</p>
              </div>
            </>
          )}
        </div>

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-xl">&#9888;</span>
              <div className="flex-1">
                <p className="font-semibold text-red-800">{t('products.lowStockAlert')} ({lowStock.length})</p>
                <div className="mt-2 space-y-2">
                  {lowStock.map(p => (
                    <div key={p.id} className="flex items-center justify-between">
                      <div className="text-sm text-red-700">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-red-500 ml-1">&#8212; {p.current_quantity} {p.unit} {t('products.remaining')}</span>
                        <span className="text-red-400 text-xs ml-1">{t('products.reorderAt', { threshold: p.reorder_threshold })}</span>
                      </div>
                      {p.product_url && (
                        <a
                          href={p.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-xs bg-amber-500 text-white font-medium rounded hover:bg-amber-600 whitespace-nowrap ml-3"
                        >
                          {t('lowStock.reorder')}
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
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-gray-400 text-sm">{t('products.trackProducts')}</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
          >
            {t('products.addProduct')}
          </button>
        </div>

        {/* Products List */}
        {products.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <span className="text-4xl">&#128230;</span>
            <h3 className="text-xl font-semibold mt-4">{t('products.noProducts')}</h3>
            <p className="text-gray-500 mt-2">{t('products.addProductsDesc')}</p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
            >
              {t('products.addFirst')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(productsByCategory).map(([category, categoryProducts]) => (
              <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">{CATEGORY_LABELS[category] || category}</h3>
                  <span className="text-xs text-gray-400">{categoryProducts.length} {t('common.items')}</span>
                </div>
                <div className="divide-y">
                  {categoryProducts.map((product) => (
                    <div key={product.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {product.image_url && (
                            <img
                              src={product.image_url}
                              alt=""
                              className="w-10 h-10 rounded object-cover flex-shrink-0 bg-gray-100"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {product.brand && (
                                <span className="text-xs text-gray-400 font-medium">{product.brand}</span>
                              )}
                              <p className="font-medium text-gray-900 truncate">{product.name}</p>
                              {product.size && (
                                <span className="text-xs text-gray-400">{product.size}</span>
                              )}
                              {product.reorder_threshold > 0 && product.current_quantity <= product.reorder_threshold && (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex-shrink-0">{t('lowStock.low')}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                              <span>{t('common.quantity')}: <strong>{product.current_quantity || 0}</strong> {product.unit}</span>
                              {product.cost_per_unit > 0 && (
                                <span>${product.cost_per_unit.toFixed(2)}/{product.unit}</span>
                              )}
                              {product.supplier && (
                                <span className="text-gray-400">{product.supplier}</span>
                              )}
                              {product.product_url && (
                                <a href={product.product_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs">{t('lowStock.reorder')}</a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setShowAdjustModal(product);
                              setAdjustAmount('');
                            }}
                            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded"
                          >
                            {t('products.adjustQty')}
                          </button>
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Business Insights Card */}
        {insights && insights.costBreakdown && (
          <div className="mt-6 bg-white rounded-lg p-6 shadow">
            <h3 className="font-semibold text-gray-900 mb-4">{t('products.costBreakdown')}</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  className="bg-blue-500 h-full"
                  style={{ width: `${insights.costBreakdown.labor}%` }}
                ></div>
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${insights.costBreakdown.materials}%` }}
                ></div>
                <div
                  className="bg-gray-400 h-full"
                  style={{ width: `${insights.costBreakdown.overhead}%` }}
                ></div>
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-blue-500 rounded"></span>
                {t('products.labor')} {insights.costBreakdown.labor}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-500 rounded"></span>
                {t('products.materials')} {insights.costBreakdown.materials}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded"></span>
                {t('products.overhead')} {insights.costBreakdown.overhead}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-md overflow-hidden max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">
                {editingProduct ? t('products.editProduct') : t('products.addProductTitle')}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Paste Product Link */}
              {!editingProduct && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="block text-sm font-medium text-blue-800 mb-1">{t('equipment.pasteProductLink')}</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={pasteUrl}
                      onChange={handlePasteUrlChange}
                      placeholder={t('products.scrapePlaceholder')}
                      className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                    {pasteUrl && !scraping && (
                      <button
                        type="button"
                        onClick={() => handleScrapeUrl(pasteUrl)}
                        className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
                      >
                        {t('products.fetchProductInfo')}
                      </button>
                    )}
                  </div>
                  {scraping && (
                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                      {t('products.extracting')}
                    </p>
                  )}
                  {scrapeError && (
                    <p className="text-xs text-red-600 mt-1">{scrapeError}</p>
                  )}
                  <p className="text-[10px] text-blue-500 mt-1">{t('products.supportedSites')}</p>
                </div>
              )}

              {/* Image preview */}
              {formData.imageUrl && (
                <div className="flex items-center gap-3">
                  <img src={formData.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover bg-gray-100 border" onError={(e) => { e.target.style.display = 'none'; }} />
                  <button type="button" onClick={() => setFormData({ ...formData, imageUrl: '' })} className="text-xs text-gray-400 hover:text-red-500">{t('equipment.removeImage')}</button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.productName')} *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder={t('products.namePlaceholder')}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('equipment.brand')}</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder={t('products.brandPlaceholder')}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.size')}</label>
                  <input
                    type="text"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    placeholder={t('products.sizePlaceholder')}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.category')}</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.unit')}</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.costPerUnit')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                    placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.currentQuantity')}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.currentQuantity}
                    onChange={(e) => setFormData({ ...formData, currentQuantity: e.target.value })}
                    placeholder="0"
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.reorderThreshold')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.reorderThreshold}
                  onChange={(e) => setFormData({ ...formData, reorderThreshold: e.target.value })}
                  placeholder={t('products.reorderAlertPlaceholder')}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.supplier')}</label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder={t('products.supplierPlaceholder')}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder={t('products.optionalNotes')}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
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
                  {saving ? t('common.saving') : editingProduct ? t('common.update') : t('products.addProduct')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Quantity Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-sm overflow-hidden max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{t('products.adjustInventory')}</h2>
              <p className="text-sm text-gray-500">{showAdjustModal.name}</p>
              <p className="text-xs text-gray-400">{t('products.current')}: {showAdjustModal.current_quantity} {showAdjustModal.unit}</p>
            </div>

            <div className="p-6">
              <input
                type="number"
                step="0.1"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder={t('common.amount')}
                className="w-full border rounded-lg px-3 py-2 mb-4 focus:ring-2 focus:ring-amber-500"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAdjustInventory(false)}
                  disabled={!adjustAmount}
                  className="px-4 py-2 bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 disabled:opacity-50"
                >
                  - {t('common.remove')}
                </button>
                <button
                  onClick={() => handleAdjustInventory(true)}
                  disabled={!adjustAmount}
                  className="px-4 py-2 bg-green-100 text-green-700 font-medium rounded-lg hover:bg-green-200 disabled:opacity-50"
                >
                  + {t('common.add')}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowAdjustModal(null);
                  setAdjustAmount('');
                }}
                className="w-full mt-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
