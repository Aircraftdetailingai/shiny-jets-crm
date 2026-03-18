"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';

const COMMISSION_TIERS = [
  { key: 'basic', name: 'Basic', rate: '10%', color: 'bg-gray-700/30 text-gray-300' },
  { key: 'pro', name: 'Pro', rate: '25%', color: 'bg-v-gold/10 text-v-gold' },
  { key: 'partner', name: 'Partner', rate: '60%', color: 'bg-v-gold-muted/30 text-v-gold' },
];

export default function AdminVendorsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({});
  const [activeTab, setActiveTab] = useState('vendors');
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch vendors
      const vendorRes = await fetch('/api/admin/vendors');
      if (!vendorRes.ok) {
        if (vendorRes.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch vendors');
      }
      const vendorData = await vendorRes.json();
      setVendors(vendorData.vendors || []);
      setStats(vendorData.stats || {});

      // Fetch pending products
      const productRes = await fetch('/api/admin/vendors?view=products');
      const productData = await productRes.json();
      setProducts(productData.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateVendorStatus = async (vendorId, status) => {
    setUpdating(vendorId);
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vendor', id: vendorId, status }),
      });

      if (!res.ok) throw new Error('Failed to update vendor');

      setVendors(prev => prev.map(v =>
        v.id === vendorId ? { ...v, status } : v
      ));
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const updateVendorTier = async (vendorId, tier) => {
    setUpdating(vendorId);
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vendor', id: vendorId, commission_tier: tier }),
      });

      if (!res.ok) throw new Error('Failed to update tier');

      setVendors(prev => prev.map(v =>
        v.id === vendorId ? { ...v, commission_tier: tier } : v
      ));
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const updateProductStatus = async (productId, status) => {
    setUpdating(productId);
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'product', id: productId, status }),
      });

      if (!res.ok) throw new Error('Failed to update product');

      if (status === 'active' || status === 'rejected') {
        setProducts(prev => prev.filter(p => p.id !== productId));
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const pendingVendors = vendors.filter(v => v.status === 'pending');
  const activeVendors = vendors.filter(v => v.status === 'active');
  const suspendedVendors = vendors.filter(v => v.status === 'suspended');

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-v-gold border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-v-text-secondary">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-red-400">{error}</h1>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 text-v-gold hover:underline"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v-charcoal">
      {/* Header */}
      <div className="bg-v-surface border-b border-v-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-v-text-secondary hover:text-v-text-primary"
              >
                &larr; Back
              </button>
              <h1 className="text-2xl text-v-text-primary font-heading font-bold">Vendor Administration</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-sm text-v-text-secondary">Total Vendors</p>
            <p className="text-2xl font-bold text-v-text-primary">{stats.totalVendors || 0}</p>
          </div>
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-sm text-v-text-secondary">Active Vendors</p>
            <p className="text-2xl font-bold text-green-600">{stats.activeVendors || 0}</p>
          </div>
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-sm text-v-text-secondary">Pending Approval</p>
            <p className="text-2xl font-bold text-v-gold-dim">{pendingVendors.length}</p>
          </div>
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-sm text-v-text-secondary">Total Revenue</p>
            <p className="text-2xl font-bold text-v-text-primary">{currencySymbol()}{formatPriceWhole(stats.totalRevenue)}</p>
          </div>
          <div className="bg-v-surface border border-v-border rounded-sm p-4">
            <p className="text-sm text-v-text-secondary">Total Commission</p>
            <p className="text-2xl font-bold text-v-gold-dim">{currencySymbol()}{formatPriceWhole(stats.totalCommission)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex border-b border-v-border">
          <button
            onClick={() => setActiveTab('vendors')}
            className={`px-6 py-3 font-medium border-b-2 -mb-px ${
              activeTab === 'vendors'
                ? 'border-v-gold text-v-gold'
                : 'border-transparent text-v-text-secondary hover:text-v-text-primary'
            }`}
          >
            Vendors ({vendors.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-3 font-medium border-b-2 -mb-px ${
              activeTab === 'pending'
                ? 'border-v-gold text-v-gold'
                : 'border-transparent text-v-text-secondary hover:text-v-text-primary'
            }`}
          >
            Pending Vendors ({pendingVendors.length})
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-6 py-3 font-medium border-b-2 -mb-px ${
              activeTab === 'products'
                ? 'border-v-gold text-v-gold'
                : 'border-transparent text-v-text-secondary hover:text-v-text-primary'
            }`}
          >
            Pending Products ({products.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'vendors' && (
          <div className="bg-v-surface border border-v-border rounded-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-v-charcoal">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-v-text-secondary border-b border-v-border">Company</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-v-text-secondary border-b border-v-border">Contact</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-v-text-secondary border-b border-v-border">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-v-text-secondary border-b border-v-border">Tier</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-v-text-secondary border-b border-v-border">Joined</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-v-text-secondary border-b border-v-border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(vendor => {
                  const tier = COMMISSION_TIERS.find(t => t.key === vendor.commission_tier) || COMMISSION_TIERS[0];
                  return (
                    <tr key={vendor.id} className="border-b border-v-border hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium text-v-text-primary">{vendor.company_name}</div>
                        <div className="text-sm text-v-text-secondary">{vendor.website}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-v-text-primary">{vendor.contact_name}</div>
                        <div className="text-sm text-v-text-secondary">{vendor.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          vendor.status === 'active' ? 'bg-green-900/30 text-green-400' :
                          vendor.status === 'pending' ? 'bg-v-gold-muted/30 text-v-gold' :
                          'bg-red-900/30 text-red-400'
                        }`}>
                          {vendor.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={vendor.commission_tier || 'basic'}
                          onChange={(e) => updateVendorTier(vendor.id, e.target.value)}
                          disabled={updating === vendor.id}
                          className={`px-2 py-1 rounded text-xs border border-v-border bg-v-charcoal ${tier.color}`}
                        >
                          {COMMISSION_TIERS.map(t => (
                            <option key={t.key} value={t.key}>{t.name} ({t.rate})</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-v-text-secondary">
                        {new Date(vendor.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {vendor.status === 'active' ? (
                          <button
                            onClick={() => updateVendorStatus(vendor.id, 'suspended')}
                            disabled={updating === vendor.id}
                            className="text-red-400 hover:underline text-sm"
                          >
                            Suspend
                          </button>
                        ) : vendor.status === 'suspended' ? (
                          <button
                            onClick={() => updateVendorStatus(vendor.id, 'active')}
                            disabled={updating === vendor.id}
                            className="text-green-400 hover:underline text-sm"
                          >
                            Activate
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {vendors.length === 0 && (
              <div className="text-center py-12 text-v-text-secondary">
                No vendors yet
              </div>
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="space-y-4">
            {pendingVendors.length === 0 ? (
              <div className="bg-v-surface border border-v-border rounded-sm p-12 text-center text-v-text-secondary">
                <div className="text-4xl mb-2">✓</div>
                No pending vendor applications
              </div>
            ) : (
              pendingVendors.map(vendor => (
                <div key={vendor.id} className="bg-v-surface border border-v-border rounded-sm p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-semibold text-v-text-primary">{vendor.company_name}</h3>
                      <p className="text-v-text-secondary">{vendor.website}</p>
                    </div>
                    <span className="px-3 py-1 bg-v-gold-muted/30 text-v-gold rounded-full text-sm">
                      Pending Review
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-sm text-v-text-secondary">Contact</p>
                      <p className="font-medium text-v-text-primary">{vendor.contact_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-v-text-secondary">Email</p>
                      <p className="font-medium text-v-text-primary">{vendor.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-v-text-secondary">Applied</p>
                      <p className="font-medium text-v-text-primary">{new Date(vendor.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => updateVendorStatus(vendor.id, 'active')}
                      disabled={updating === vendor.id}
                      className="px-6 py-2 bg-green-500 text-white rounded-sm hover:bg-green-600 disabled:opacity-50"
                    >
                      {updating === vendor.id ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => updateVendorStatus(vendor.id, 'rejected')}
                      disabled={updating === vendor.id}
                      className="px-6 py-2 bg-red-500 text-white rounded-sm hover:bg-red-600 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'products' && (
          <div className="space-y-4">
            {products.length === 0 ? (
              <div className="bg-v-surface border border-v-border rounded-sm p-12 text-center text-v-text-secondary">
                <div className="text-4xl mb-2">✓</div>
                No pending product submissions
              </div>
            ) : (
              products.map(product => (
                <div key={product.id} className="bg-v-surface border border-v-border rounded-sm p-6">
                  <div className="flex gap-6">
                    {/* Product Image */}
                    <div className="w-32 h-32 bg-v-charcoal border border-v-border rounded flex-shrink-0">
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover rounded" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-v-text-secondary">
                          No Image
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-xl font-semibold text-v-text-primary">{product.name}</h3>
                          <p className="text-v-gold font-bold">{currencySymbol()}{formatPrice(product.price)}</p>
                          <p className="text-sm text-v-text-secondary mt-1">
                            by {product.vendors?.company_name} ({product.vendors?.email})
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-v-gold-muted/30 text-v-gold rounded-full text-sm">
                          Pending Review
                        </span>
                      </div>

                      <p className="text-v-text-secondary mt-3">{product.description}</p>

                      <div className="flex gap-2 mt-2">
                        <span className="px-2 py-1 bg-gray-700/30 text-gray-300 rounded text-xs">
                          {product.category}
                        </span>
                        {product.stock !== null && (
                          <span className="px-2 py-1 bg-gray-700/30 text-gray-300 rounded text-xs">
                            Stock: {product.stock}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={() => updateProductStatus(product.id, 'active')}
                          disabled={updating === product.id}
                          className="px-6 py-2 bg-green-500 text-white rounded-sm hover:bg-green-600 disabled:opacity-50"
                        >
                          {updating === product.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => updateProductStatus(product.id, 'rejected')}
                          disabled={updating === product.id}
                          className="px-6 py-2 bg-red-500 text-white rounded-sm hover:bg-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
