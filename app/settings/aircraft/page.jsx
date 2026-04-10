"use client";
import { useState, useEffect } from 'react';

const CATEGORIES = ['Piston', 'Turboprop', 'Jet', 'Warbird', 'Helicopter', 'Other'];

const cls = 'w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50';

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('vector_token');
  return null;
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function CustomAircraftPage() {
  const [customAircraft, setCustomAircraft] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Form state
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [serviceHours, setServiceHours] = useState({});
  const [editingId, setEditingId] = useState(null);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function loadData() {
    setLoading(true);
    try {
      const [acRes, svcRes] = await Promise.all([
        fetch('/api/custom-aircraft', { headers: authHeaders() }),
        fetch('/api/services', { headers: authHeaders() }),
      ]);
      const acData = await acRes.json();
      const svcData = await svcRes.json();
      setCustomAircraft(acData.aircraft || []);
      setServices(svcData.services || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
    setLoading(false);
  }

  function resetForm() {
    setManufacturer('');
    setModel('');
    setCategory('');
    setNotes('');
    setServiceHours({});
    setEditingId(null);
  }

  function startEdit(ac) {
    setEditingId(ac.id);
    setManufacturer(ac.manufacturer);
    setModel(ac.model);
    setCategory(ac.category || '');
    setNotes(ac.notes || '');
    const hrs = {};
    for (const sh of (ac.service_hours || [])) {
      const key = sh.service_id || sh.service_name;
      hrs[key] = sh.hours;
    }
    setServiceHours(hrs);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!manufacturer.trim() || !model.trim()) return;

    setSaving(true);
    try {
      // Build service_hours array
      const shArr = services
        .filter(s => {
          const key = s.id || s.name;
          return serviceHours[key] && parseFloat(serviceHours[key]) > 0;
        })
        .map(s => {
          const key = s.id || s.name;
          return {
            service_id: s.id,
            service_name: s.name,
            hours: parseFloat(serviceHours[key]),
          };
        });

      if (editingId) {
        // Delete old and recreate (simplest approach since there's no PUT)
        await fetch('/api/custom-aircraft', {
          method: 'DELETE',
          headers: authHeaders(),
          body: JSON.stringify({ id: editingId }),
        });
      }

      const res = await fetch('/api/custom-aircraft', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          manufacturer: manufacturer.trim(),
          model: model.trim(),
          category: category || null,
          notes: notes.trim() || null,
          service_hours: shArr,
        }),
      });

      if (res.ok) {
        setToast(editingId ? 'Aircraft updated' : 'Aircraft added');
        resetForm();
        await loadData();
      } else {
        const err = await res.json();
        setToast(err.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Save error:', err);
      setToast('Failed to save');
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    try {
      const res = await fetch('/api/custom-aircraft', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setToast('Aircraft deleted');
        setConfirmDeleteId(null);
        if (editingId === id) resetForm();
        await loadData();
      }
    } catch (err) {
      console.error('Delete error:', err);
      setToast('Failed to delete');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-v-gold text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Custom Aircraft</h2>
        <p className="text-v-text-secondary text-sm mt-1">
          Add aircraft not in the standard database. These are private to your account.
        </p>
      </div>

      {/* Add/Edit Form */}
      <form onSubmit={handleSubmit} className="bg-white/5 border border-v-border rounded-lg p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm">
          {editingId ? 'Edit Aircraft' : 'Add Aircraft'}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-v-text-secondary text-xs mb-1">Manufacturer *</label>
            <input
              type="text"
              value={manufacturer}
              onChange={e => setManufacturer(e.target.value)}
              className={cls}
              placeholder="e.g. Cessna"
              required
            />
          </div>
          <div>
            <label className="block text-v-text-secondary text-xs mb-1">Model *</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              className={cls}
              placeholder="e.g. Citation X"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-v-text-secondary text-xs mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className={cls}
            >
              <option value="">Select category...</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-v-text-secondary text-xs mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={cls}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        {/* Service Hours */}
        {services.length > 0 && (
          <div>
            <label className="block text-v-text-secondary text-xs mb-2">Service Hours</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {services.map(s => {
                const key = s.id || s.name;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-v-text-secondary text-xs flex-1 truncate">{s.name}</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={serviceHours[key] || ''}
                      onChange={e => setServiceHours(prev => ({ ...prev, [key]: e.target.value }))}
                      className={cls + ' !w-20 text-center'}
                      placeholder="hrs"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !manufacturer.trim() || !model.trim()}
            className="bg-v-gold hover:bg-v-gold/90 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Aircraft'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-v-text-secondary hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Aircraft List */}
      {customAircraft.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-white font-semibold text-sm">Your Custom Aircraft ({customAircraft.length})</h3>
          {customAircraft.map(ac => (
            <div key={ac.id} className="bg-white/5 border border-v-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm">
                      {ac.manufacturer} {ac.model}
                    </span>
                    {ac.category && (
                      <span className="text-[10px] uppercase tracking-wider bg-v-gold/20 text-v-gold px-2 py-0.5 rounded-full">
                        {ac.category}
                      </span>
                    )}
                  </div>
                  {ac.notes && (
                    <p className="text-v-text-secondary text-xs mt-1">{ac.notes}</p>
                  )}
                  {ac.service_hours && ac.service_hours.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ac.service_hours.map((sh, i) => (
                        <span key={i} className="text-[11px] text-v-text-secondary bg-white/5 px-2 py-0.5 rounded">
                          {sh.service_name}: {sh.hours}h
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => startEdit(ac)}
                    className="text-v-text-secondary hover:text-v-gold text-xs transition-colors"
                  >
                    Edit
                  </button>
                  {confirmDeleteId === ac.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(ac.id)}
                        className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-v-text-secondary hover:text-white text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(ac.id)}
                      className="text-v-text-secondary hover:text-red-400 text-xs transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {customAircraft.length === 0 && (
        <div className="text-center py-10 text-v-text-secondary text-sm">
          No custom aircraft yet. Use the form above to add one.
        </div>
      )}
    </div>
  );
}
