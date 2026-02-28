"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';

export default function VendorDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const token = localStorage.getItem('vendor_token');
    if (!token) {
      router.push('/vendor/login');
      return;
    }
    fetchDashboard();
  }, [router]);

  const fetchDashboard = async () => {
    const token = localStorage.getItem('vendor_token');
    try {
      const res = await fetch('/api/vendor/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else if (res.status === 401) {
        localStorage.removeItem('vendor_token');
        router.push('/vendor/login');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vendor_token');
    localStorage.removeItem('vendor_user');
    router.push('/vendor/login');
  };

  if (loading) {
    return <LoadingSpinner message={'Loading dashboard...'} />;
  }

  if (!data) {
    return (
      <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{'Failed to load report'}</h2>
          <p className="text-gray-500 text-sm mb-4">Please check your connection and try again.</p>
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600">
            {'Retry'}
          </button>
        </div>
      </div>
    );
  }

  const { vendor, stats, topProducts, recentOrders, tierBenefits } = data;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#0f172a] text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">&#9992;</span>
            <div>
              <h1 className="font-bold text-xl">{'Vector'} Vendor Portal</h1>
              <p className="text-blue-200 text-sm">{vendor.company_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-2 py-1 rounded text-xs ${
              vendor.commission_tier === 'partner' ? 'bg-purple-500' :
              vendor.commission_tier === 'pro' ? 'bg-amber-500' : 'bg-gray-500'
            }`}>
              {tierBenefits.name} Tier
            </span>
            <button onClick={handleLogout} className="text-sm text-blue-200 hover:text-white">
              {'Logout'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'products', label: 'Products' },
              { key: 'orders', label: 'Orders' },
              { key: 'analytics', label: 'Analytics' },
              { key: 'settings', label: 'Settings' },
            ].map((tabItem) => (
              <button
                key={tabItem.key}
                onClick={() => setActiveTab(tabItem.key)}
                className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${
                  activeTab === tabItem.key
                    ? 'bg-white text-gray-900 rounded-t-lg'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Sales"
                value={`${currencySymbol()}${formatPriceWhole(stats.totalSales)}`}
                sub="All time"
              />
              <StatCard
                label="Your Earnings"
                value={`${currencySymbol()}${formatPriceWhole(stats.vendorEarnings)}`}
                sub={`${100 - stats.commissionRate}% of sales`}
                highlight
              />
              <StatCard
                label="Available Balance"
                value={`${currencySymbol()}${formatPriceWhole(stats.currentBalance)}`}
                sub="Ready for payout"
              />
              <StatCard
                label={'Products'}
                value={stats.activeProducts}
                sub={`${stats.pendingProducts} ${'Pending'.toLowerCase()} approval`}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Products */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-4">Top {'Products'}</h3>
                {topProducts.length === 0 ? (
                  <p className="text-gray-500 text-sm">No products yet</p>
                ) : (
                  <div className="space-y-3">
                    {topProducts.map((p) => (
                      <div key={p.id} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.sales || 0} sales</p>
                        </div>
                        <p className="text-green-600 font-medium">{currencySymbol()}{formatPriceWhole(p.price * (p.sales || 0))}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Orders */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-4">Recent Orders</h3>
                {recentOrders.length === 0 ? (
                  <p className="text-gray-500 text-sm">No orders yet</p>
                ) : (
                  <div className="space-y-3">
                    {recentOrders.slice(0, 5).map((o) => (
                      <div key={o.id} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-sm">Order #{o.id.slice(0, 8)}</p>
                          <p className="text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${
                          o.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          o.status === 'shipped' ? 'bg-blue-100 text-blue-800' :
                          o.status === 'delivered' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {o.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tier Benefits */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{tierBenefits.name} Tier Benefits</h3>
                  <p className="text-amber-100 text-sm">{tierBenefits.commission}% commission to {'Vector'}</p>
                </div>
                {vendor.commission_tier !== 'partner' && (
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="px-4 py-2 bg-white text-amber-600 rounded font-medium text-sm hover:bg-amber-50"
                  >
                    {'Upgrade'} Tier
                  </button>
                )}
              </div>
              <ul className="mt-4 space-y-1">
                {tierBenefits.benefits.map((b, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <span>&#10003;</span> {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'products' && <VendorProducts />}
        {activeTab === 'orders' && <VendorOrders />}
        {activeTab === 'analytics' && <VendorAnalytics stats={stats} />}
        {activeTab === 'settings' && <VendorSettings vendor={vendor} onUpdate={fetchDashboard} />}
      </main>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-green-50 border border-green-200' : 'bg-white shadow'}`}>
      <p className="text-gray-500 text-sm">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-green-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function VendorProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'accessories',
    price: '',
    sku: '',
    inventory_count: '',
    unlimited_inventory: false,
    shipping_type: 'vendor',
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const token = localStorage.getItem('vendor_token');
    try {
      const res = await fetch('/api/vendor/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem('vendor_token');

    try {
      const url = editingProduct ? '/api/vendor/products' : '/api/vendor/products';
      const method = editingProduct ? 'PUT' : 'POST';
      const body = editingProduct ? { id: editingProduct.id, ...form } : form;

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        fetchProducts();
        setShowModal(false);
        setEditingProduct(null);
        setForm({
          name: '',
          description: '',
          category: 'accessories',
          price: '',
          sku: '',
          inventory_count: '',
          unlimited_inventory: false,
          shipping_type: 'vendor',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    const token = localStorage.getItem('vendor_token');
    try {
      await fetch(`/api/vendor/products?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchProducts();
    } catch (err) {
      console.error(err);
    }
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      category: product.category,
      price: product.price,
      sku: product.sku || '',
      inventory_count: product.inventory_count || '',
      unlimited_inventory: product.unlimited_inventory,
      shipping_type: product.shipping_type,
    });
    setShowModal(true);
  };

  if (loading) return <div className="text-gray-500">{'Loading...'}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">{'Products'}</h2>
        <button
          onClick={() => {
            setEditingProduct(null);
            setForm({ name: '', description: '', category: 'accessories', price: '', sku: '', inventory_count: '', unlimited_inventory: false, shipping_type: 'vendor' });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium"
        >
          {'+ Add Product'}
        </button>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-gray-500">{'No products yet'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Product</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{'Category'}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{'Price'}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">{'Status'}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Sales</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.sku || 'No SKU'}</p>
                  </td>
                  <td className="px-4 py-3 text-sm capitalize">{p.category}</td>
                  <td className="px-4 py-3 font-medium">${p.price}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      p.status === 'active' ? 'bg-green-100 text-green-800' :
                      p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{p.sales || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(p)} className="text-blue-600 text-sm mr-3">{'Edit'}</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-600 text-sm">{'Delete'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{'Name'} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{'Description'}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{'Category'}</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{'Price'} *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">SKU</label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{'Inventory'}</label>
                  <input
                    type="number"
                    value={form.inventory_count}
                    onChange={(e) => setForm({ ...form, inventory_count: e.target.value })}
                    disabled={form.unlimited_inventory}
                    className="w-full border rounded px-3 py-2 disabled:bg-gray-100"
                  />
                </div>
              </div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={form.unlimited_inventory}
                  onChange={(e) => setForm({ ...form, unlimited_inventory: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm">Unlimited inventory (dropship)</span>
              </label>
              <div>
                <label className="block text-sm font-medium mb-1">Shipping</label>
                <select
                  value={form.shipping_type}
                  onChange={(e) => setForm({ ...form, shipping_type: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="vendor">I ship orders myself</option>
                  <option value="vector">Vector handles shipping</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded">{'Cancel'}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50">
                  {saving ? 'Saving...' : editingProduct ? 'Save' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchOrders();
  }, [filter]);

  const fetchOrders = async () => {
    const token = localStorage.getItem('vendor_token');
    try {
      const res = await fetch(`/api/vendor/orders?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    const token = localStorage.getItem('vendor_token');
    try {
      await fetch('/api/vendor/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, status }),
      });
      fetchOrders();
    } catch (err) {
      console.error(err);
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

  const columns = useMemo(() => [
    {
      id: 'product',
      header: 'Product',
      accessorFn: (row) => row.vendor_products?.name || 'Unknown',
      cell: ({ getValue, row }) => (
        <div>
          <span className="font-medium">{getValue()}</span>
          {row.original.vendor_products?.sku && (
            <span className="text-xs text-gray-500 block">SKU: {row.original.vendor_products.sku}</span>
          )}
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      accessorFn: (row) => row.detailers?.company_name || row.customer_name || '-',
      cell: ({ getValue, row }) => (
        <div>
          <span>{getValue()}</span>
          {row.original.detailers?.email && (
            <span className="text-xs text-gray-500 block">{row.original.detailers.email}</span>
          )}
        </div>
      ),
    },
    {
      id: 'quantity',
      header: 'Quantity',
      accessorKey: 'quantity',
    },
    {
      id: 'total',
      header: 'Total',
      accessorKey: 'total',
      cell: ({ getValue }) => <span className="font-semibold">{currencySymbol()}{formatPrice(getValue())}</span>,
    },
    {
      id: 'commission',
      header: 'Commission',
      accessorKey: 'commission',
      cell: ({ getValue }) => <span className="text-red-600">-{currencySymbol()}{formatPrice(getValue())}</span>,
    },
    {
      id: 'vendor_amount',
      header: 'Your Earnings',
      accessorKey: 'vendor_amount',
      cell: ({ getValue }) => <span className="text-green-600 font-medium">{currencySymbol()}{formatPrice(getValue())}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ getValue }) => {
        const status = getValue();
        const colors = {
          pending: 'bg-yellow-100 text-yellow-800',
          shipped: 'bg-blue-100 text-blue-800',
          delivered: 'bg-green-100 text-green-800',
        };
        return (
          <span className={`px-2 py-1 rounded text-xs capitalize ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
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
      id: 'shipping',
      header: 'Ship To',
      accessorFn: (row) => {
        if (row.shipping_address) {
          if (typeof row.shipping_address === 'object') {
            return `${row.shipping_address.city || ''}, ${row.shipping_address.state || ''}`;
          }
          return row.shipping_address;
        }
        return '-';
      },
    },
    {
      id: 'tracking',
      header: 'Tracking',
      accessorKey: 'tracking_number',
      cell: ({ getValue }) => getValue() || '-',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div className="flex gap-2">
            {order.status === 'pending' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus(order.id, 'shipped');
                }}
                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
              >
                Ship
              </button>
            )}
            {order.status === 'shipped' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus(order.id, 'delivered');
                }}
                className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
              >
                Delivered
              </button>
            )}
          </div>
        );
      },
    },
  ], []);

  if (loading) return <div className="text-gray-500">{'Loading...'}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Orders</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="all">{'All'} Orders</option>
          <option value="pending">{'Pending'}</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
        </select>
      </div>

      <DataTable
        tableId="vendor"
        data={orders}
        columns={columns}
        emptyMessage="No orders yet"
      />
    </div>
  );
}

function VendorAnalytics({ stats }) {

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{'Analytics'}</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Total Views</p>
          <p className="text-2xl font-bold">{stats.totalViews.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Total Clicks</p>
          <p className="text-2xl font-bold">{stats.totalClicks.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">{'Conversion Rate'}</p>
          <p className="text-2xl font-bold">{stats.conversionRate}%</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <p className="text-gray-500 text-sm">Total Orders</p>
          <p className="text-2xl font-bold">{stats.totalOrders}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="font-semibold mb-4">Revenue Breakdown</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Sales</span>
            <span className="font-bold text-lg">{currencySymbol()}{formatPriceWhole(stats.totalSales)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Platform Commission ({stats.commissionRate}%)</span>
            <span className="text-red-600">-{currencySymbol()}{formatPriceWhole(stats.commissionPaid)}</span>
          </div>
          <hr />
          <div className="flex justify-between items-center">
            <span className="font-semibold">Your Earnings</span>
            <span className="font-bold text-lg text-green-600">{currencySymbol()}{formatPriceWhole(stats.vendorEarnings)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Already Paid Out</span>
            <span>{currencySymbol()}{formatPriceWhole(stats.totalPaidOut)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-semibold">Available Balance</span>
            <span className="font-bold text-amber-600">{currencySymbol()}{formatPriceWhole(stats.currentBalance)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VendorSettings({ vendor, onUpdate }) {
  const [form, setForm] = useState({
    company_name: vendor.company_name || '',
    contact_name: '',
    website: '',
    description: '',
    payout_email: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const token = localStorage.getItem('vendor_token');
    try {
      const res = await fetch('/api/vendor/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setForm({
          company_name: data.settings.company_name || '',
          contact_name: data.settings.contact_name || '',
          website: data.settings.website || '',
          description: data.settings.description || '',
          payout_email: data.settings.payout_email || '',
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem('vendor_token');
    try {
      const res = await fetch('/api/vendor/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMessage('Settings saved');
        onUpdate();
      }
    } catch (err) {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const changeTier = async (tier) => {
    if (!confirm(`Change to ${tier} tier? This affects your commission rate.`)) return;
    const token = localStorage.getItem('vendor_token');
    try {
      await fetch('/api/vendor/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier }),
      });
      onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{'Settings'}</h2>

      {/* Commission Tiers */}
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="font-semibold mb-4">Commission Tier</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { key: 'basic', name: 'Basic', commission: 10, benefits: ['Product listing', 'Basic stats', 'Standard placement'] },
            { key: 'pro', name: 'Pro', commission: 25, benefits: ['Featured badge', 'Full analytics', 'Monthly email feature', 'Priority search'] },
            { key: 'partner', name: 'Partner', commission: 60, benefits: ['Category exclusivity', 'Homepage featured', 'Co-branded campaigns', 'API access', 'Account manager'] },
          ].map((tier) => (
            <div
              key={tier.key}
              className={`border-2 rounded-lg p-4 ${vendor.commission_tier === tier.key ? 'border-amber-500 bg-amber-50' : 'border-gray-200'}`}
            >
              <h4 className="font-semibold">{tier.name}</h4>
              <p className="text-2xl font-bold text-amber-600">{tier.commission}%</p>
              <p className="text-xs text-gray-500 mb-3">commission to {'Vector'}</p>
              <ul className="text-xs space-y-1 mb-4">
                {tier.benefits.map((b, i) => (
                  <li key={i}>&#10003; {b}</li>
                ))}
              </ul>
              {vendor.commission_tier !== tier.key && (
                <button
                  onClick={() => changeTier(tier.key)}
                  className="w-full py-2 border border-amber-500 text-amber-600 rounded text-sm hover:bg-amber-50"
                >
                  Select
                </button>
              )}
              {vendor.commission_tier === tier.key && (
                <p className="text-center text-sm text-green-600 font-medium">Current</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Company Info */}
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="font-semibold mb-4">{'Company Information'}</h3>
        {message && (
          <div className="mb-4 p-2 bg-green-100 text-green-700 rounded text-sm">{message}</div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{'Company Name'}</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contact {'Name'}</label>
            <input
              type="text"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Website</label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{'Description'}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payout {'Email'} (PayPal)</label>
            <input
              type="email"
              value={form.payout_email}
              onChange={(e) => setForm({ ...form, payout_email: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="payouts@company.com"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
