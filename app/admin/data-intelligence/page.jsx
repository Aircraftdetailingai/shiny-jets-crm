"use client";
import { useState, useEffect } from 'react';
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

const HOURS_FIELDS = [
  { value: 'ext_wash_hours', label: 'Exterior Wash' },
  { value: 'int_detail_hours', label: 'Interior Detail' },
  { value: 'leather_hours', label: 'Leather Treatment' },
  { value: 'carpet_hours', label: 'Carpet Cleaning' },
  { value: 'wax_hours', label: 'Wax Application' },
  { value: 'polish_hours', label: 'Polish' },
  { value: 'ceramic_hours', label: 'Ceramic Coating' },
  { value: 'brightwork_hours', label: 'Brightwork' },
  { value: 'decon_hours', label: 'Decontamination' },
  { value: 'spray_ceramic_hours', label: 'Spray Ceramic' },
];

export default function DataIntelligencePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [data, setData] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Raw logs state
  const [rawLogs, setRawLogs] = useState([]);
  const [rawLogsLoading, setRawLogsLoading] = useState(false);
  const [rawLogManufacturer, setRawLogManufacturer] = useState('');
  const [rawLogService, setRawLogService] = useState('');
  const [rawLogManufacturers, setRawLogManufacturers] = useState([]);

  // Filters
  const [category, setCategory] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [hoursField, setHoursField] = useState('');
  const [minSamples, setMinSamples] = useState(3);
  const [varianceThreshold, setVarianceThreshold] = useState(10);

  // Update modal
  const [showModal, setShowModal] = useState(false);
  const [modalItem, setModalItem] = useState(null);
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [updating, setUpdating] = useState(false);
  const [savedFlash, setSavedFlash] = useState('');

  // Bulk update
  const [selectedRows, setSelectedRows] = useState({});
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : '';

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (manufacturer) params.set('manufacturer', manufacturer);
      if (hoursField) params.set('hours_field', hoursField);
      if (minSamples) params.set('min_samples', String(minSamples));

      const res = await fetch(`/api/admin/data-intelligence?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const json = await res.json();
      setStats(json.stats || {});
      setData(json.data || []);
      setSuggestions(json.suggestions || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/hours-history?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setHistory(json.history || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchRawLogs = async () => {
    setRawLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (rawLogManufacturer) params.set('manufacturer', rawLogManufacturer);
      if (rawLogService) params.set('hours_field', rawLogService);
      params.set('limit', '200');

      const res = await fetch(`/api/admin/hours-log?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setRawLogs(json.logs || []);
      setRawLogManufacturers(json.manufacturers || []);
    } catch (err) {
      console.error('Failed to fetch raw logs:', err);
    } finally {
      setRawLogsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'history' && history.length === 0) {
      fetchHistory();
    }
    if (tab === 'logs' && rawLogs.length === 0) {
      fetchRawLogs();
    }
  }, [tab]);

  // Re-fetch when filters change
  useEffect(() => {
    if (!loading) fetchData();
  }, [category, manufacturer, hoursField, minSamples]);

  // Re-fetch raw logs when raw log filters change
  useEffect(() => {
    if (tab === 'logs') fetchRawLogs();
  }, [rawLogManufacturer, rawLogService]);

  // Filter data by configurable variance threshold
  const filteredData = varianceThreshold > 0
    ? data.filter(d => Math.abs(d.variance_percent) >= varianceThreshold)
    : data;

  // Get unique manufacturers from data
  const uniqueManufacturers = [...new Set(data.map(d => d.manufacturer))].sort();

  const openUpdateModal = (item) => {
    setModalItem(item);
    setNewValue(String(item.avg_actual.toFixed(2)));
    setReason('');
    setShowModal(true);
  };

  const handleUpdate = async () => {
    if (!modalItem) return;
    setUpdating(true);
    try {
      const res = await fetch('/api/admin/update-default', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          aircraft_id: modalItem.aircraft_id,
          hours_field: modalItem.hours_field,
          new_value: parseFloat(newValue),
          reason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setSavedFlash('Updated');
        setTimeout(() => setSavedFlash(''), 2000);
        fetchData();
      }
    } catch (err) {
      console.error('Update failed:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkUpdate = async () => {
    const selectedItems = filteredData.filter((_, i) => selectedRows[i]);
    if (selectedItems.length === 0) return;

    setBulkUpdating(true);
    try {
      const updates = selectedItems.map(item => ({
        aircraft_id: item.aircraft_id,
        hours_field: item.hours_field,
        new_value: item.avg_actual,
      }));

      const res = await fetch('/api/admin/update-default', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          updates,
          reason: 'Bulk alignment with field averages',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowBulkModal(false);
        setSelectedRows({});
        setSavedFlash('Updated');
        setTimeout(() => setSavedFlash(''), 2000);
        fetchData();
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
    } finally {
      setBulkUpdating(false);
    }
  };

  const selectAllFlagged = () => {
    const newSelected = {};
    filteredData.forEach((item, i) => {
      if (Math.abs(item.variance_percent) >= varianceThreshold && item.sample_count >= 10) {
        newSelected[i] = true;
      }
    });
    setSelectedRows(newSelected);
  };

  const selectedCount = Object.values(selectedRows).filter(Boolean).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="text-white text-xl">Loading Data Intelligence...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-v-charcoal p-4">
      {savedFlash && (
        <div className="fixed top-4 right-4 z-[100] bg-emerald-500/10 border border-emerald-500/30 text-green-400 text-xs px-3 py-2 rounded shadow-lg">{`✓ ${savedFlash}`}</div>
      )}
      {/* Header */}
      <header className="text-white flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-v-gold">&#8592;</a>
          <div>
            <h1 className="text-2xl font-bold">Data Intelligence</h1>
            <p className="text-sm text-v-text-secondary">Aircraft hours database optimization</p>
          </div>
        </div>
        <div className="space-x-4 text-sm">
          <a href="/admin/aircraft" className="underline text-gray-300 hover:text-white">Aircraft DB</a>
          <a href="/admin/vendors" className="underline text-gray-300 hover:text-white">Vendors</a>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-white/10 rounded-sm p-1 max-w-lg">
        {['overview', 'details', 'logs', 'history'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-v-gold-muted/200 text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            {t === 'logs' ? 'Detailer Logs' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="max-w-5xl space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-v-surface rounded-sm p-4 shadow">
              <p className="text-v-text-secondary text-xs">Total Hours Logged</p>
              <p className="text-2xl font-bold text-v-text-primary">{stats?.total_logs || 0}</p>
            </div>
            <div className="bg-v-surface rounded-sm p-4 shadow">
              <p className="text-v-text-secondary text-xs">Aircraft Covered</p>
              <p className="text-2xl font-bold text-v-gold">{stats?.unique_aircraft || 0}</p>
            </div>
            <div className="bg-v-surface rounded-sm p-4 shadow">
              <p className="text-v-text-secondary text-xs">Detailers Contributing</p>
              <p className="text-2xl font-bold text-v-gold-dim">{stats?.unique_detailers || 0}</p>
            </div>
            <div className="bg-v-surface rounded-sm p-4 shadow">
              <p className="text-v-text-secondary text-xs">Flagged for Review</p>
              <p className="text-2xl font-bold text-red-600">{stats?.flagged_count || 0}</p>
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-v-surface rounded-sm p-6 shadow">
              <h2 className="text-lg font-bold text-v-text-primary mb-4">Smart Suggestions</h2>
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-v-gold-muted/20 rounded-sm border border-v-gold/20">
                    <span className="text-xl" dangerouslySetInnerHTML={{ __html: '&#128161;' }} />
                    <p className="text-sm text-v-gold-muted">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-v-surface rounded-sm p-6 shadow">
            <h2 className="text-lg font-bold text-v-text-primary mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <button
                onClick={() => { setVarianceThreshold(10); setTab('details'); }}
                className="p-4 bg-red-900/20 border border-red-200 rounded-sm text-left hover:bg-red-100 transition-colors"
              >
                <p className="font-medium text-red-900">Review Flagged Items</p>
                <p className="text-xs text-red-700 mt-1">
                  {stats?.flagged_count || 0} items with &gt;10% variance
                </p>
              </button>
              <button
                onClick={() => { setVarianceThreshold(0); setTab('details'); }}
                className="p-4 bg-v-surface border border-v-gold/20 rounded-sm text-left hover:bg-v-gold/10 transition-colors"
              >
                <p className="font-medium text-v-gold">Browse All Data</p>
                <p className="text-xs text-v-gold-dim mt-1">
                  View all aircraft with real data
                </p>
              </button>
              <button
                onClick={() => setTab('logs')}
                className="p-4 bg-v-surface border border-v-gold/20 rounded-sm text-left hover:bg-v-gold/10 transition-colors"
              >
                <p className="font-medium text-v-gold">Detailer Logs</p>
                <p className="text-xs text-v-gold-dim mt-1">
                  Raw hours from all detailers
                </p>
              </button>
              <button
                onClick={() => setTab('history')}
                className="p-4 bg-green-900/20 border border-green-200 rounded-sm text-left hover:bg-green-100 transition-colors"
              >
                <p className="font-medium text-green-900">Update History</p>
                <p className="text-xs text-green-700 mt-1">
                  See all default changes made
                </p>
              </button>
            </div>
          </div>

          {/* Coverage */}
          {data.length > 0 && (
            <div className="bg-v-surface rounded-sm p-6 shadow">
              <h2 className="text-lg font-bold text-v-text-primary mb-4">Data Coverage by Service</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {HOURS_FIELDS.map(hf => {
                  const count = data.filter(d => d.hours_field === hf.value).length;
                  return (
                    <div key={hf.value} className="p-3 bg-v-charcoal rounded-sm text-center">
                      <p className="text-xs text-v-text-secondary">{hf.label}</p>
                      <p className="text-lg font-bold text-v-text-primary">{count}</p>
                      <p className="text-[10px] text-v-text-secondary">aircraft</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details Tab */}
      {tab === 'details' && (
        <div className="max-w-6xl">
          {/* Filters */}
          <div className="bg-v-surface rounded-sm p-4 shadow mb-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">All Categories</option>
                  {categories.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Manufacturer</label>
                <select
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">All Manufacturers</option>
                  {uniqueManufacturers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Service Type</label>
                <select
                  value={hoursField}
                  onChange={(e) => setHoursField(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">All Services</option>
                  {HOURS_FIELDS.map(hf => (
                    <option key={hf.value} value={hf.value}>{hf.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Min Samples</label>
                <input
                  type="number"
                  value={minSamples}
                  onChange={(e) => setMinSamples(parseInt(e.target.value) || 1)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  min={1}
                />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Variance Threshold %</label>
                <input
                  type="number"
                  value={varianceThreshold}
                  onChange={(e) => {
                    setVarianceThreshold(parseInt(e.target.value) || 0);
                    setSelectedRows({});
                  }}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setCategory('');
                    setManufacturer('');
                    setHoursField('');
                    setMinSamples(3);
                    setVarianceThreshold(10);
                    setSelectedRows({});
                  }}
                  className="w-full px-2 py-1.5 text-sm text-v-text-secondary border rounded hover:bg-white/5"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          {filteredData.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAllFlagged}
                  className="text-sm text-v-gold-dim hover:underline"
                >
                  Select All Flagged (10+ samples)
                </button>
                {selectedCount > 0 && (
                  <button
                    onClick={() => setSelectedRows({})}
                    className="text-sm text-v-text-secondary hover:underline"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
              {selectedCount > 0 && (
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="px-4 py-2 bg-v-gold-muted/200 text-white rounded-sm text-sm font-medium hover:bg-v-gold-dim"
                >
                  Bulk Update {selectedCount} Items
                </button>
              )}
            </div>
          )}

          {/* Data Table */}
          <div className="bg-v-surface rounded-sm shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-v-charcoal border-b">
                  <tr>
                    <th className="px-3 py-3 text-left w-8"></th>
                    <th className="px-3 py-3 text-left">Aircraft</th>
                    <th className="px-3 py-3 text-left">Service</th>
                    <th className="px-3 py-3 text-right">Current Default</th>
                    <th className="px-3 py-3 text-right">Avg Actual</th>
                    <th className="px-3 py-3 text-right">Range</th>
                    <th className="px-3 py-3 text-right">Samples</th>
                    <th className="px-3 py-3 text-right">Variance</th>
                    <th className="px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-v-text-secondary">
                        {data.length === 0
                          ? 'No data yet. Hours will appear as detailers complete jobs.'
                          : 'No results match the current filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item, i) => {
                      const absVariance = Math.abs(item.variance_percent);
                      const isOver = item.variance_percent > 0 && absVariance >= varianceThreshold;
                      const isUnder = item.variance_percent < 0 && absVariance >= varianceThreshold;
                      const rowBg = isOver
                        ? 'bg-red-900/20 border-l-4 border-l-red-400'
                        : isUnder
                        ? 'bg-v-gold/5 border-l-4 border-l-v-gold'
                        : '';
                      const lowSamples = item.sample_count < 10;

                      return (
                        <tr key={`${item.aircraft_id}-${item.hours_field}`} className={`${rowBg} ${lowSamples ? 'opacity-60' : ''}`}>
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedRows[i] || false}
                              onChange={() => setSelectedRows(prev => ({ ...prev, [i]: !prev[i] }))}
                              className="rounded text-v-gold"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-medium text-v-text-primary">{item.manufacturer} {item.model}</p>
                            <p className="text-xs text-v-text-secondary">{item.category}</p>
                          </td>
                          <td className="px-3 py-3 text-v-text-secondary">{item.hours_field_label}</td>
                          <td className="px-3 py-3 text-right font-mono">{item.current_default.toFixed(1)}h</td>
                          <td className="px-3 py-3 text-right font-mono font-semibold">{item.avg_actual.toFixed(1)}h</td>
                          <td className="px-3 py-3 text-right text-xs text-v-text-secondary">
                            {item.min_actual.toFixed(1)}-{item.max_actual.toFixed(1)}h
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`${lowSamples ? 'text-v-text-secondary' : 'text-v-text-primary'}`}>
                              {item.sample_count}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-semibold ${
                              item.variance_percent > 10 ? 'text-red-600' : item.variance_percent < -10 ? 'text-v-gold' : 'text-green-600'
                            }`}>
                              {item.variance_percent > 0 ? '+' : ''}{item.variance_percent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => openUpdateModal(item)}
                              className="px-3 py-1 text-xs bg-v-gold-muted/30 text-v-gold rounded hover:bg-v-gold/20 font-medium"
                            >
                              Update Default
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredData.length > 0 && (
              <div className="px-4 py-3 bg-v-charcoal border-t text-sm text-v-text-secondary">
                Showing {filteredData.length} of {data.length} results
                {varianceThreshold > 0 && ` (variance >= ${varianceThreshold}%)`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailer Logs Tab */}
      {tab === 'logs' && (
        <div className="max-w-6xl">
          <div className="bg-v-surface rounded-sm p-4 shadow mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Manufacturer</label>
                <select
                  value={rawLogManufacturer}
                  onChange={(e) => setRawLogManufacturer(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">All Manufacturers</option>
                  {rawLogManufacturers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Service Type</label>
                <select
                  value={rawLogService}
                  onChange={(e) => setRawLogService(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">All Services</option>
                  {HOURS_FIELDS.map(hf => (
                    <option key={hf.value} value={hf.value}>{hf.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={fetchRawLogs}
                  className="w-full px-2 py-1.5 text-sm text-v-gold-dim bg-v-gold-muted/20 border border-v-gold/20 rounded hover:bg-v-gold/10"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="bg-v-surface rounded-sm shadow overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-bold text-v-text-primary">Hours Collected from Detailers</h2>
              <p className="text-sm text-v-text-secondary">Individual service hours logged after job completion</p>
            </div>
            {rawLogsLoading ? (
              <div className="p-8 text-center text-v-text-secondary">Loading detailer logs...</div>
            ) : rawLogs.length === 0 ? (
              <div className="p-8 text-center text-v-text-secondary">No hours logged yet. Data will appear as detailers complete jobs.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-v-charcoal border-b">
                    <tr>
                      <th className="px-3 py-3 text-left">Date</th>
                      <th className="px-3 py-3 text-left">Detailer</th>
                      <th className="px-3 py-3 text-left">Aircraft</th>
                      <th className="px-3 py-3 text-left">Service</th>
                      <th className="px-3 py-3 text-right">Quoted</th>
                      <th className="px-3 py-3 text-right">Actual</th>
                      <th className="px-3 py-3 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rawLogs.map((log) => {
                      const flagged = Math.abs(log.variance_percent) > 10;
                      return (
                        <tr key={log.id} className={flagged ? 'bg-v-gold-muted/20' : 'hover:bg-white/5'}>
                          <td className="px-3 py-3 text-v-text-secondary whitespace-nowrap">
                            {new Date(log.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-3 font-medium text-v-text-primary">{log.detailer_name}</td>
                          <td className="px-3 py-3">
                            <p className="text-v-text-primary">{log.aircraft_manufacturer} {log.aircraft_model}</p>
                          </td>
                          <td className="px-3 py-3 text-v-text-secondary">{log.hours_field_label}</td>
                          <td className="px-3 py-3 text-right font-mono">{parseFloat(log.quoted_hours).toFixed(1)}h</td>
                          <td className="px-3 py-3 text-right font-mono font-semibold">{parseFloat(log.actual_hours).toFixed(1)}h</td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-semibold ${
                              log.variance_percent > 10 ? 'text-red-600' : log.variance_percent < -10 ? 'text-v-gold' : 'text-green-600'
                            }`}>
                              {log.variance_percent > 0 ? '+' : ''}{log.variance_percent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rawLogs.length > 0 && (
              <div className="px-4 py-3 bg-v-charcoal border-t text-sm text-v-text-secondary">
                Showing {rawLogs.length} most recent entries
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="max-w-5xl">
          <div className="bg-v-surface rounded-sm shadow overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-bold text-v-text-primary">Default Hours Update History</h2>
              <p className="text-sm text-v-text-secondary">All changes made to aircraft default hours</p>
            </div>
            {historyLoading ? (
              <div className="p-8 text-center text-v-text-secondary">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-v-text-secondary">No updates have been made yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-v-charcoal border-b">
                    <tr>
                      <th className="px-3 py-3 text-left">Date</th>
                      <th className="px-3 py-3 text-left">Aircraft</th>
                      <th className="px-3 py-3 text-left">Service</th>
                      <th className="px-3 py-3 text-right">Old</th>
                      <th className="px-3 py-3 text-right">New</th>
                      <th className="px-3 py-3 text-left">Reason</th>
                      <th className="px-3 py-3 text-left">Updated By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {history.map((h) => (
                      <tr key={h.id} className="hover:bg-white/5">
                        <td className="px-3 py-3 text-v-text-secondary whitespace-nowrap">
                          {h.created_at ? new Date(h.created_at).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-3 py-3 font-medium text-v-text-primary">{h.aircraft_name || '-'}</td>
                        <td className="px-3 py-3 text-v-text-secondary">{h.hours_field_label}</td>
                        <td className="px-3 py-3 text-right font-mono text-v-text-secondary">
                          {h.old_value != null ? `${parseFloat(h.old_value).toFixed(1)}h` : '-'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-semibold text-v-gold-dim">
                          {h.new_value != null ? `${parseFloat(h.new_value).toFixed(1)}h` : '-'}
                        </td>
                        <td className="px-3 py-3 text-v-text-secondary text-sm max-w-xs truncate">{h.reason || '-'}</td>
                        <td className="px-3 py-3 text-v-text-secondary text-xs">{h.updated_by || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Update Default Modal */}
      {showModal && modalItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface rounded-sm max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-v-text-primary mb-1">Update Default Hours</h3>
            <p className="text-sm text-v-text-secondary mb-4">
              {modalItem.manufacturer} {modalItem.model} - {modalItem.hours_field_label}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-v-charcoal rounded-sm">
                <p className="text-xs text-v-text-secondary">Current Default</p>
                <p className="text-xl font-bold">{modalItem.current_default.toFixed(2)}h</p>
              </div>
              <div className="p-3 bg-v-gold-muted/20 rounded-sm">
                <p className="text-xs text-v-gold-dim">Field Average</p>
                <p className="text-xl font-bold text-v-gold-dim">{modalItem.avg_actual.toFixed(2)}h</p>
              </div>
            </div>

            <div className="text-xs text-v-text-secondary mb-4 space-y-1">
              <p>Sample Size: <strong>{modalItem.sample_count}</strong></p>
              <p>Range: {modalItem.min_actual.toFixed(1)} - {modalItem.max_actual.toFixed(1)}h</p>
              {modalItem.stddev > 0 && <p>Std Deviation: {modalItem.stddev.toFixed(2)}h</p>}
              <p>Variance: <strong className={modalItem.variance_flag === 'over' ? 'text-red-600' : modalItem.variance_flag === 'under' ? 'text-v-gold' : 'text-green-600'}>
                {modalItem.variance_percent > 0 ? '+' : ''}{modalItem.variance_percent.toFixed(1)}%
              </strong></p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-v-text-secondary mb-1">New Default Hours</label>
              <input
                type="number"
                step="0.01"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="w-full border rounded-sm px-3 py-2 focus:ring-2 focus:ring-v-gold"
              />
              <p className="text-xs text-v-text-secondary mt-1">This will affect all users' default pricing for this aircraft.</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Aligned with field average from 47 vector points"
                rows={2}
                className="w-full border rounded-sm px-3 py-2 focus:ring-2 focus:ring-v-gold resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-v-border rounded-sm text-v-text-secondary hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating || !newValue}
                className="flex-1 px-4 py-2 bg-v-gold-muted/200 text-white rounded-sm font-medium hover:bg-v-gold-dim disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Confirm Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface rounded-sm max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-v-text-primary mb-2">Bulk Update Defaults</h3>
            <p className="text-sm text-v-text-secondary mb-4">
              Update {selectedCount} aircraft defaults to their field averages?
            </p>

            <div className="max-h-64 overflow-y-auto mb-4 border rounded-sm divide-y">
              {filteredData.filter((_, i) => selectedRows[i]).map(item => (
                <div key={`${item.aircraft_id}-${item.hours_field}`} className="flex justify-between items-center p-3 text-sm">
                  <div>
                    <p className="font-medium">{item.manufacturer} {item.model}</p>
                    <p className="text-xs text-v-text-secondary">{item.hours_field_label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-v-text-secondary line-through">{item.current_default.toFixed(1)}h</p>
                    <p className="font-semibold text-v-gold-dim">{item.avg_actual.toFixed(1)}h</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-v-gold-muted/20 border border-v-gold/20 rounded-sm p-3 mb-4">
              <p className="text-sm text-v-gold-muted">
                This will update all selected aircraft defaults. All changes are logged and can be reviewed in the History tab.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkModal(false)}
                className="flex-1 px-4 py-2 border border-v-border rounded-sm text-v-text-secondary hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdate}
                disabled={bulkUpdating}
                className="flex-1 px-4 py-2 bg-v-gold-muted/200 text-white rounded-sm font-medium hover:bg-v-gold-dim disabled:opacity-50"
              >
                {bulkUpdating ? 'Updating...' : `Update ${selectedCount} Defaults`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
