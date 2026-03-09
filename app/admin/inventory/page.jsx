"use client";

import { useState, useEffect } from 'react';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Redemptions', href: '/admin/redemptions' },
  { label: 'Aircraft', href: '/admin/aircraft' },
  { label: 'Vendors', href: '/admin/vendors' },
];

const CATEGORIES = ['Supplies', 'Swag', 'Training', 'Credits', 'Exclusive', 'VIP'];
const TIERS = ['pro', 'business', 'enterprise'];
const REWARD_TYPES = ['Physical', 'Digital', 'Discount', 'Subscription Credit'];

const EMPTY_FORM = {
  name: '',
  description: '',
  image_url: '',
  points_cost: '',
  quantity_available: '',
  category: 'supplies',
  min_tier: 'pro',
  reward_type: 'physical',
  reward_value: '{}',
  active: true,
  featured: false,
  // Discount/credit fields
  discount_percent: '',
  credit_months: '',
  credit_plan: 'pro',
};

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('created');
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('vector_token');
    if (!t) { window.location.href = '/login'; return; }
    setToken(t);
    fetchItems(t);
  }, []);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const fetchItems = async (t) => {
    try {
      const res = await fetch('/api/admin/inventory', {
        headers: { Authorization: `Bearer ${t || token}` },
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/inventory/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setForm(f => ({ ...f, image_url: data.url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const buildRewardValue = () => {
    const type = form.reward_type.toLowerCase();
    if (type === 'discount') {
      return JSON.stringify({ percent: parseInt(form.discount_percent) || 0 });
    }
    if (type === 'subscription credit') {
      return JSON.stringify({ months: parseInt(form.credit_months) || 1, plan: form.credit_plan });
    }
    return form.reward_value || '{}';
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.points_cost) { setError('Points cost is required'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        description: form.description,
        image_url: form.image_url || null,
        points_cost: parseInt(form.points_cost),
        quantity_available: parseInt(form.quantity_available) || 0,
        category: form.category.toLowerCase(),
        min_tier: form.min_tier,
        reward_type: form.reward_type.toLowerCase().replace(' ', '_'),
        reward_value: buildRewardValue(),
        active: form.active,
        featured: form.featured,
      };

      const method = editingId ? 'PUT' : 'POST';
      if (editingId) payload.id = editingId;

      const res = await fetch('/api/admin/inventory', { method, headers, body: JSON.stringify(payload) });
      const data = await res.json();

      if (data.error) { setError(data.error); return; }

      setSuccess(editingId ? 'Item updated!' : 'Item created!');
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      await fetchItems();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    const rewardVal = typeof item.reward_value === 'string' ? JSON.parse(item.reward_value || '{}') : (item.reward_value || {});
    setForm({
      name: item.name || '',
      description: item.description || '',
      image_url: item.image_url || '',
      points_cost: String(item.points_cost || ''),
      quantity_available: String(item.quantity_available || ''),
      category: item.category || 'supplies',
      min_tier: item.min_tier || 'pro',
      reward_type: (item.reward_type || 'physical').replace('_', ' '),
      reward_value: JSON.stringify(item.reward_value || '{}'),
      active: item.active !== false,
      featured: item.featured || false,
      discount_percent: String(rewardVal.percent || ''),
      credit_months: String(rewardVal.months || ''),
      credit_plan: rewardVal.plan || 'pro',
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this inventory item?')) return;
    try {
      const res = await fetch(`/api/admin/inventory?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setItems(prev => prev.filter(i => i.id !== id));
      setSuccess('Item deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      const res = await fetch('/api/admin/inventory', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: item.id, active: !item.active }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i));
    } catch (err) {
      setError(err.message);
    }
  };

  // Filtering and sorting
  let filtered = items;
  if (filterCategory !== 'all') {
    filtered = filtered.filter(i => i.category === filterCategory.toLowerCase());
  }
  if (sortBy === 'stock') filtered = [...filtered].sort((a, b) => (a.quantity_available || 0) - (b.quantity_available || 0));
  else if (sortBy === 'points') filtered = [...filtered].sort((a, b) => (b.points_cost || 0) - (a.points_cost || 0));
  else if (sortBy === 'name') filtered = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const rewardTypeDisplay = form.reward_type.toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Nav */}
      <nav className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">&larr; App</a>
            <span className="font-bold text-gray-900">Admin</span>
            {ADMIN_NAV.map(nav => (
              <a
                key={nav.href}
                href={nav.href}
                className={`text-sm ${nav.href === '/admin/inventory' ? 'text-amber-600 font-medium' : 'text-gray-500 hover:text-gray-900'}`}
              >
                {nav.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Reward Inventory</h1>
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(true); }}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600"
          >
            + Add New Product
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Product' : 'Add New Product'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Product name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points Cost *</label>
                <input
                  type="number"
                  value={form.points_cost}
                  onChange={e => setForm(f => ({ ...f, points_cost: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                  placeholder="Product description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                <div className="flex items-center gap-3">
                  {form.image_url && (
                    <img src={form.image_url} alt="" className="w-12 h-12 rounded object-cover border" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="text-sm text-gray-500"
                  />
                  {uploading && <span className="text-xs text-gray-400">Uploading...</span>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  value={form.quantity_available}
                  onChange={e => setForm(f => ({ ...f, quantity_available: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c.toLowerCase()}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Tier</label>
                <select
                  value={form.min_tier}
                  onChange={e => setForm(f => ({ ...f, min_tier: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {TIERS.map(t => (
                    <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reward Type</label>
                <select
                  value={form.reward_type}
                  onChange={e => setForm(f => ({ ...f, reward_type: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {REWARD_TYPES.map(t => (
                    <option key={t} value={t.toLowerCase()}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Conditional fields for discount/credit */}
              {rewardTypeDisplay === 'discount' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Percent</label>
                  <input
                    type="number"
                    value={form.discount_percent}
                    onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="10"
                  />
                </div>
              )}
              {rewardTypeDisplay === 'subscription credit' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credit Months</label>
                    <input
                      type="number"
                      value={form.credit_months}
                      onChange={e => setForm(f => ({ ...f, credit_months: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                    <select
                      value={form.credit_plan}
                      onChange={e => setForm(f => ({ ...f, credit_plan: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="pro">Pro</option>
                      <option value="business">Business</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                </>
              )}

              {/* Toggles */}
              <div className="md:col-span-2 flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 rounded text-amber-500"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))}
                    className="w-4 h-4 rounded text-amber-500"
                  />
                  <span className="text-sm text-gray-700">Featured</span>
                </label>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM }); }}
                className="px-5 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c.toLowerCase()}>{c}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="created">Newest First</option>
            <option value="stock">Stock (low to high)</option>
            <option value="points">Points (high to low)</option>
            <option value="name">Name (A-Z)</option>
          </select>
          <span className="text-sm text-gray-500">{filtered.length} items</span>
        </div>

        {/* Inventory Table */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading inventory...</div>
        ) : (
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-3 font-medium">Image</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Points</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Redeemed</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const stockWarning = item.quantity_available === 0 ? 'text-red-600 font-bold'
                    : item.quantity_available < 5 ? 'text-yellow-600 font-medium'
                    : 'text-gray-900';
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-10 h-10 rounded object-cover border" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">N/A</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{item.description}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-amber-600">{item.points_cost?.toLocaleString()}</td>
                      <td className={`px-4 py-3 ${stockWarning}`}>
                        {item.quantity_available}
                        {item.quantity_available === 0 && <span className="ml-1 text-xs">OUT</span>}
                        {item.quantity_available > 0 && item.quantity_available < 5 && <span className="ml-1 text-xs">LOW</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.redeemed_count || 0}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs capitalize">{item.category}</span>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-gray-600">{item.min_tier}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={`w-9 h-5 rounded-full relative transition-colors ${item.active ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${item.active ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-red-500 hover:underline text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-4 py-8 text-center text-gray-400">
                      {items.length === 0 ? 'No inventory items yet. Add your first product above.' : 'No items match the current filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
