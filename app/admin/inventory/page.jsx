"use client";

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { formatPointsAsDollars } from '@/lib/points';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Redemptions', href: '/admin/redemptions' },
  { label: 'Aircraft', href: '/admin/aircraft' },
  { label: 'Vendors', href: '/admin/vendors' },
];

const CATEGORIES = ['Supplies', 'Swag', 'Training', 'Credits', 'Exclusive', 'VIP', 'Coaching'];
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
  const [formError, setFormError] = useState('');
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

  const getHeaders = () => {
    const t = token || localStorage.getItem('vector_token') || '';
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
  };

  const fetchItems = async (t) => {
    try {
      const authToken = t || token || localStorage.getItem('vector_token') || '';
      const res = await fetch('/api/admin/inventory', {
        headers: { Authorization: `Bearer ${authToken}` },
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
      return { percent: parseInt(form.discount_percent) || 0 };
    }
    if (type === 'subscription credit') {
      return { months: parseInt(form.credit_months) || 1, plan: form.credit_plan };
    }
    // Parse string to object if needed
    if (typeof form.reward_value === 'string') {
      try { return JSON.parse(form.reward_value); } catch { return {}; }
    }
    return form.reward_value || {};
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.points_cost && form.points_cost !== '0') { setFormError('Points cost is required'); return; }

    setSaving(true);
    setFormError('');
    setError('');

    try {
      // Always get fresh token from localStorage to avoid stale state
      const freshToken = localStorage.getItem('vector_token');
      if (!freshToken) {
        setFormError('Session expired. Please log in again.');
        window.location.href = '/login';
        return;
      }

      const payload = {
        name: form.name.trim(),
        description: form.description || '',
        image_url: form.image_url || null,
        points_cost: parseInt(form.points_cost) || 0,
        quantity_available: parseInt(form.quantity_available) || 0,
        category: form.category.toLowerCase(),
        min_tier: form.min_tier,
        reward_type: form.reward_type.toLowerCase().replaceAll(' ', '_'),
        reward_value: buildRewardValue(),
        active: form.active,
        featured: form.featured,
      };

      const method = editingId ? 'PUT' : 'POST';
      if (editingId) payload.id = editingId;

      console.log('[Admin Inventory] Saving:', method, payload.name);
      const res = await fetch('/api/admin/inventory', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        const msg = data.error || `Server error (${res.status})`;
        console.error('[Admin Inventory] Save failed:', msg);
        setFormError(msg);
        return;
      }

      if (!data.item) {
        console.error('[Admin Inventory] Save returned no item');
        setFormError('Save appeared to succeed but returned no data. Please refresh.');
        return;
      }

      console.log('[Admin Inventory] Saved:', data.item.id);

      // Update local state
      if (editingId) {
        setItems(prev => prev.map(i => i.id === editingId ? { ...i, ...data.item, redeemed_count: i.redeemed_count || 0 } : i));
      } else {
        setItems(prev => [{ ...data.item, redeemed_count: 0 }, ...prev]);
      }

      setSuccess(editingId ? 'Item updated!' : 'Product added!');
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      setFormError('');

      // Delayed background refresh to sync with DB
      setTimeout(() => fetchItems().catch(() => {}), 1000);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('[Admin Inventory] Exception:', err);
      setFormError(err.message || 'Failed to save. Please try again.');
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
      points_cost: String(item.points_cost ?? ''),
      quantity_available: String(item.quantity_available ?? 0),
      category: (item.category || 'supplies').toLowerCase(),
      min_tier: item.min_tier || 'pro',
      reward_type: (item.reward_type || 'physical').replaceAll('_', ' '),
      reward_value: JSON.stringify(rewardVal),
      active: item.active !== false,
      featured: item.featured || false,
      discount_percent: String(rewardVal.percent ?? ''),
      credit_months: String(rewardVal.months ?? ''),
      credit_plan: rewardVal.plan || 'pro',
    });
    setEditingId(item.id);
    setFormError('');
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
        headers: getHeaders(),
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
    <AppShell title="Reward Inventory">
      {/* Admin Nav */}
      <nav className="bg-v-surface border-b border-v-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <a href="/dashboard" className="text-v-text-secondary hover:text-v-text-primary text-sm">&larr; App</a>
            <span className="text-v-text-primary font-bold">Admin</span>
            {ADMIN_NAV.map(nav => (
              <a
                key={nav.href}
                href={nav.href}
                className={`text-sm ${nav.href === '/admin/inventory' ? 'text-v-gold font-medium' : 'text-v-text-secondary hover:text-v-text-primary'}`}
              >
                {nav.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-v-text-primary font-heading">Reward Inventory</h1>
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setEditingId(null); setFormError(''); setShowForm(true); }}
            className="text-v-gold hover:text-v-gold-dim text-sm font-medium border-b border-v-gold/50 hover:border-v-gold transition-colors"
          >
            + Add New Product
          </button>
        </div>

        {error && <div className="p-3 bg-red-900/30 border border-red-600/30 rounded-sm text-red-400 text-sm">{error}</div>}
        {success && <div className="p-3 bg-green-900/30 border border-green-600/30 rounded-sm text-green-400 text-sm">{success}</div>}

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-v-surface rounded-sm border border-v-border p-6">
            <h2 className="text-lg font-semibold text-v-text-primary mb-4">{editingId ? 'Edit Product' : 'Add New Product'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                  placeholder="Product name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Points Cost *</label>
                <input
                  type="number"
                  value={form.points_cost}
                  onChange={e => setForm(f => ({ ...f, points_cost: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                  placeholder="500"
                />
                {form.points_cost && (
                  <span className="text-xs text-v-text-secondary mt-1 block">= {formatPointsAsDollars(parseInt(form.points_cost) || 0)} value</span>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                  rows={2}
                  placeholder="Product description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Image</label>
                <div className="flex items-center gap-3">
                  {form.image_url && (
                    <img src={form.image_url} alt="" className="w-12 h-12 rounded object-cover border border-v-border" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="text-sm text-v-text-secondary"
                  />
                  {uploading && <span className="text-xs text-v-text-secondary">Uploading...</span>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Quantity</label>
                <input
                  type="number"
                  value={form.quantity_available}
                  onChange={e => setForm(f => ({ ...f, quantity_available: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                  style={{ colorScheme: 'dark' }}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c.toLowerCase()} style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Minimum Tier</label>
                <select
                  value={form.min_tier}
                  onChange={e => setForm(f => ({ ...f, min_tier: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                  style={{ colorScheme: 'dark' }}
                >
                  {TIERS.map(t => (
                    <option key={t} value={t} style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Reward Type</label>
                <select
                  value={form.reward_type}
                  onChange={e => setForm(f => ({ ...f, reward_type: e.target.value }))}
                  className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                  style={{ colorScheme: 'dark' }}
                >
                  {REWARD_TYPES.map(t => (
                    <option key={t} value={t.toLowerCase()} style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Conditional fields for discount/credit */}
              {rewardTypeDisplay === 'discount' && (
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">Discount Percent</label>
                  <input
                    type="number"
                    value={form.discount_percent}
                    onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
                    className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                    placeholder="10"
                  />
                </div>
              )}
              {rewardTypeDisplay === 'subscription credit' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-v-text-secondary mb-1">Credit Months</label>
                    <input
                      type="number"
                      value={form.credit_months}
                      onChange={e => setForm(f => ({ ...f, credit_months: e.target.value }))}
                      className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-v-text-secondary mb-1">Plan</label>
                    <select
                      value={form.credit_plan}
                      onChange={e => setForm(f => ({ ...f, credit_plan: e.target.value }))}
                      className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 focus:border-v-gold focus:ring-0 outline-none transition-colors"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="pro" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>Pro</option>
                      <option value="business" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>Business</option>
                      <option value="enterprise" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>Enterprise</option>
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
                    className="w-4 h-4 rounded text-v-gold accent-[var(--brand-primary)]"
                  />
                  <span className="text-sm text-v-text-primary">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))}
                    className="w-4 h-4 rounded text-v-gold accent-[var(--brand-primary)]"
                  />
                  <span className="text-sm text-v-text-primary">Featured</span>
                </label>
              </div>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-600/30 rounded-sm text-red-400 text-sm">{formError}</div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-v-gold text-v-charcoal text-xs uppercase tracking-widest font-semibold hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM }); }}
                className="px-5 py-2 border border-v-border text-v-text-secondary hover:bg-white/5 transition-colors"
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
            className="bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 text-sm focus:border-v-gold outline-none"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c.toLowerCase()} style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>{c}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-transparent border-0 border-b border-v-border text-v-text-primary px-0 py-2 text-sm focus:border-v-gold outline-none"
            style={{ colorScheme: 'dark' }}
          >
            <option value="created" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>Newest First</option>
            <option value="stock" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>Stock (low to high)</option>
            <option value="points" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>Points (high to low)</option>
            <option value="name" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>Name (A-Z)</option>
          </select>
          <span className="text-sm text-v-text-secondary">{filtered.length} items</span>
        </div>

        {/* Inventory Table */}
        {loading ? (
          <div className="text-center py-8 text-v-text-secondary">Loading inventory...</div>
        ) : (
          <div className="bg-v-surface rounded-sm border border-v-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-v-text-secondary border-b border-v-border bg-v-charcoal">
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
                  const stockWarning = item.quantity_available === 0 ? 'text-red-400 font-bold'
                    : item.quantity_available < 5 ? 'text-yellow-400 font-medium'
                    : 'text-v-text-primary';
                  return (
                    <tr key={item.id} className="border-b border-v-border last:border-0 hover:bg-white/5">
                      <td className="px-4 py-3">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-10 h-10 rounded object-cover border border-v-border" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-v-charcoal flex items-center justify-center text-v-text-secondary text-xs">N/A</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-v-text-primary">{item.name}</div>
                        <div className="text-xs text-v-text-secondary truncate max-w-[200px]">{item.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-v-gold">{item.points_cost?.toLocaleString()}</span>
                        <span className="block text-xs text-v-text-secondary">{formatPointsAsDollars(item.points_cost || 0)}</span>
                      </td>
                      <td className={`px-4 py-3 ${stockWarning}`}>
                        {item.quantity_available}
                        {item.quantity_available === 0 && <span className="ml-1 text-xs">OUT</span>}
                        {item.quantity_available > 0 && item.quantity_available < 5 && <span className="ml-1 text-xs">LOW</span>}
                      </td>
                      <td className="px-4 py-3 text-v-text-secondary">{item.redeemed_count || 0}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-v-text-secondary capitalize">{item.category}</span>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-v-text-secondary">{item.min_tier}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={`w-9 h-5 rounded-full relative transition-colors ${item.active ? 'bg-v-gold' : 'bg-v-charcoal'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${item.active ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-v-gold hover:underline text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-red-400 hover:underline text-xs"
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
                    <td colSpan="9" className="px-4 py-8 text-center text-v-text-secondary">
                      {items.length === 0 ? 'No inventory items yet. Add your first product above.' : 'No items match the current filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
