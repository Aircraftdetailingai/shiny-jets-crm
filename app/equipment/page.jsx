"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPriceWhole } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';

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

const STATUS_LABELS = {
  active: 'Active',
  maintenance: 'In Maintenance',
  retired: 'Retired',
};

export default function EquipmentPage() {
  const router = useRouter();
  const [equipment, setEquipment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'other',
    purchasePrice: '',
    purchaseDate: '',
    maintenanceNotes: '',
  });
  const [saving, setSaving] = useState(false);

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
        name: item.name,
        category: item.category,
        purchasePrice: item.purchase_price || '',
        purchaseDate: item.purchase_date || '',
        maintenanceNotes: item.maintenance_notes || '',
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        category: 'other',
        purchasePrice: '',
        purchaseDate: '',
        maintenanceNotes: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const token = localStorage.getItem('vector_token');
    const payload = {
      name: formData.name,
      category: formData.category,
      purchasePrice: parseFloat(formData.purchasePrice) || 0,
      purchaseDate: formData.purchaseDate || null,
      maintenanceNotes: formData.maintenanceNotes,
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
      year: 'numeric',
    });
  };

  const equipmentByCategory = equipment.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Sort by best ROI (lowest cost per job)
  const sortedByROI = [...equipment]
    .filter(e => e.cost_per_job !== null)
    .sort((a, b) => a.cost_per_job - b.cost_per_job);

  if (loading) {
    return <LoadingSpinner message="Loading equipment..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 text-gray-900">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <h1 className="text-2xl font-bold">Equipment</h1>
        </div>
        <div className="space-x-4 text-sm">
          <a href="/products" className="underline">Inventory</a>
          <a href="/dashboard" className="underline">Dashboard</a>
          <a href="/settings" className="underline">Settings</a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">Total Investment</p>
              <p className="text-2xl font-bold text-gray-900">${formatPriceWhole(stats.totalInvestment)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">Equipment Tracked</p>
              <p className="text-2xl font-bold text-gray-900">{equipment.length}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">Total Jobs Done</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalJobs}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow">
              <p className="text-gray-500 text-xs">Avg Cost/Job</p>
              <p className="text-2xl font-bold text-purple-600">
                {stats.avgCostPerJob ? `$${formatPriceWhole(stats.avgCostPerJob)}` : '-'}
              </p>
            </div>
          </div>
        )}

        {/* ROI Leaderboard */}
        {sortedByROI.length > 0 && (
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-emerald-900 mb-3">Best ROI Equipment</h3>
            <div className="space-y-2">
              {sortedByROI.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.jobs_completed} jobs completed</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">${formatPriceWhole(item.cost_per_job)}/job</p>
                    <p className="text-xs text-gray-400">${formatPriceWhole(item.purchase_price)} invested</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-gray-400 text-sm">Track your tools and equipment ROI</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
          >
            + Add Equipment
          </button>
        </div>

        {/* Equipment List */}
        {equipment.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <span className="text-4xl">&#128295;</span>
            <h3 className="text-xl font-semibold mt-4">No equipment yet</h3>
            <p className="text-gray-500 mt-2">Add your tools and equipment to track usage and ROI</p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600"
            >
              Add Your First Equipment
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(equipmentByCategory).map(([category, items]) => (
              <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">{CATEGORY_LABELS[category] || category}</h3>
                  <span className="text-xs text-gray-400">{items.length} items</span>
                </div>
                <div className="divide-y">
                  {items.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            {item.status !== 'active' && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                item.status === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {STATUS_LABELS[item.status]}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            {item.purchase_price > 0 && (
                              <span>${formatPriceWhole(item.purchase_price)}</span>
                            )}
                            {item.purchase_date && (
                              <span>Bought {formatDate(item.purchase_date)}</span>
                            )}
                            <span className="font-medium text-blue-600">{item.jobs_completed} jobs</span>
                            {item.cost_per_job && (
                              <span className="text-emerald-600">${formatPriceWhole(item.cost_per_job)}/job</span>
                            )}
                          </div>
                          {item.maintenance_notes && (
                            <p className="text-xs text-gray-400 mt-1">{item.maintenance_notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleIncrementJobs(item.id)}
                            className="px-3 py-1 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded"
                            title="Add a completed job"
                          >
                            +1 Job
                          </button>
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
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
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-md overflow-hidden max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingItem ? 'Edit Equipment' : 'Add Equipment'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Rupes LHR21"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>

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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Notes</label>
                <textarea
                  value={formData.maintenanceNotes}
                  onChange={(e) => setFormData({ ...formData, maintenanceNotes: e.target.value })}
                  rows={2}
                  placeholder="Maintenance schedule, repair history, etc."
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
                  {saving ? 'Saving...' : editingItem ? 'Update' : 'Add Equipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
