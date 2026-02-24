"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole } from '@/lib/formatPrice';

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
    category: 'other',
    unit: 'oz',
    costPerUnit: '',
    currentQuantity: '',
    reorderThreshold: '',
    supplier: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('inventory');

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
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        category: product.category,
        unit: product.unit || 'oz',
        costPerUnit: product.cost_per_unit || '',
        currentQuantity: product.current_quantity || '',
        reorderThreshold: product.reorder_threshold || '',
        supplier: product.supplier || '',
        notes: product.notes || '',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        category: 'other',
        unit: 'oz',
        costPerUnit: '',
        currentQuantity: '',
        reorderThreshold: '',
        supplier: '',
        notes: '',
      });
    }
    setShowModal(true);
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
      category: formData.category,
      unit: formData.unit,
      costPerUnit: parseFloat(formData.costPerUnit) || 0,
      currentQuantity: parseFloat(formData.currentQuantity) || 0,
      reorderThreshold: parseFloat(formData.reorderThreshold) || 0,
      supplier: formData.supplier,
      notes: formData.notes,
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
    if (!confirm('Are you sure you want to delete this product?')) return;

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
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 text-gray-900">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-2xl font-bold">Inventory</h1>
        </div>
        <div className="space-x-4 text-sm">
          <a href="/equipment" className="underline">Equipment</a>
          <a href="/dashboard" className="underline">Dashboard</a>
          <a href="/settings" className="underline">Settings</a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow">
            <p className="text-gray-500 text-xs">Inventory Value</p>
            <p className="text-2xl font-bold text-gray-900">${formatPriceWhole(totalValue)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow">
            <p className="text-gray-500 text-xs">Products Tracked</p>
            <p className="text-2xl font-bold text-gray-900">{products.length}</p>
          </div>
          {insights && (
            <>
              <div className="bg-white rounded-lg p-4 shadow">
                <p className="text-gray-500 text-xs">Material Cost (Month)</p>
                <p className="text-2xl font-bold text-blue-600">${formatPriceWhole(insights.summary.totalMaterialCost)}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow">
                <p className="text-gray-500 text-xs">Avg Cost/Job</p>
                <p className="text-2xl font-bold text-purple-600">${formatPriceWhole(insights.summary.avgMaterialCostPerJob)}</p>
              </div>
            </>
          )}
        </div>

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-xl">&#9888;</span>
              <div>
                <p className="font-semibold text-red-800">Low Stock Alert</p>
                <ul className="text-sm text-red-700 mt-1">
                  {lowStock.map(p => (
                    <li key={p.id}>{p.name}: {p.current_quantity} {p.unit} remaining</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-gray-400 text-sm">Track your products and materials</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
          >
            + Add Product
          </button>
        </div>

        {/* Products List */}
        {products.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <span className="text-4xl">&#128230;</span>
            <h3 className="text-xl font-semibold mt-4">No products yet</h3>
            <p className="text-gray-500 mt-2">Add your detailing products to track inventory and costs</p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
            >
              Add Your First Product
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(productsByCategory).map(([category, categoryProducts]) => (
              <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">{CATEGORY_LABELS[category] || category}</h3>
                  <span className="text-xs text-gray-400">{categoryProducts.length} items</span>
                </div>
                <div className="divide-y">
                  {categoryProducts.map((product) => (
                    <div key={product.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{product.name}</p>
                            {product.reorder_threshold > 0 && product.current_quantity <= product.reorder_threshold && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Low Stock</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <span>Qty: <strong>{product.current_quantity || 0}</strong> {product.unit}</span>
                            {product.cost_per_unit > 0 && (
                              <span>${product.cost_per_unit.toFixed(2)}/{product.unit}</span>
                            )}
                            {product.supplier && (
                              <span className="text-gray-400">{product.supplier}</span>
                            )}
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
                            Adjust Qty
                          </button>
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                          >
                            Delete
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
            <h3 className="font-semibold text-gray-900 mb-4">Cost Breakdown</h3>
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
                Labor {insights.costBreakdown.labor}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-500 rounded"></span>
                Materials {insights.costBreakdown.materials}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded"></span>
                Overhead {insights.costBreakdown.overhead}%
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
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Meguiar's M105"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Unit ($)</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Quantity</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Alert Threshold</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.reorderThreshold}
                  onChange={(e) => setFormData({ ...formData, reorderThreshold: e.target.value })}
                  placeholder="Alert when quantity falls below this"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (optional)</label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="e.g., Detail King, Amazon"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name}
                  className="px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingProduct ? 'Update' : 'Add Product'}
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
              <h2 className="text-lg font-semibold">Adjust Inventory</h2>
              <p className="text-sm text-gray-500">{showAdjustModal.name}</p>
              <p className="text-xs text-gray-400">Current: {showAdjustModal.current_quantity} {showAdjustModal.unit}</p>
            </div>

            <div className="p-6">
              <input
                type="number"
                step="0.1"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="Amount"
                className="w-full border rounded-lg px-3 py-2 mb-4 focus:ring-2 focus:ring-amber-500"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAdjustInventory(false)}
                  disabled={!adjustAmount}
                  className="px-4 py-2 bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 disabled:opacity-50"
                >
                  - Remove
                </button>
                <button
                  onClick={() => handleAdjustInventory(true)}
                  disabled={!adjustAmount}
                  className="px-4 py-2 bg-green-100 text-green-700 font-medium rounded-lg hover:bg-green-200 disabled:opacity-50"
                >
                  + Add
                </button>
              </div>

              <button
                onClick={() => {
                  setShowAdjustModal(null);
                  setAdjustAmount('');
                }}
                className="w-full mt-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
