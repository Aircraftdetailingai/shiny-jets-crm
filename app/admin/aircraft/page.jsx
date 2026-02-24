"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const categories = [
  { value: 'piston', label: 'Piston' },
  { value: 'turboprop', label: 'Turboprop' },
  { value: 'light_jet', label: 'Light Jet' },
  { value: 'midsize_jet', label: 'Midsize Jet' },
  { value: 'super_midsize_jet', label: 'Super Midsize Jet' },
  { value: 'large_jet', label: 'Large Jet' },
  { value: 'helicopter', label: 'Helicopter' },
];

// All possible service hour columns in the aircraft table
const ALL_SERVICE_COLUMNS = [
  { key: 'ext_wash_hours', label: 'Ext Wash', fallback: 'exterior_hours' },
  { key: 'int_detail_hours', label: 'Int Detail', fallback: 'interior_hours' },
  { key: 'leather_hours', label: 'Leather' },
  { key: 'carpet_hours', label: 'Carpet' },
  { key: 'wax_hours', label: 'Wax' },
  { key: 'polish_hours', label: 'Polish' },
  { key: 'ceramic_hours', label: 'Ceramic' },
  { key: 'brightwork_hours', label: 'Brightwork' },
];

const STORAGE_KEY = 'aircraft_db_columns';

function getHours(ac, col) {
  const val = ac[col.key];
  if (val != null && val !== '') return val;
  if (col.fallback) return ac[col.fallback] ?? '-';
  return '-';
}

export default function AdminAircraftPage() {
  const router = useRouter();
  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ category: '', manufacturer: '' });
  const [manufacturers, setManufacturers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAircraft, setEditingAircraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [bulkImport, setBulkImport] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [seeding, setSeeding] = useState(false);

  // New state for improvements
  const [search, setSearch] = useState('');
  const [myServices, setMyServices] = useState([]);
  const [myServicesOnly, setMyServicesOnly] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return ALL_SERVICE_COLUMNS.map(c => c.key);
  });
  const columnPickerRef = useRef(null);

  const [formData, setFormData] = useState({
    manufacturer: '',
    model: '',
    category: 'piston',
    seats: '',
    wingspan_ft: '',
    length_ft: '',
    height_ft: '',
    surface_area_sqft: '',
    ext_wash_hours: '',
    int_detail_hours: '',
    leather_hours: '',
    carpet_hours: '',
    wax_hours: '',
    polish_hours: '',
    ceramic_hours: '',
    brightwork_hours: '',
  });

  // Save column visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

  // Close column picker on outside click
  useEffect(() => {
    function handleClick(e) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target)) {
        setShowColumnPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchAircraft();
    fetchManufacturers();
    fetchMyServices();
  }, []);

  const fetchAircraft = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const params = new URLSearchParams();
      if (filter.category) params.set('category', filter.category);
      if (filter.manufacturer) params.set('manufacturer', filter.manufacturer);

      const res = await fetch(`/api/admin/aircraft?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAircraft(data.aircraft || []);
      }
    } catch (err) {
      console.error('Failed to fetch aircraft:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchManufacturers = async () => {
    try {
      const res = await fetch('/api/aircraft/manufacturers');
      if (res.ok) {
        const data = await res.json();
        setManufacturers(data.manufacturers || []);
      }
    } catch (err) {
      console.error('Failed to fetch manufacturers:', err);
    }
  };

  const fetchMyServices = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/services', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyServices(data.services || []);
      }
    } catch (err) {
      console.error('Failed to fetch services:', err);
    }
  };

  useEffect(() => {
    fetchAircraft();
  }, [filter]);

  // Derive which hour columns match my services
  const myServiceHourFields = useMemo(() => {
    const fields = new Set();
    for (const svc of myServices) {
      if (svc.hours_field) fields.add(svc.hours_field);
    }
    return fields;
  }, [myServices]);

  // Determine which columns to actually show
  const activeColumns = useMemo(() => {
    return ALL_SERVICE_COLUMNS.filter(col => {
      if (myServicesOnly && myServiceHourFields.size > 0) {
        return myServiceHourFields.has(col.key) && visibleColumns.includes(col.key);
      }
      return visibleColumns.includes(col.key);
    });
  }, [visibleColumns, myServicesOnly, myServiceHourFields]);

  // Filter aircraft by search
  const filteredAircraft = useMemo(() => {
    if (!search.trim()) return aircraft;
    const q = search.toLowerCase();
    return aircraft.filter(ac =>
      `${ac.manufacturer} ${ac.model}`.toLowerCase().includes(q)
    );
  }, [aircraft, search]);

  const toggleColumn = (key) => {
    setVisibleColumns(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const resetColumns = () => {
    setVisibleColumns(ALL_SERVICE_COLUMNS.map(c => c.key));
  };

  const openAddModal = () => {
    setEditingAircraft(null);
    setFormData({
      manufacturer: '',
      model: '',
      category: 'piston',
      seats: '',
      wingspan_ft: '',
      length_ft: '',
      height_ft: '',
      surface_area_sqft: '',
      ext_wash_hours: '',
      int_detail_hours: '',
      leather_hours: '',
      carpet_hours: '',
      wax_hours: '',
      polish_hours: '',
      ceramic_hours: '',
      brightwork_hours: '',
    });
    setShowModal(true);
  };

  const openEditModal = (ac) => {
    setEditingAircraft(ac);
    setFormData({
      manufacturer: ac.manufacturer || '',
      model: ac.model || '',
      category: ac.category || 'piston',
      seats: ac.seats?.toString() || '',
      wingspan_ft: ac.wingspan_ft?.toString() || '',
      length_ft: ac.length_ft?.toString() || '',
      height_ft: ac.height_ft?.toString() || '',
      surface_area_sqft: ac.surface_area_sqft?.toString() || '',
      ext_wash_hours: ac.ext_wash_hours?.toString() || ac.exterior_hours?.toString() || '',
      int_detail_hours: ac.int_detail_hours?.toString() || ac.interior_hours?.toString() || '',
      leather_hours: ac.leather_hours?.toString() || '',
      carpet_hours: ac.carpet_hours?.toString() || '',
      wax_hours: ac.wax_hours?.toString() || '',
      polish_hours: ac.polish_hours?.toString() || '',
      ceramic_hours: ac.ceramic_hours?.toString() || '',
      brightwork_hours: ac.brightwork_hours?.toString() || '',
    });
    setShowModal(true);
  };

  const saveAircraft = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('vector_token');
      const payload = {
        manufacturer: formData.manufacturer,
        model: formData.model,
        category: formData.category,
        seats: parseInt(formData.seats) || 0,
        wingspan_ft: parseFloat(formData.wingspan_ft) || 0,
        length_ft: parseFloat(formData.length_ft) || 0,
        height_ft: parseFloat(formData.height_ft) || 0,
        surface_area_sqft: parseFloat(formData.surface_area_sqft) || 0,
        exterior_hours: parseFloat(formData.ext_wash_hours) || 0,
        interior_hours: parseFloat(formData.int_detail_hours) || 0,
        ext_wash_hours: parseFloat(formData.ext_wash_hours) || 0,
        int_detail_hours: parseFloat(formData.int_detail_hours) || 0,
        leather_hours: parseFloat(formData.leather_hours) || 0,
        carpet_hours: parseFloat(formData.carpet_hours) || 0,
        wax_hours: parseFloat(formData.wax_hours) || 0,
        polish_hours: parseFloat(formData.polish_hours) || 0,
        ceramic_hours: parseFloat(formData.ceramic_hours) || 0,
        brightwork_hours: parseFloat(formData.brightwork_hours) || 0,
      };

      if (editingAircraft) {
        payload.id = editingAircraft.id;
      }

      const res = await fetch('/api/admin/aircraft', {
        method: editingAircraft ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        fetchAircraft();
        fetchManufacturers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save');
      }
    } catch (err) {
      alert('Failed to save aircraft');
    } finally {
      setSaving(false);
    }
  };

  const deleteAircraft = async (id) => {
    if (!confirm('Delete this aircraft?')) return;

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/admin/aircraft?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchAircraft();
      }
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const handleBulkImport = async () => {
    try {
      const lines = bulkImport.trim().split('\n');
      const aircraftList = [];

      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          aircraftList.push({
            manufacturer: parts[0],
            model: parts[1],
            category: parts[2] || 'piston',
            seats: parseInt(parts[3]) || 0,
            surface_area_sqft: parseFloat(parts[4]) || 0,
            exterior_hours: parseFloat(parts[5]) || 0,
            interior_hours: parseFloat(parts[6]) || 0,
          });
        }
      }

      if (aircraftList.length === 0) {
        alert('No valid aircraft found in input');
        return;
      }

      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/admin/aircraft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ aircraft: aircraftList }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult(`Successfully imported ${data.count} aircraft`);
        fetchAircraft();
        fetchManufacturers();
        setBulkImport('');
      } else {
        const data = await res.json();
        setImportResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setImportResult(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Header */}
      <div className="max-w-[1600px] mx-auto mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-2xl text-gray-600 hover:text-gray-900">&larr;</a>
            <h1 className="text-2xl font-bold">Aircraft Database</h1>
            <span className="text-sm text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
              {filteredAircraft.length} aircraft
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={async () => {
                if (!confirm('This will seed the database with 220+ aircraft (civilian + military). Existing aircraft with the same manufacturer/model will be updated. Continue?')) return;
                setSeeding(true);
                try {
                  const token = localStorage.getItem('vector_token');
                  const res = await fetch('/api/admin/aircraft/seed', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const data = await res.json();
                  if (res.ok) {
                    alert(`Successfully seeded ${data.count} aircraft!`);
                    fetchAircraft();
                    fetchManufacturers();
                  } else {
                    alert(`Error: ${data.error}`);
                  }
                } catch (err) {
                  alert(`Failed: ${err.message}`);
                } finally {
                  setSeeding(false);
                }
              }}
              disabled={seeding}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              {seeding ? 'Seeding...' : 'Seed All (220+)'}
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="px-3 py-2 border rounded hover:bg-gray-50 text-sm"
            >
              Bulk Import
            </button>
            <button
              onClick={openAddModal}
              className="px-3 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm"
            >
              + Add Aircraft
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="max-w-[1600px] mx-auto mb-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search aircraft name or model..."
                className="w-full border rounded-lg px-3 py-2 pl-9 text-sm"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Category filter */}
            <select
              value={filter.category}
              onChange={(e) => setFilter({ ...filter, category: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>

            {/* Manufacturer filter */}
            <select
              value={filter.manufacturer}
              onChange={(e) => setFilter({ ...filter, manufacturer: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {/* My Services toggle */}
            {myServices.length > 0 && (
              <button
                onClick={() => setMyServicesOnly(!myServicesOnly)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${
                  myServicesOnly
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {myServicesOnly ? 'My Services' : 'All Services'}
              </button>
            )}

            {/* Column Picker */}
            <div className="relative" ref={columnPickerRef}>
              <button
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Columns
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-30 w-56 py-2">
                  <div className="px-3 pb-2 mb-2 border-b flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Hour Columns</span>
                    <button
                      onClick={resetColumns}
                      className="text-xs text-amber-600 hover:text-amber-700"
                    >
                      Reset
                    </button>
                  </div>
                  {ALL_SERVICE_COLUMNS.map(col => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                      />
                      <span>{col.label}</span>
                      {myServiceHourFields.has(col.key) && (
                        <span className="ml-auto text-xs text-amber-500 font-medium">My Svc</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Aircraft Table */}
      <div className="max-w-[1600px] mx-auto">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky top-0 bg-gray-50 z-20 sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" style={{ minWidth: 200 }}>
                    Aircraft
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky top-0 bg-gray-50 z-10">
                    Category
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase sticky top-0 bg-gray-50 z-10">
                    Seats
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase sticky top-0 bg-gray-50 z-10">
                    Sq Ft
                  </th>
                  {activeColumns.map(col => (
                    <th key={col.key} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase sticky top-0 bg-gray-50 z-10 whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase sticky top-0 bg-gray-50 z-10">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAircraft.length === 0 ? (
                  <tr>
                    <td colSpan={5 + activeColumns.length} className="px-4 py-12 text-center text-gray-400">
                      {search ? 'No aircraft match your search' : 'No aircraft found'}
                    </td>
                  </tr>
                ) : (
                  filteredAircraft.map((ac) => (
                    <tr key={ac.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-2.5 sticky left-0 bg-white group-hover:bg-gray-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="font-medium text-sm">{ac.manufacturer}</div>
                        <div className="text-xs text-gray-500">{ac.model}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          {categories.find(c => c.value === ac.category)?.label || ac.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm">{ac.seats || '-'}</td>
                      <td className="px-3 py-2.5 text-center text-sm">
                        {ac.surface_area_sqft ? ac.surface_area_sqft.toLocaleString() : '-'}
                      </td>
                      {activeColumns.map(col => (
                        <td key={col.key} className="px-3 py-2.5 text-center text-sm tabular-nums">
                          {getHours(ac, col)}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => openEditModal(ac)}
                          className="text-blue-600 hover:underline text-xs mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteAircraft(ac.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingAircraft ? 'Edit Aircraft' : 'Add Aircraft'}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Manufacturer *</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Cessna"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Model *</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Citation CJ3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Seats</label>
                  <input
                    type="number"
                    value={formData.seats}
                    onChange={(e) => setFormData({ ...formData, seats: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Wingspan (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.wingspan_ft}
                    onChange={(e) => setFormData({ ...formData, wingspan_ft: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Length (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.length_ft}
                    onChange={(e) => setFormData({ ...formData, length_ft: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Height (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.height_ft}
                    onChange={(e) => setFormData({ ...formData, height_ft: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Surface Area (sqft)</label>
                <input
                  type="number"
                  value={formData.surface_area_sqft}
                  onChange={(e) => setFormData({ ...formData, surface_area_sqft: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Service Hours</h4>
                <div className="grid grid-cols-2 gap-3">
                  {ALL_SERVICE_COLUMNS.map(col => (
                    <div key={col.key}>
                      <label className="block text-xs font-medium mb-1 text-gray-600">{col.label}</label>
                      <input
                        type="number"
                        step="0.25"
                        value={formData[col.key]}
                        onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                        className="w-full border rounded px-3 py-1.5 text-sm"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveAircraft}
                disabled={saving || !formData.manufacturer || !formData.model}
                className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-4">Bulk Import Aircraft</h3>

            <p className="text-sm text-gray-600 mb-2">
              Paste aircraft data in CSV format. Each line should have:
            </p>
            <p className="text-xs font-mono bg-gray-100 p-2 rounded mb-4">
              Manufacturer, Model, Category, Seats, Surface Area, Ext Hours, Int Hours
            </p>

            <textarea
              value={bulkImport}
              onChange={(e) => setBulkImport(e.target.value)}
              className="w-full border rounded px-3 py-2 font-mono text-sm"
              rows={10}
              placeholder="Cessna, Citation CJ3, light_jet, 9, 650, 4, 5
Gulfstream, G650, large_jet, 19, 2400, 12, 16
..."
            />

            {importResult && (
              <div className={`mt-2 p-2 rounded text-sm ${
                importResult.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {importResult}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowBulkModal(false);
                  setImportResult(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={handleBulkImport}
                disabled={!bulkImport.trim()}
                className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
