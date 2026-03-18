"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

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
  const [activeTab, setActiveTab] = useState('database');
  const [contributions, setContributions] = useState([]);
  const [contributionStats, setContributionStats] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [loadingContributions, setLoadingContributions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [communityData, setCommunityData] = useState([]);
  const [communityStats, setCommunityStats] = useState({});
  const [loadingCommunity, setLoadingCommunity] = useState(false);

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

  const fetchContributions = async () => {
    setLoadingContributions(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/admin/contributions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setContributions(data.contributions || []);
        setContributionStats(data.stats || {});
      }
    } catch (err) {
      console.error('Failed to fetch contributions:', err);
    } finally {
      setLoadingContributions(false);
    }
  };

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/admin/suggested-services', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const fetchCommunityData = async () => {
    setLoadingCommunity(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/admin/community-data', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommunityData(data.rows || []);
        setCommunityStats(data.stats || {});
      }
    } catch (err) {
      console.error('Failed to fetch community data:', err);
    } finally {
      setLoadingCommunity(false);
    }
  };

  const handleContributionAction = async (id, accepted) => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/admin/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, accepted }),
      });
      if (res.ok) fetchContributions();
    } catch (err) {
      console.error('Failed to update contribution:', err);
    }
  };

  const handleSuggestionAction = async (id, status) => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/admin/suggested-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) fetchSuggestions();
    } catch (err) {
      console.error('Failed to update suggestion:', err);
    }
  };

  // Load tab data when switching tabs
  useEffect(() => {
    if (activeTab === 'contributions' && communityData.length === 0) fetchCommunityData();
    if (activeTab === 'suggestions' && suggestions.length === 0) fetchSuggestions();
  }, [activeTab]);

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
    return <LoadingSpinner message="Loading aircraft database..." />;
  }

  return (
    <div className="min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <div className="max-w-[1600px] mx-auto mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-2xl text-v-text-secondary hover:text-v-text-primary">&larr;</a>
            <h1 className="text-v-text-primary font-heading text-2xl">Aircraft Database</h1>
            <span className="text-sm text-v-text-secondary bg-v-charcoal px-2 py-0.5 rounded-full">
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
              className="px-3 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded-sm hover:bg-green-600/30 disabled:opacity-50 text-sm"
            >
              {seeding ? 'Seeding...' : 'Seed All (220+)'}
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="px-3 py-2 border border-v-border text-v-text-secondary rounded-sm hover:bg-white/5 text-sm"
            >
              Bulk Import
            </button>
            <button
              onClick={openAddModal}
              className="text-v-gold hover:text-v-gold-dim text-sm font-medium border-b border-v-gold/50 hover:border-v-gold transition-colors"
            >
              + Add Aircraft
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-[1600px] mx-auto mb-4">
        <div className="flex gap-1 bg-v-surface border border-v-border rounded-sm p-1">
          {[
            { key: 'database', label: 'Aircraft Database' },
            { key: 'contributions', label: 'Community Data' },
            { key: 'suggestions', label: 'Suggested Services' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
                activeTab === tab.key
                  ? 'bg-v-gold text-v-charcoal'
                  : 'text-v-text-secondary hover:text-v-text-primary hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'database' && (<>
      {/* Filters & Search */}
      <div className="sticky top-0 z-10 bg-v-charcoal pb-4 -mx-4 px-4 border-b border-v-border shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <div className="max-w-[1600px] mx-auto">
        <div className="bg-v-surface border border-v-border rounded-sm p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search aircraft name or model..."
                className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2 pl-9 text-sm placeholder:text-v-text-secondary"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-v-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Category filter */}
            <select
              value={filter.category}
              onChange={(e) => setFilter({ ...filter, category: e.target.value })}
              className="bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm"
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
              className="bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm"
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
                className={`px-3 py-2 rounded-sm text-sm font-medium border transition-colors whitespace-nowrap ${
                  myServicesOnly
                    ? 'bg-v-gold text-white border-v-gold'
                    : 'bg-v-surface text-v-text-secondary border-v-border hover:bg-white/5'
                }`}
              >
                {myServicesOnly ? 'My Services' : 'All Services'}
              </button>
            )}

            {/* Column Picker */}
            <div className="relative" ref={columnPickerRef}>
              <button
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="px-3 py-2 border border-v-border text-v-text-secondary rounded-sm text-sm hover:bg-white/5 flex items-center gap-1 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Columns
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 top-full mt-1 bg-v-surface border border-v-border rounded-sm z-30 w-56 py-2">
                  <div className="px-3 pb-2 mb-2 border-b border-v-border flex justify-between items-center">
                    <span className="text-xs font-semibold text-v-text-secondary uppercase">Hour Columns</span>
                    <button
                      onClick={resetColumns}
                      className="text-xs text-v-gold-dim hover:text-v-gold-dim"
                    >
                      Reset
                    </button>
                  </div>
                  {ALL_SERVICE_COLUMNS.map(col => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-v-border text-v-gold focus:ring-v-gold"
                      />
                      <span className="text-v-text-primary">{col.label}</span>
                      {myServiceHourFields.has(col.key) && (
                        <span className="ml-auto text-xs text-v-gold font-medium">My Svc</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Aircraft Table */}
      <div className="max-w-[1600px] mx-auto">
        <div className="bg-v-surface border border-v-border rounded-sm overflow-hidden">
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-v-charcoal border-b border-v-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-v-text-secondary uppercase sticky top-0 bg-v-charcoal z-20 sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]" style={{ minWidth: 200 }}>
                    Aircraft
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-v-text-secondary uppercase sticky top-0 bg-v-charcoal z-10">
                    Category
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase sticky top-0 bg-v-charcoal z-10">
                    Seats
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase sticky top-0 bg-v-charcoal z-10">
                    Sq Ft
                  </th>
                  {activeColumns.map(col => (
                    <th key={col.key} className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase sticky top-0 bg-v-charcoal z-10 whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-v-text-secondary uppercase sticky top-0 bg-v-charcoal z-10">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {filteredAircraft.length === 0 ? (
                  <tr>
                    <td colSpan={5 + activeColumns.length} className="px-4 py-12 text-center text-v-text-secondary">
                      {search ? 'No aircraft match your search' : 'No aircraft found'}
                    </td>
                  </tr>
                ) : (
                  filteredAircraft.map((ac) => (
                    <tr key={ac.id} className="hover:bg-white/5 group bg-v-surface">
                      <td className="px-4 py-2.5 sticky left-0 bg-v-surface group-hover:bg-white/5 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                        <div className="font-medium text-sm text-v-text-primary">{ac.manufacturer}</div>
                        <div className="text-xs text-v-text-secondary">{ac.model}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-v-charcoal text-v-text-secondary rounded text-xs">
                          {categories.find(c => c.value === ac.category)?.label || ac.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-sm text-v-text-primary">{ac.seats || '-'}</td>
                      <td className="px-3 py-2.5 text-center text-sm text-v-text-primary">
                        {ac.surface_area_sqft ? ac.surface_area_sqft.toLocaleString() : '-'}
                      </td>
                      {activeColumns.map(col => (
                        <td key={col.key} className="px-3 py-2.5 text-center text-sm tabular-nums text-v-text-primary">
                          {getHours(ac, col)}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => openEditModal(ac)}
                          className="text-v-gold hover:underline text-xs mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteAircraft(ac.id)}
                          className="text-red-400 hover:underline text-xs"
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

      </>)}

      {/* Community Data Tab */}
      {activeTab === 'contributions' && (
        <div className="max-w-[1600px] mx-auto">
          {loadingCommunity ? (
            <div className="text-center py-20 text-v-text-secondary">Loading community data...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="bg-v-surface border border-v-border rounded-sm p-4">
                  <p className="text-sm text-v-text-secondary">Total Contributions (12mo)</p>
                  <p className="text-2xl font-bold text-v-text-primary">{communityStats.total_contributions || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-4">
                  <p className="text-sm text-v-text-secondary">Unique Aircraft</p>
                  <p className="text-2xl font-bold text-blue-400">{communityStats.unique_aircraft || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-4">
                  <p className="text-sm text-v-text-secondary">Active Groups (3+ detailers)</p>
                  <p className="text-2xl font-bold text-green-400">{communityStats.active_groups || 0}</p>
                </div>
                <div className="bg-v-surface border border-v-border rounded-sm p-4">
                  <p className="text-sm text-v-text-secondary">Outliers Rejected</p>
                  <p className="text-2xl font-bold text-v-gold">{communityStats.total_outliers || 0}</p>
                </div>
              </div>

              <div className="bg-v-surface border border-v-border rounded-sm p-3 mb-4">
                <div className="flex flex-wrap gap-2 text-xs text-v-text-secondary">
                  <span className="px-2 py-1 bg-v-charcoal rounded">Rolling 12-month window</span>
                  <span className="px-2 py-1 bg-v-charcoal rounded">Recency weighted: 30d=3x, 90d=2x, 365d=1x</span>
                  <span className="px-2 py-1 bg-v-charcoal rounded">Min 3 unique detailers to activate</span>
                  <span className="px-2 py-1 bg-v-charcoal rounded">Outlier: &gt;2x or &lt;0.5x default</span>
                  <span className="px-2 py-1 bg-v-charcoal rounded">Update threshold: &gt;5% variance</span>
                </div>
              </div>

              <div className="bg-v-surface border border-v-border rounded-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-v-charcoal border-b border-v-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-v-text-secondary uppercase">Aircraft</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-v-text-secondary uppercase">Service</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Contributions</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Detailers</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Community Avg</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Platform Default</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Variance</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Outliers</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-v-border">
                      {communityData.length === 0 ? (
                        <tr><td colSpan={10} className="px-4 py-12 text-center text-v-text-secondary">No community data yet. Contributions appear after detailers complete jobs.</td></tr>
                      ) : communityData.map((row, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="px-4 py-2.5">
                            <div className="text-sm text-v-text-primary font-medium">{row.make}</div>
                            <div className="text-xs text-v-text-secondary">{row.model}</div>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-v-text-primary">{row.label}</td>
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums text-v-text-primary">
                            {row.accepted_count}
                            {row.contribution_count !== row.accepted_count && (
                              <span className="text-v-text-secondary text-xs"> /{row.contribution_count}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums">
                            <span className={row.unique_detailers >= 3 ? 'text-green-400' : 'text-v-gold'}>
                              {row.unique_detailers}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums text-v-text-primary font-medium">
                            {row.community_avg > 0 ? row.community_avg.toFixed(1) + 'h' : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums text-v-text-secondary">
                            {row.platform_default > 0 ? row.platform_default.toFixed(1) + 'h' : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums">
                            {row.variance_pct !== null ? (
                              <span className={
                                Math.abs(row.variance_pct) > 20 ? 'text-red-400'
                                : Math.abs(row.variance_pct) > 10 ? 'text-v-gold'
                                : 'text-green-400'
                              }>
                                {row.variance_pct > 0 ? '+' : ''}{row.variance_pct}%
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums">
                            {row.outlier_count > 0 ? (
                              <span className="text-red-400">{row.outlier_count}</span>
                            ) : (
                              <span className="text-v-text-secondary">0</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              row.active
                                ? 'bg-green-900/30 text-green-400 border border-green-600/30'
                                : 'bg-v-gold-muted/30 text-v-gold border border-v-gold-dim/30'
                            }`}>
                              {row.active ? 'Active' : `Need ${3 - row.unique_detailers} more`}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs text-v-text-secondary">
                            {row.last_updated ? new Date(row.last_updated).toLocaleDateString() : 'Never'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Suggested Services Tab */}
      {activeTab === 'suggestions' && (
        <div className="max-w-[1600px] mx-auto">
          {loadingSuggestions ? (
            <div className="text-center py-20 text-v-text-secondary">Loading suggestions...</div>
          ) : (
            <div className="bg-v-surface border border-v-border rounded-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-v-charcoal border-b border-v-border">
                      <th className="px-4 py-3 text-left text-xs font-medium text-v-text-secondary uppercase">Service Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-v-text-secondary uppercase">Aircraft</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Hours</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-v-text-secondary uppercase">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-v-text-secondary uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v-border">
                    {suggestions.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-v-text-secondary">No suggested services yet</td></tr>
                    ) : suggestions.map(s => (
                      <tr key={s.id} className="hover:bg-white/5">
                        <td className="px-4 py-2.5">
                          <div className="text-sm text-v-text-primary font-medium">{s.service_name}</div>
                          <div className="text-xs text-v-text-secondary font-mono">{s.service_key}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-sm text-v-text-primary">{s.make}</div>
                          <div className="text-xs text-v-text-secondary">{s.model}</div>
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm tabular-nums text-v-text-primary">{s.contributed_hrs ? parseFloat(s.contributed_hrs).toFixed(1) : '-'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            s.status === 'approved' ? 'bg-green-900/30 text-green-400 border border-green-600/30'
                            : s.status === 'rejected' ? 'bg-red-900/30 text-red-400 border border-red-600/30'
                            : 'bg-v-gold-muted/30 text-v-gold border border-v-gold-dim/30'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-v-text-secondary">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {s.status === 'pending' && (
                            <>
                              <button onClick={() => handleSuggestionAction(s.id, 'approved')} className="text-green-400 hover:underline text-xs mr-2">Approve</button>
                              <button onClick={() => handleSuggestionAction(s.id, 'rejected')} className="text-red-400 hover:underline text-xs">Reject</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-v-text-primary">
              {editingAircraft ? 'Edit Aircraft' : 'Add Aircraft'}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-v-text-secondary">Manufacturer *</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                    placeholder="Cessna"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-v-text-secondary">Model *</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                    placeholder="Citation CJ3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-v-text-secondary">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-v-text-secondary">Seats</label>
                  <input
                    type="number"
                    value={formData.seats}
                    onChange={(e) => setFormData({ ...formData, seats: e.target.value })}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-v-text-secondary">Wingspan (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.wingspan_ft}
                    onChange={(e) => setFormData({ ...formData, wingspan_ft: e.target.value })}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-v-text-secondary">Length (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.length_ft}
                    onChange={(e) => setFormData({ ...formData, length_ft: e.target.value })}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-v-text-secondary">Height (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.height_ft}
                    onChange={(e) => setFormData({ ...formData, height_ft: e.target.value })}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-v-text-secondary">Surface Area (sqft)</label>
                <input
                  type="number"
                  value={formData.surface_area_sqft}
                  onChange={(e) => setFormData({ ...formData, surface_area_sqft: e.target.value })}
                  className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2"
                />
              </div>

              <div className="border-t border-v-border pt-4">
                <h4 className="text-sm font-semibold text-v-text-secondary mb-3">Service Hours</h4>
                <div className="grid grid-cols-2 gap-3">
                  {ALL_SERVICE_COLUMNS.map(col => (
                    <div key={col.key}>
                      <label className="block text-xs font-medium mb-1 text-v-text-secondary">{col.label}</label>
                      <input
                        type="number"
                        step="0.25"
                        value={formData[col.key]}
                        onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                        className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-1.5 text-sm"
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
                className="px-4 py-2 border border-v-border text-v-text-secondary rounded-sm hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={saveAircraft}
                disabled={saving || !formData.manufacturer || !formData.model}
                className="px-4 py-2 bg-v-gold text-white rounded-sm hover:bg-v-gold-dim disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-6 w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-4 text-v-text-primary">Bulk Import Aircraft</h3>

            <p className="text-sm text-v-text-secondary mb-2">
              Paste aircraft data in CSV format. Each line should have:
            </p>
            <p className="text-xs font-mono bg-v-charcoal text-v-text-secondary p-2 rounded-sm mb-4">
              Manufacturer, Model, Category, Seats, Surface Area, Ext Hours, Int Hours
            </p>

            <textarea
              value={bulkImport}
              onChange={(e) => setBulkImport(e.target.value)}
              className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-2 font-mono text-sm"
              rows={10}
              placeholder="Cessna, Citation CJ3, light_jet, 9, 650, 4, 5
Gulfstream, G650, large_jet, 19, 2400, 12, 16
..."
            />

            {importResult && (
              <div className={`mt-2 p-2 rounded-sm text-sm ${
                importResult.startsWith('Error') ? 'bg-red-900/30 text-red-400 border border-red-600/30' : 'bg-green-900/30 text-green-400 border border-green-600/30'
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
                className="px-4 py-2 border border-v-border text-v-text-secondary rounded-sm hover:bg-white/5"
              >
                Close
              </button>
              <button
                onClick={handleBulkImport}
                disabled={!bulkImport.trim()}
                className="px-4 py-2 bg-v-gold text-white rounded-sm hover:bg-v-gold-dim disabled:opacity-50"
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
