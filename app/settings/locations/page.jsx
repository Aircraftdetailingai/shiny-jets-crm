"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const LOCATION_TYPES = [
  { value: 'mobile_rig', label: 'Mobile Rig', icon: '🚐' },
  { value: 'hangar', label: 'Hangar', icon: '✈️' },
  { value: 'fbo', label: 'FBO', icon: '🏢' },
  { value: 'repair_station', label: 'Repair Station', icon: '🔧' },
  { value: 'charter', label: 'Charter Operation', icon: '🛩️' },
  { value: 'part_91', label: 'Part 91', icon: '📋' },
  { value: 'shop', label: 'Shop / Warehouse', icon: '🏪' },
  { value: 'other', label: 'Other', icon: '📦' },
];

const TEMPLATES = [
  { label: 'Mobile Operation', description: 'Single mobile rig setup', items: [{ name: 'Mobile Rig', location_type: 'mobile_rig' }] },
  { label: 'Fixed Location', description: 'Hangar or shop-based', items: [{ name: 'Main Hangar', location_type: 'hangar' }] },
  { label: 'Mixed Operation', description: 'Mobile + fixed location', items: [{ name: 'Mobile Rig', location_type: 'mobile_rig' }, { name: 'Main Hangar', location_type: 'hangar' }] },
];

export default function LocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState([]);
  const [limits, setLimits] = useState({ primary: null, secondary: null });
  const [plan, setPlan] = useState('free');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  // Limit-exceeded modal triggered by a 403 from the locations API. tier is
  // 'primary' or 'secondary'; limit is the plan_limits value the server returned.
  const [limitModal, setLimitModal] = useState(null);
  const [formData, setFormData] = useState({
    name: '', location_type: 'other', airport_icao: '', address: '', notes: '', tier: 'secondary',
  });

  const getToken = () => localStorage.getItem('vector_token');

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/locations', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) {
        const data = await res.json();
        setLocations(data.locations || []);
        // Terminal 1 surfaces { limits: { primary, secondary }, plan } on the
        // locations response. Fall back to nulls so the count UI still renders
        // without a limit pill while Terminal 1's deploy catches up.
        if (data.limits) setLimits({ primary: data.limits.primary ?? null, secondary: data.limits.secondary ?? null });
        if (data.plan) setPlan(data.plan);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const openAdd = () => {
    setEditing(null);
    setFormData({ name: '', location_type: 'other', airport_icao: '', address: '', notes: '', tier: 'secondary' });
    setShowModal(true);
  };

  const openEdit = (loc) => {
    setEditing(loc);
    setFormData({
      name: loc.name || '',
      location_type: loc.location_type || 'other',
      airport_icao: loc.airport_icao || '',
      address: loc.address || '',
      notes: loc.notes || '',
      tier: loc.tier || 'secondary',
    });
    setShowModal(true);
  };

  const saveLocation = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { id: editing.id, ...formData } : formData;
      const res = await fetch('/api/locations', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        setLimitModal({
          tier: err.tier || formData.tier,
          limit: err.limit ?? (formData.tier === 'primary' ? limits.primary : limits.secondary),
          plan: err.plan || plan,
        });
        return;
      }
      if (res.ok) {
        await fetchLocations();
        setShowModal(false);
        showToast(editing ? 'Location updated' : 'Location added');
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // Tier toggle from the card. Hits PUT directly so the user doesn't have
  // to open the edit modal just to flip Primary/Secondary. Same 403 path
  // surfaces the limit modal.
  const toggleTier = async (loc) => {
    const nextTier = loc.tier === 'primary' ? 'secondary' : 'primary';
    try {
      const res = await fetch('/api/locations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id: loc.id, tier: nextTier }),
      });
      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        setLimitModal({
          tier: err.tier || nextTier,
          limit: err.limit ?? (nextTier === 'primary' ? limits.primary : limits.secondary),
          plan: err.plan || plan,
        });
        return;
      }
      if (res.ok) {
        await fetchLocations();
        showToast(`Set to ${nextTier}`);
      }
    } catch (e) { console.error(e); }
  };

  const deleteLocation = async (id) => {
    const res = await fetch(`/api/locations?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      setLocations(prev => prev.filter(l => l.id !== id));
      showToast('Location removed');
    }
  };

  const applyTemplate = async (template) => {
    setSaving(true);
    try {
      for (const item of template.items) {
        await fetch('/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(item),
        });
      }
      await fetchLocations();
      showToast(`"${template.label}" template applied`);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const getTypeInfo = (type) => LOCATION_TYPES.find(t => t.value === type) || LOCATION_TYPES[LOCATION_TYPES.length - 1];

  // Counts use airport_icao + tier — we treat any active location with an
  // airport_icao as a directory airport. Counts can legitimately exceed
  // limits on free detailers until 30-day enforcement fires; never crash.
  const primaryCount = locations.filter(l => l.airport_icao && l.tier === 'primary' && l.active !== false).length;
  const secondaryCount = locations.filter(l => l.airport_icao && l.tier === 'secondary' && l.active !== false).length;
  const limitLabel = (count, lim) => (lim == null ? `${count}` : `${count} / ${lim}`);
  const overLimit = (count, lim) => (lim != null && count > lim);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-900/90 border border-green-500/50 text-green-200 px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-center mb-2">
        <div>
          <h2 className="text-xl font-bold text-white">Locations</h2>
          <p className="text-sm text-v-text-secondary">Manage inventory across multiple locations</p>
          <p className="text-xs text-v-text-secondary mt-1">
            Primary airports are your home bases. They rank above secondary airports in the public directory.
          </p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim text-sm font-medium">
          + Add Location
        </button>
      </div>

      {/* Tier counts vs limits */}
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3 text-xs">
        <span className={`px-2.5 py-1 rounded border ${overLimit(primaryCount, limits.primary) ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-v-border bg-v-surface text-v-text-secondary'}`}>
          Primary: <span className="text-white font-medium">{limitLabel(primaryCount, limits.primary)}</span>
        </span>
        <span className={`px-2.5 py-1 rounded border ${overLimit(secondaryCount, limits.secondary) ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-v-border bg-v-surface text-v-text-secondary'}`}>
          Secondary: <span className="text-white font-medium">{limitLabel(secondaryCount, limits.secondary)}</span>
        </span>
      </div>

      {/* Quick templates when no locations exist */}
      {locations.length === 0 && (
        <div className="bg-v-surface border border-v-border/40 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-medium text-white mb-1">Quick Setup</h3>
          <p className="text-xs text-v-text-secondary mb-4">Choose a template to get started quickly</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => applyTemplate(t)}
                disabled={saving}
                className="p-4 bg-v-charcoal border border-v-border rounded-lg hover:border-v-gold hover:bg-v-gold/5 transition-all text-left disabled:opacity-50"
              >
                <p className="font-medium text-white text-sm">{t.label}</p>
                <p className="text-xs text-v-text-secondary mt-1">{t.description}</p>
                <div className="flex gap-1 mt-2">
                  {t.items.map((item, i) => {
                    const info = getTypeInfo(item.location_type);
                    return <span key={i} className="text-xs bg-v-surface px-2 py-0.5 rounded">{info.icon} {item.name}</span>;
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Location cards */}
      <div className="space-y-3">
        {locations.map(loc => {
          const info = getTypeInfo(loc.location_type);
          const tier = loc.tier || 'secondary';
          const isPrimary = tier === 'primary';
          return (
            <div key={loc.id} className="bg-v-surface border border-v-border/40 rounded-lg p-4 hover:border-v-gold/30 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{info.icon}</span>
                  <div className="min-w-0">
                    <h3 className="font-medium text-white">{loc.name}</h3>
                    <p className="text-xs text-v-text-secondary">{info.label}</p>
                    {loc.airport_icao && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded text-[10px] font-mono">
                        {loc.airport_icao}
                      </span>
                    )}
                    {loc.address && <p className="text-xs text-gray-500 mt-1">{loc.address}</p>}
                    {loc.notes && <p className="text-xs text-gray-600 mt-1 italic">{loc.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Tier toggle — only meaningful for airport-bound rows */}
                  {loc.airport_icao && (
                    <button
                      onClick={() => toggleTier(loc)}
                      title={isPrimary ? 'Click to set Secondary' : 'Click to set Primary'}
                      className={`px-2 py-1 text-[10px] uppercase tracking-wider rounded border transition-colors ${
                        isPrimary
                          ? 'border-v-gold/50 bg-v-gold/10 text-v-gold hover:bg-v-gold/20'
                          : 'border-v-border text-v-text-secondary hover:border-v-gold/30 hover:text-v-gold'
                      }`}
                    >
                      {isPrimary ? 'Primary' : 'Secondary'}
                    </button>
                  )}
                  {!loc.active && (
                    <span className="px-2 py-0.5 bg-red-900/30 text-red-400 rounded text-[10px]">Inactive</span>
                  )}
                  <button onClick={() => openEdit(loc)} className="p-1.5 text-v-text-secondary hover:text-blue-400 hover:bg-blue-900/20 rounded text-sm">
                    &#9998;
                  </button>
                  <button onClick={() => deleteLocation(loc.id)} className="p-1.5 text-v-text-secondary hover:text-red-400 hover:bg-red-900/20 rounded text-sm">
                    &#128465;
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {locations.length > 0 && (
        <p className="text-xs text-gray-600 mt-4">
          Assign products and equipment to locations from the Products and Equipment pages.
        </p>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-v-surface border border-v-border rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">{editing ? 'Edit Location' : 'Add Location'}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Name *</label>
                <input
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-v-gold"
                  placeholder="e.g. Main Hangar, Mobile Rig 1"
                />
              </div>

              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {LOCATION_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setFormData(p => ({ ...p, location_type: t.value }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                        formData.location_type === t.value
                          ? 'border-v-gold bg-v-gold/10 text-v-gold'
                          : 'border-v-border text-v-text-secondary hover:border-v-gold/30'
                      }`}
                    >
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Airport ICAO (optional)</label>
                <input
                  value={formData.airport_icao}
                  onChange={e => setFormData(p => ({ ...p, airport_icao: e.target.value.toUpperCase() }))}
                  className="w-full bg-v-charcoal border border-v-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-v-gold font-mono"
                  placeholder="KJFK"
                  maxLength={4}
                />
              </div>

              {/* Tier selection — only meaningful when an airport is set */}
              {formData.airport_icao && (
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">Tier</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['primary', 'secondary'].map(t => (
                      <button
                        key={t}
                        onClick={() => setFormData(p => ({ ...p, tier: t }))}
                        className={`px-3 py-2 rounded-lg border text-sm capitalize transition-all ${
                          formData.tier === t
                            ? 'border-v-gold bg-v-gold/10 text-v-gold'
                            : 'border-v-border text-v-text-secondary hover:border-v-gold/30'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-v-text-secondary mt-1">
                    Primary airports rank above secondary in the public directory.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Address (optional)</label>
                <input
                  value={formData.address}
                  onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-v-gold"
                  placeholder="123 Airport Rd, Hangar B"
                />
              </div>

              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Notes (optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-v-gold resize-none"
                  rows={2}
                  placeholder="Access codes, hours, etc."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5 text-sm">
                Cancel
              </button>
              <button onClick={saveLocation} disabled={saving || !formData.name.trim()} className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add Location'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan limit modal — surfaced on 403 from POST or PUT */}
      {limitModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setLimitModal(null)}>
          <div className="bg-v-surface border border-v-border rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-3">Plan limit reached</h3>
            <p className="text-sm text-v-text-secondary mb-5">
              You&apos;ve reached your <span className="text-white font-medium capitalize">{limitModal.plan}</span> plan limit of <span className="text-white font-medium">{limitModal.limit}</span> {limitModal.tier} airport{limitModal.limit === 1 ? '' : 's'}.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setLimitModal(null)} className="flex-1 px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5 text-sm">
                Cancel
              </button>
              <a
                href="/settings"
                className="flex-1 text-center px-4 py-2 bg-v-gold text-v-charcoal rounded-lg hover:bg-v-gold-dim text-sm font-semibold"
              >
                Upgrade plan
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
